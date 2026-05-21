import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { IconUpload, IconAlertTriangle, IconCheck, IconX, IconLoader2 } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { VERZEKERAARS, VERZEKERAAR_KEYS, type VerzekeraarKey } from "@/lib/insurers";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { formatSupabaseError } from "@/lib/supabase-error";

export const Route = createFileRoute("/_authenticated/excel-import")({
  component: ExcelImportPage,
});

// ===================== Helpers =====================

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * Returns a positive finite number, or null for null / undefined / empty
 * string / 0 / negatives / non-numeric strings / formula artefacts.
 * Never coerce null via Number() — that returns 0 and pollutes data.
 */
function parsePositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (s.startsWith("=") || s.startsWith("#")) return null; // formula or #REF!/#N/A
  // tolerate "1.234,56" and "1,234.56"
  const cleaned = s
    .replace(/\s|€|EUR/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ===================== Sheet classification =====================

type SheetKind = "prijs_catalogus" | "glas_calculator" | "genegeerd" | "onbekend";

type ImportRow = {
  code: string;
  omschrijving: string;
  opmerking: string | null;
  eenheid: string;
  basisprijs: number;
};

type SkippedCounts = { rubriek: number; leeg: number; formule: number };

type Mapping = {
  code: number;
  omschrijving: number;
  opmerking: number | null;
  eenheid: number;
  prijs: number;
};

type ClassifiedSheet = {
  sheetName: string;
  kind: SheetKind;
  reason: string;
  headerRow: number | null;       // 0-indexed
  rawHeaders: string[];           // raw header cells
  mapping: Mapping | null;
  rows: ImportRow[];
  skipped: SkippedCounts;
  abexCandidate: number | null;
  preview: string[][];            // first 5 imported rows as strings
};

function findHeaderRow(rawRows: unknown[][]): number | null {
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = (rawRows[i] ?? []).map(norm);
    const hasOmschrijving = row.some((c) => c === "omschrijving");
    const hasPrijs = row.some((c) => c === "prijs" || c === "prijs/prix" || c === "prix");
    if (hasOmschrijving && hasPrijs) return i;
  }
  return null;
}

function detectAbex(rawRows: unknown[][]): number | null {
  for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
    const row = rawRows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]).includes("abex")) {
        // Take the next non-empty cell to the right
        for (let nc = c + 1; nc < row.length; nc++) {
          const n = parsePositiveNumber(row[nc]);
          if (n !== null && n >= 100 && n <= 5000) return Math.round(n);
        }
      }
    }
  }
  return null;
}

function buildMapping(headerCells: unknown[]): Mapping | null {
  const find = (predicate: (h: string) => boolean): number => {
    for (let i = 0; i < headerCells.length; i++) {
      if (predicate(norm(headerCells[i]))) return i;
    }
    return -1;
  };
  const code = find((h) => h === "code");
  const omschrijving = find((h) => h === "omschrijving");
  const opmerkingIdx = find((h) => h === "opmerking");
  const eenheid = find((h) => h === "eenheid/unité" || h === "eenheid" || h === "eenheid/unite");
  // first "Prijs/Prix" or "Prijs" — skip any later duplicates.
  const prijs = find((h) => h === "prijs/prix" || h === "prijs" || h === "prix");
  if (code < 0 || omschrijving < 0 || eenheid < 0 || prijs < 0) return null;
  return {
    code,
    omschrijving,
    opmerking: opmerkingIdx >= 0 ? opmerkingIdx : null,
    eenheid,
    prijs,
  };
}

function classifySheet(sheetName: string, rawRows: unknown[][]): ClassifiedSheet {
  const nameNorm = norm(sheetName);

  // Ignored sheets
  if (sheetName === "Backup" || sheetName === "TEMPLATE") {
    return emptyClassified(sheetName, "genegeerd", `Tabblad "${sheetName}" wordt genegeerd.`, rawRows);
  }

  // Glas calculator detection
  const flatNorm = rawRows
    .slice(0, 25)
    .flatMap((r) => (r ?? []).map(norm))
    .join("|");
  const isGlas =
    nameNorm.includes("glas") ||
    flatNorm.includes("lengte") &&
      flatNorm.includes("breedte") &&
      (flatNorm.includes("dikte glas") || flatNorm.includes("kostprijs glas"));
  if (isGlas) {
    return emptyClassified(
      sheetName,
      "glas_calculator",
      "Glasberekening — apart te verwerken.",
      rawRows,
    );
  }

  const headerIdx = findHeaderRow(rawRows);
  if (headerIdx === null) {
    return emptyClassified(sheetName, "onbekend", "Geen prijstabel-koprij gevonden.", rawRows);
  }
  const headerCells = rawRows[headerIdx] ?? [];
  const mapping = buildMapping(headerCells);
  if (!mapping) {
    return emptyClassified(
      sheetName,
      "onbekend",
      'Vereiste kolommen "Code", "Omschrijving", "Eenheid/Unité" of "Prijs/Prix" niet allemaal gevonden.',
      rawRows,
    );
  }

  const skipped: SkippedCounts = { rubriek: 0, leeg: 0, formule: 0 };
  const rows: ImportRow[] = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i] ?? [];
    const cells = r.map((c) => (typeof c === "string" ? c.trim() : c));
    const allEmpty = cells.every((c) => c === null || c === undefined || c === "");
    if (allEmpty) {
      skipped.leeg++;
      continue;
    }
    const hasFormulaArtefact = cells.some(
      (c) => typeof c === "string" && (c.startsWith("=") || c.startsWith("#")),
    );
    const code = String(cells[mapping.code] ?? "").trim();
    const omschrijving = String(cells[mapping.omschrijving] ?? "").trim();
    const eenheid = String(cells[mapping.eenheid] ?? "").trim();
    const prijs = parsePositiveNumber(cells[mapping.prijs]);

    if (omschrijving && (!eenheid || prijs === null) && !code) {
      skipped.rubriek++;
      continue;
    }
    if (hasFormulaArtefact && (prijs === null || !code)) {
      skipped.formule++;
      continue;
    }
    if (!code || !omschrijving || !eenheid || prijs === null) {
      // category-like or partial row
      if (omschrijving && (!eenheid || prijs === null)) skipped.rubriek++;
      else skipped.leeg++;
      continue;
    }
    const opmerking =
      mapping.opmerking !== null ? String(cells[mapping.opmerking] ?? "").trim() : "";
    rows.push({
      code,
      omschrijving,
      opmerking: opmerking || null,
      eenheid,
      basisprijs: prijs,
    });
  }

  if (rows.length < 10) {
    return {
      sheetName,
      kind: "onbekend",
      reason: `Slechts ${rows.length} geldige rij(en) gevonden — minder dan 10.`,
      headerRow: headerIdx,
      rawHeaders: headerCells.map((c) => String(c ?? "")),
      mapping,
      rows: [],
      skipped,
      abexCandidate: detectAbex(rawRows),
      preview: [],
    };
  }

  return {
    sheetName,
    kind: "prijs_catalogus",
    reason: `${rows.length} geldige rijen, koprij op regel ${headerIdx + 1}.`,
    headerRow: headerIdx,
    rawHeaders: headerCells.map((c) => String(c ?? "")),
    mapping,
    rows,
    skipped,
    abexCandidate: detectAbex(rawRows),
    preview: rows.slice(0, 5).map((r) => [
      r.code,
      r.omschrijving,
      r.opmerking ?? "",
      r.eenheid,
      r.basisprijs.toFixed(2),
    ]),
  };
}

function emptyClassified(
  sheetName: string,
  kind: SheetKind,
  reason: string,
  rawRows: unknown[][],
): ClassifiedSheet {
  return {
    sheetName,
    kind,
    reason,
    headerRow: null,
    rawHeaders: [],
    mapping: null,
    rows: [],
    skipped: { rubriek: 0, leeg: 0, formule: 0 },
    abexCandidate: detectAbex(rawRows),
    preview: [],
  };
}

function parseWorkbook(wb: XLSX.WorkBook): ClassifiedSheet[] {
  return wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    return classifySheet(sheetName, rawRows);
  });
}

// ===================== UI =====================

const KIND_BADGES: Record<SheetKind, { label: string; cls: string }> = {
  prijs_catalogus: {
    label: "Prijscatalogus",
    cls: "bg-status-green-bg text-status-green-fg border-status-green-fg/30",
  },
  glas_calculator: {
    label: "Glasberekening — apart te verwerken",
    cls: "bg-primary-light text-primary-dark border-primary/30",
  },
  genegeerd: {
    label: "Genegeerd",
    cls: "bg-secondary text-text-muted border-border",
  },
  onbekend: {
    label: "Niet importeerbaar",
    cls: "bg-secondary text-text-muted border-border",
  },
};

function ExcelImportPage() {
  const qc = useQueryClient();
  const session = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [sheets, setSheets] = useState<ClassifiedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [abexValue, setAbexValue] = useState<number | "">("");
  const [abexAutoDetected, setAbexAutoDetected] = useState<number | null>(null);
  const [abexManual, setAbexManual] = useState(false);
  const [verzekeraar, setVerzekeraar] = useState<VerzekeraarKey>("baloise");
  const [geldigVan, setGeldigVan] = useState(new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const history = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("aangemaakt_op", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setSheets([]);
    setFilename(null);
    setActiveSheet(null);
    setAbexValue("");
    setAbexAutoDetected(null);
    setAbexManual(false);
    setErrorBanner(null);
    setSuccessBanner(null);
  };

  const handleFile = useCallback(async (file: File) => {
    setErrorBanner(null);
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      toast.error("Alleen .xlsx of .xlsm bestanden zijn toegestaan.");
      return;
    }
    setParsing(true);
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const parsed = parseWorkbook(wb);
      setSheets(parsed);
      const importable = parsed.find((p) => p.kind === "prijs_catalogus");
      setActiveSheet(importable?.sheetName ?? parsed[0]?.sheetName ?? null);
      const detected =
        parsed.find((p) => p.abexCandidate !== null)?.abexCandidate ?? null;
      setAbexAutoDetected(detected);
      setAbexValue(detected ?? "");
      setAbexManual(false);
    } catch (e) {
      toast.error("Kon het bestand niet lezen: " + (e as Error).message);
    } finally {
      setParsing(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const sheet = sheets.find((s) => s.sheetName === activeSheet) ?? null;
  const canImport =
    !!sheet &&
    sheet.kind === "prijs_catalogus" &&
    sheet.rows.length > 0 &&
    abexValue !== "" &&
    !importing;

  const doImport = async () => {
    if (!sheet || !filename || sheet.kind !== "prijs_catalogus") return;
    setImporting(true);
    setErrorBanner(null);
    let batchId: string | null = null;
    try {
      // 1. Create a pending batch
      const { data: batch, error: batchErr } = await supabase
        .from("import_batches")
        .insert({
          verzekeraar,
          geldig_van: geldigVan,
          abex_basisindex: Number(abexValue),
          bron_bestand: filename,
          status: "pending",
          aangemaakt_door: session.userId,
          aangemaakt_door_naam: session.displayName,
        })
        .select("id")
        .single();
      if (batchErr || !batch) throw batchErr ?? new Error("Kon batch niet aanmaken");
      batchId = batch.id;

      // 2. Insert all referentieprijzen tied to this batch
      const inserts = sheet.rows.map((r) => ({
        verzekeraar,
        code: r.code,
        omschrijving: r.omschrijving,
        opmerking: r.opmerking,
        eenheid: r.eenheid,
        basisprijs: r.basisprijs,
        abex_basisindex: Number(abexValue),
        geldig_van: geldigVan,
        bron_bestand: filename,
        batch_id: batchId,
      }));

      const chunkSize = 500;
      for (let i = 0; i < inserts.length; i += chunkSize) {
        const { error } = await supabase
          .from("referentieprijzen")
          .insert(inserts.slice(i, i + chunkSize));
        if (error) throw error;
      }

      // 3. Deactivate previous active batch, then activate this one.
      await supabase
        .from("import_batches")
        .update({ status: "superseded" })
        .eq("verzekeraar", verzekeraar)
        .eq("status", "active");

      const { error: actErr } = await supabase
        .from("import_batches")
        .update({ status: "active" })
        .eq("id", batchId);
      if (actErr) throw actErr;

      await supabase.from("audit_log").insert({
        actie: "referentieprijzen_import",
        uitgevoerd_door: session.userId,
        detail_json: {
          batch_id: batchId,
          filename,
          verzekeraar,
          geldig_van: geldigVan,
          abex_basisindex: Number(abexValue),
          imported: inserts.length,
          skipped: sheet.skipped,
          sheet: sheet.sheetName,
        },
      });

      const shortId = String(batchId).slice(0, 8);
      setSuccessBanner(
        `Import geslaagd — ${inserts.length} prijsregels opgeslagen voor ${VERZEKERAARS[verzekeraar].name} (batch ${shortId}).`,
      );
      toast.success(`${inserts.length} prijsregels geïmporteerd.`);
      setSheets([]);
      setFilename(null);
      setActiveSheet(null);
      setAbexValue("");
      setAbexAutoDetected(null);
      setAbexManual(false);
      await qc.invalidateQueries({ queryKey: ["import-batches"] });
    } catch (e) {
      // 4. Mark batch as failed; previous active batch stays untouched if we never reached step 3.
      if (batchId) {
        await supabase.from("import_batches").update({ status: "failed" }).eq("id", batchId);
        await supabase.from("referentieprijzen").delete().eq("batch_id", batchId);
      }
      const msg = formatSupabaseError(e);
      setErrorBanner(`Import mislukt — vorige prijslijst blijft actief. ${msg}`);
      toast.error("Import mislukt: " + msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Topbar title="Excel import" subtitle="Importeer referentieprijzen vanuit Baloise-prijsbestand" />

      {successBanner && (
        <div className="mb-4 rounded-md border-[0.5px] border-status-green-fg/40 bg-status-green-bg text-status-green-fg px-3 py-2 text-[12px] flex items-center gap-2">
          <IconCheck size={14} />
          <span>{successBanner}</span>
        </div>
      )}

      {sheets.length === 0 && (
        <Card>
          <SectionHeading>Bestand kiezen</SectionHeading>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-[0.5px] border-dashed rounded-md p-12 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary-light" : "border-border bg-secondary/40"
            }`}
          >
            <IconUpload size={28} className="mx-auto mb-2 text-text-muted" />
            <div className="text-[14px] text-foreground">
              {parsing ? "Bestand verwerken…" : "Sleep het Baloise-prijsbestand hier naartoe"}
            </div>
            <div className="text-[12px] text-text-muted mt-1">Alleen .xlsx of .xlsm</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </div>
        </Card>
      )}

      {sheets.length > 0 && (
        <>
          {errorBanner && (
            <div className="mb-4 rounded-md border-[0.5px] border-status-red-fg/40 bg-status-red-bg text-status-red-fg px-3 py-2 text-[12px]">
              {errorBanner}
            </div>
          )}

          <Card className="mb-4">
            <SectionHeading>Importanalyse — {filename}</SectionHeading>
            <div className="flex flex-col gap-1.5">
              {sheets.map((s) => {
                const chipCls =
                  s.kind === "prijs_catalogus"
                    ? "bg-status-green-bg text-status-green-fg border-status-green-fg/30"
                    : s.kind === "glas_calculator"
                      ? "bg-primary-light text-primary-dark border-primary/30"
                      : "bg-secondary text-text-muted border-border";
                const chipLabel =
                  s.kind === "prijs_catalogus"
                    ? "Prijscatalogus — importeerbaar"
                    : s.kind === "glas_calculator"
                      ? "Glasberekening — later beschikbaar"
                      : s.kind === "genegeerd"
                        ? "Genegeerd"
                        : "Niet importeerbaar";
                return (
                  <div
                    key={s.sheetName}
                    className="flex items-center justify-between gap-3 py-1.5 border-b-[0.5px] border-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[13px] font-medium truncate">{s.sheetName}</span>
                      <span className="text-[11px] text-text-muted truncate">{s.reason}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border-[0.5px] whitespace-nowrap ${chipCls}`}>
                      {chipLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="mb-4">
            <SectionHeading>Tabbladen</SectionHeading>
            <div className="flex gap-1.5 flex-wrap">
              {sheets.map((s) => {
                const badge = KIND_BADGES[s.kind];
                const isActive = s.sheetName === activeSheet;
                return (
                  <button
                    key={s.sheetName}
                    onClick={() => setActiveSheet(s.sheetName)}
                    className={`px-3 py-1.5 rounded-md text-[12px] border-[0.5px] flex items-center gap-2 ${
                      isActive ? "ring-1 ring-primary" : ""
                    } ${badge.cls}`}
                    title={s.reason}
                  >
                    <span className="font-medium">{s.sheetName}</span>
                    <span className="opacity-70">· {badge.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>


          {sheet && sheet.kind === "prijs_catalogus" && sheet.mapping && (
            <>
              <Card className="mb-4">
                <SectionHeading>Validatie</SectionHeading>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.5px] text-text-secondary mb-2">
                      Kolommapping
                    </div>
                    <MappingRow label="Code" header={sheet.rawHeaders[sheet.mapping.code]} ok />
                    <MappingRow label="Omschrijving" header={sheet.rawHeaders[sheet.mapping.omschrijving]} ok />
                    <MappingRow
                      label="Opmerking"
                      header={sheet.mapping.opmerking !== null ? sheet.rawHeaders[sheet.mapping.opmerking] : "—"}
                      ok={sheet.mapping.opmerking !== null}
                      optional
                    />
                    <MappingRow label="Eenheid" header={sheet.rawHeaders[sheet.mapping.eenheid]} ok />
                    <MappingRow label="Basisprijs" header={sheet.rawHeaders[sheet.mapping.prijs]} ok />
                    <div className="mt-3 text-[11px] text-text-muted">
                      Genegeerde kolommen: Description, Remarque, Aantal, Totaal, tweede Prijs, lege eerste kolom.
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-[0.5px] text-text-secondary mb-2">
                      Importinstellingen
                    </div>
                    <div className="flex flex-col gap-3">
                      <Field label="Verzekeraar">
                        <select
                          className="w-full px-3 py-2 text-[13px] bg-secondary rounded-md border-[0.5px] border-border"
                          value={verzekeraar}
                          onChange={(e) => setVerzekeraar(e.target.value as VerzekeraarKey)}
                        >
                          {VERZEKERAAR_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {VERZEKERAARS[k].name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Geldig vanaf">
                        <input
                          type="date"
                          className="w-full px-3 py-2 text-[13px] bg-secondary rounded-md border-[0.5px] border-border"
                          value={geldigVan}
                          onChange={(e) => setGeldigVan(e.target.value)}
                        />
                      </Field>
                      <Field
                        label={
                          abexManual
                            ? "ABEX Basisindex (handmatig ingevoerd)"
                            : abexAutoDetected !== null
                              ? `ABEX Basisindex (automatisch gedetecteerd: ${abexAutoDetected})`
                              : "ABEX Basisindex (niet gevonden — vul handmatig in)"
                        }
                      >
                        <input
                          type="number"
                          className="w-full px-3 py-2 text-[13px] bg-secondary rounded-md border-[0.5px] border-border"
                          value={abexValue}
                          onChange={(e) => {
                            const v = e.target.value === "" ? "" : Number(e.target.value);
                            setAbexValue(v);
                            setAbexManual(v !== abexAutoDetected);
                          }}
                          placeholder="bv. 1048"
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="mb-4">
                <SectionHeading>
                  Importpreview — {sheet.rows.length} prijsregels (eerste 30 getoond)
                </SectionHeading>
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto border-[0.5px] border-border rounded-md">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-secondary">
                      <tr className="text-left text-text-secondary uppercase tracking-[0.5px] text-[11px] border-b-[0.5px] border-border">
                        <th className="py-2 px-3 font-medium">Code</th>
                        <th className="py-2 px-3 font-medium">Omschrijving</th>
                        <th className="py-2 px-3 font-medium">Opmerking</th>
                        <th className="py-2 px-3 font-medium">Eenheid</th>
                        <th className="py-2 px-3 font-medium text-right">Basisprijs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.slice(0, 30).map((r, i) => (
                        <tr key={i} className="border-b-[0.5px] border-border last:border-0">
                          <td className="py-1.5 px-3 text-text-secondary">{r.code}</td>
                          <td className="py-1.5 px-3">{r.omschrijving}</td>
                          <td className="py-1.5 px-3 text-text-muted">{r.opmerking ?? ""}</td>
                          <td className="py-1.5 px-3 text-text-secondary">{r.eenheid}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">
                            {r.basisprijs.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="mb-4">
                <SectionHeading>Samenvatting</SectionHeading>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
                  <SummaryRow
                    label="Gelezen rijen"
                    value={String(
                      sheet.rows.length +
                        sheet.skipped.rubriek +
                        sheet.skipped.leeg +
                        sheet.skipped.formule,
                    )}
                  />
                  <SummaryRow
                    label="Importeerbare prijsregels"
                    value={String(sheet.rows.length)}
                    strong
                  />
                  <SummaryRow
                    label="Overgeslagen rubrieken"
                    value={String(sheet.skipped.rubriek)}
                  />
                  <SummaryRow
                    label="Overgeslagen lege regels"
                    value={String(sheet.skipped.leeg)}
                  />
                  <SummaryRow
                    label="Overgeslagen formule-rijen"
                    value={String(sheet.skipped.formule)}
                  />
                  <SummaryRow
                    label="ABEX basisindex"
                    value={
                      abexValue === ""
                        ? "—"
                        : abexAutoDetected !== null && !abexManual
                          ? `${abexValue} (automatisch gedetecteerd)`
                          : `${abexValue} (handmatig)`
                    }
                  />
                  <SummaryRow
                    label="Genegeerde FR-kolommen"
                    value="Description, Remarque"
                  />
                  <SummaryRow
                    label="Genegeerde tabbladen"
                    value={
                      sheets
                        .filter((s) => s.kind === "glas_calculator" || s.kind === "genegeerd")
                        .map((s) =>
                          s.kind === "glas_calculator"
                            ? `${s.sheetName} (glasberekening)`
                            : s.sheetName,
                        )
                        .join(", ") || "—"
                    }
                  />
                </dl>
              </Card>

              <div className="flex items-center gap-3 mb-6">
                <PrimaryButton onClick={doImport} disabled={!canImport}>
                  {importing ? (
                    <span className="inline-flex items-center gap-2">
                      <IconLoader2 size={14} className="animate-spin" />
                      Importeren…
                    </span>
                  ) : (
                    `Importeer ${sheet.rows.length} prijsregels`
                  )}
                </PrimaryButton>
                <button
                  onClick={reset}
                  disabled={importing}
                  className="text-[13px] text-text-secondary hover:text-foreground disabled:opacity-50"
                >
                  Annuleren
                </button>
              </div>

            </>
          )}

          {sheet && sheet.kind !== "prijs_catalogus" && (
            <Card className="mb-4">
              <div className="flex items-start gap-3 text-[13px]">
                <IconAlertTriangle size={16} className="mt-0.5 text-text-muted flex-shrink-0" />
                <div>
                  <div className="font-medium">{KIND_BADGES[sheet.kind].label}</div>
                  <div className="text-text-secondary">{sheet.reason}</div>
                  <div className="text-text-muted mt-1">
                    Kies een ander tabblad hierboven om te importeren.
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <button onClick={reset} className="text-[13px] text-text-secondary hover:text-foreground">
                  Annuleren en ander bestand kiezen
                </button>
              </div>
            </Card>
          )}
        </>
      )}

      <Card>
        <SectionHeading>Recente imports</SectionHeading>
        {history.data && history.data.length > 0 ? (
          <div>
            <div className="grid grid-cols-[2fr_1fr_0.8fr_0.9fr_1fr_1fr] gap-2 px-3 py-2 bg-secondary rounded-md text-[11px] font-medium text-text-secondary uppercase tracking-[0.5px] mb-1">
              <span>Bestand</span>
              <span>Verzekeraar</span>
              <span className="text-right">Prijsregels</span>
              <span>Status</span>
              <span>Door</span>
              <span>Datum</span>
            </div>
            {history.data.map((b) => (
              <div
                key={b.id}
                className="grid grid-cols-[2fr_1fr_0.8fr_0.9fr_1fr_1fr] gap-2 px-3 py-2.5 text-[13px] border-b-[0.5px] border-border items-center"
              >
                <span className="truncate" title={b.bron_bestand ?? ""}>{b.bron_bestand ?? "—"}</span>
                <span className="text-text-secondary">
                  {VERZEKERAARS[(b.verzekeraar as VerzekeraarKey) ?? "baloise"]?.name ?? String(b.verzekeraar ?? "—")}
                </span>
                <BatchRowCount batchId={b.id as string} />
                <StatusPill status={b.status as string} />
                <span className="text-text-secondary truncate" title={(b.aangemaakt_door_naam as string) ?? ""}>
                  {(b.aangemaakt_door_naam as string) ?? "—"}
                </span>
                <span className="text-text-muted text-[12px]">{formatDate(b.aangemaakt_op as string)}</span>
              </div>
            ))}

          </div>
        ) : (
          <p className="text-[13px] text-text-muted">Nog geen imports.</p>
        )}
      </Card>
    </>
  );
}

function MappingRow({
  label,
  header,
  ok,
  optional,
}: {
  label: string;
  header: string | undefined;
  ok: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[13px] border-b-[0.5px] border-border py-1.5">
      <span className="text-text-secondary">
        {label}
        {optional && <span className="text-text-muted text-[11px] ml-1">(optioneel)</span>}
      </span>
      {ok ? (
        <span className="flex items-center gap-1.5 text-status-green-fg">
          <IconCheck size={14} />
          <span className="font-medium">{header || "—"}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-text-muted">
          <IconX size={14} />
          <span>niet gevonden</span>
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-status-green-bg text-status-green-fg",
    pending: "bg-primary-light text-primary-dark",
    failed: "bg-status-red-bg text-status-red-fg",
    superseded: "bg-secondary text-text-muted",
  };
  const label: Record<string, string> = {
    active: "Actief",
    pending: "Bezig",
    failed: "Mislukt",
    superseded: "Vervangen",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] ?? "bg-secondary text-text-muted"}`}>
      {label[status] ?? status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-secondary uppercase tracking-[0.5px]">{label}</span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b-[0.5px] border-border py-1.5 last:border-0">
      <dt className="text-text-secondary text-[12px]">{label}</dt>
      <dd className={`tabular-nums text-right ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}

function BatchRowCount({ batchId }: { batchId: string }) {
  const { data } = useQuery({
    queryKey: ["batch-count", batchId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("referentieprijzen")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", batchId);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return (
    <span className="text-right tabular-nums text-text-secondary">
      {data === undefined ? "…" : `${data} regels`}
    </span>
  );
}
