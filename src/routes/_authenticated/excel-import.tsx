import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { IconUpload, IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { VERZEKERAARS, VERZEKERAAR_KEYS, type VerzekeraarKey } from "@/lib/insurers";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/excel-import")({
  component: ExcelImportPage,
});

type FieldKey = "omschrijving" | "eenheidsprijs" | "eenheid" | "categorie";

const FIELD_DEFS: { key: FieldKey; label: string; required: boolean; matches: string[] }[] = [
  { key: "omschrijving", label: "Omschrijving", required: true, matches: ["omschrijving", "beschrijving", "description"] },
  { key: "eenheidsprijs", label: "Eenheidsprijs", required: true, matches: ["eenheidsprijs", "prijs", "price", "unit price"] },
  { key: "eenheid", label: "Eenheid", required: false, matches: ["eenheid", "unit"] },
  { key: "categorie", label: "Categorie", required: false, matches: ["categorie", "category", "groep"] },
];

type SheetParse = {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  mapping: Partial<Record<FieldKey, string>>;
  abexCandidate: number | null;
};

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function detectMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const m: Partial<Record<FieldKey, string>> = {};
  for (const f of FIELD_DEFS) {
    const found = headers.find((h) => f.matches.some((kw) => norm(h).includes(kw)));
    if (found) m[f.key] = found;
  }
  return m;
}

function detectAbex(rowsRaw: unknown[][]): number | null {
  for (let r = 0; r < Math.min(rowsRaw.length, 30); r++) {
    const row = rowsRaw[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = norm(row[c]);
      if (cell.includes("abex") || cell.includes("index")) {
        // scan neighbours
        for (const nr of [r, r + 1, r - 1]) {
          const nrow = rowsRaw[nr] ?? [];
          for (let nc = Math.max(0, c - 2); nc <= c + 4; nc++) {
            const v = Number(nrow[nc]);
            if (Number.isFinite(v) && v >= 800 && v <= 1100) return v;
          }
        }
      }
    }
  }
  return null;
}

function parseWorkbook(wb: XLSX.WorkBook): SheetParse[] {
  return wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];
    // Find best header row: row with most string cells that match any known keyword
    let headerIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const row = rawRows[i] ?? [];
      const score = row.reduce<number>((acc, cell) => {
        const n = norm(cell);
        if (!n) return acc;
        const hit = FIELD_DEFS.some((f) => f.matches.some((kw) => n.includes(kw)));
        return acc + (hit ? 1 : 0);
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
      }
    }
    let headers: string[] = [];
    let rows: Record<string, unknown>[] = [];
    if (headerIdx >= 0) {
      headers = (rawRows[headerIdx] ?? []).map((h, i) => String(h ?? `col_${i}`).trim());
      rows = rawRows.slice(headerIdx + 1).map((r) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => (obj[h] = r?.[i] ?? null));
        return obj;
      });
    }
    const mapping = detectMapping(headers);
    const abexCandidate = detectAbex(rawRows);
    return { sheetName, headers, rows, mapping, abexCandidate };
  });
}

function ExcelImportPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [sheets, setSheets] = useState<SheetParse[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [abexValue, setAbexValue] = useState<number | "">("");
  const [verzekeraar, setVerzekeraar] = useState<VerzekeraarKey>("baloise");
  const [geldigVan, setGeldigVan] = useState(new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const history = useQuery({
    queryKey: ["import-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, actie, timestamp, detail_json")
        .eq("actie", "referentieprijzen_import")
        .order("timestamp", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleFile = useCallback(async (file: File) => {
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
      const best = parsed.find((p) => p.mapping.omschrijving && p.mapping.eenheidsprijs) ?? parsed[0];
      setActiveSheet(best?.sheetName ?? null);
      const abex = parsed.map((p) => p.abexCandidate).find((v) => v != null) ?? null;
      setAbexValue(abex ?? "");
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
  const missingRequired = sheet
    ? FIELD_DEFS.filter((f) => f.required && !sheet.mapping[f.key])
    : [];
  const canImport =
    !!sheet && missingRequired.length === 0 && abexValue !== "" && !importing;

  const doImport = async () => {
    if (!sheet || !filename) return;
    setImporting(true);
    try {
      // delete existing matching
      await supabase
        .from("referentieprijzen")
        .delete()
        .eq("verzekeraar", verzekeraar)
        .eq("geldig_van", geldigVan);

      const omschrijvingKey = sheet.mapping.omschrijving!;
      const prijsKey = sheet.mapping.eenheidsprijs!;
      const eenheidKey = sheet.mapping.eenheid;
      const categorieKey = sheet.mapping.categorie;

      let skipped = 0;
      const inserts: Record<string, unknown>[] = [];
      for (const row of sheet.rows) {
        const omsch = String(row[omschrijvingKey] ?? "").trim();
        const prijs = Number(row[prijsKey]);
        if (!omsch || !Number.isFinite(prijs)) {
          skipped++;
          continue;
        }
        inserts.push({
          verzekeraar,
          omschrijving: omsch,
          basisprijs: prijs,
          eenheid: eenheidKey ? String(row[eenheidKey] ?? "").trim() || null : null,
          categorie: categorieKey ? String(row[categorieKey] ?? "").trim() || null : null,
          abex_basisindex: Number(abexValue),
          geldig_van: geldigVan,
          bron_bestand: filename,
        });
      }
      if (inserts.length === 0) {
        toast.error("Geen geldige rijen om te importeren.");
        setImporting(false);
        return;
      }
      // chunk inserts
      const chunkSize = 500;
      for (let i = 0; i < inserts.length; i += chunkSize) {
        const { error } = await supabase
          .from("referentieprijzen")
          .insert(inserts.slice(i, i + chunkSize));
        if (error) throw error;
      }
      await supabase.from("audit_log").insert({
        actie: "referentieprijzen_import",
        detail_json: {
          filename,
          verzekeraar,
          geldig_van: geldigVan,
          abex_basisindex: Number(abexValue),
          imported: inserts.length,
          skipped,
          sheet: sheet.sheetName,
        },
      });
      toast.success(`${inserts.length} referentieprijzen geïmporteerd (${skipped} overgeslagen).`);
      setSheets([]);
      setFilename(null);
      setActiveSheet(null);
      setAbexValue("");
      await qc.invalidateQueries({ queryKey: ["import-history"] });
    } catch (e) {
      toast.error("Import mislukt: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Topbar title="Excel import" subtitle="Importeer referentieprijzen vanuit Baloise-prijsbestand" />

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

      {sheet && (
        <>
          <Card className="mb-4">
            <SectionHeading>Validatie — {filename}</SectionHeading>

            {sheets.length > 1 && (
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {sheets.map((s) => (
                  <button
                    key={s.sheetName}
                    onClick={() => setActiveSheet(s.sheetName)}
                    className={`px-3 py-1 rounded-full text-[12px] border-[0.5px] ${
                      s.sheetName === activeSheet
                        ? "bg-primary-light border-primary text-primary-dark"
                        : "border-border text-text-secondary hover:bg-secondary"
                    }`}
                  >
                    {s.sheetName}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.5px] text-text-secondary mb-2">
                  Kolommapping
                </div>
                <div className="flex flex-col gap-1.5">
                  {FIELD_DEFS.map((f) => {
                    const matched = sheet.mapping[f.key];
                    return (
                      <div key={f.key} className="flex items-center justify-between text-[13px] border-b-[0.5px] border-border py-1.5">
                        <span>
                          <span className="text-text-secondary">{f.label}</span>
                          {f.required && <span className="text-destructive ml-1">*</span>}
                        </span>
                        {matched ? (
                          <span className="flex items-center gap-1.5 text-status-green-fg">
                            <IconCheck size={14} />
                            <span className="font-medium">{matched}</span>
                          </span>
                        ) : f.required ? (
                          <span className="flex items-center gap-1.5 text-destructive">
                            <IconX size={14} />
                            <span>niet gevonden</span>
                          </span>
                        ) : (
                          <span className="text-text-muted text-[12px]">— optioneel</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {missingRequired.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 bg-status-red-bg text-status-red-fg text-[12px] rounded-md p-2.5">
                    <IconAlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <div>
                      Vereiste kolom niet gevonden:{" "}
                      {missingRequired.map((m) => m.label).join(", ")}. Kies een ander tabblad of controleer het bestand.
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.5px] text-text-secondary mb-2">
                  Importinstellingen
                </div>
                <div className="flex flex-col gap-3">
                  <Field label="Verzekeraar">
                    <select
                      className="input"
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
                      className="input"
                      value={geldigVan}
                      onChange={(e) => setGeldigVan(e.target.value)}
                    />
                  </Field>
                  <Field label={`ABEX basisindex ${sheet.abexCandidate ? "(gedetecteerd)" : "(handmatig)"}`}>
                    <input
                      type="number"
                      className="input"
                      value={abexValue}
                      onChange={(e) => setAbexValue(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="bv. 958"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </Card>

          <Card className="mb-4">
            <SectionHeading>Voorbeeld (eerste 5 rijen)</SectionHeading>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-text-secondary uppercase tracking-[0.5px] text-[11px] border-b-[0.5px] border-border">
                    {sheet.headers.map((h) => (
                      <th key={h} className="py-2 pr-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b-[0.5px] border-border">
                      {sheet.headers.map((h) => (
                        <td key={h} className="py-1.5 pr-3 text-text-secondary">
                          {String(r[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-text-muted mt-2">
              {sheet.rows.length} totaal rijen gevonden in tabblad "{sheet.sheetName}"
            </div>
          </Card>

          <div className="flex items-center gap-3 mb-6">
            <PrimaryButton onClick={doImport} disabled={!canImport}>
              {importing ? "Importeren…" : `Importeer ${sheet.rows.length} rijen`}
            </PrimaryButton>
            <button
              onClick={() => {
                setSheets([]);
                setFilename(null);
                setActiveSheet(null);
              }}
              className="text-[13px] text-text-secondary hover:text-foreground"
            >
              Annuleren
            </button>
          </div>
        </>
      )}

      <Card>
        <SectionHeading>Recente imports</SectionHeading>
        {history.data && history.data.length > 0 ? (
          <div>
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2 bg-secondary rounded-md text-[11px] font-medium text-text-secondary uppercase tracking-[0.5px] mb-1">
              <span>Bestand</span>
              <span>Verzekeraar</span>
              <span>Geldig van</span>
              <span>Records</span>
              <span>Datum</span>
            </div>
            {history.data.map((h) => {
              const d = (h.detail_json ?? {}) as Record<string, unknown>;
              return (
                <div
                  key={h.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2.5 text-[13px] border-b-[0.5px] border-border items-center"
                >
                  <span className="truncate">{String(d.filename ?? "—")}</span>
                  <span className="text-text-secondary">
                    {VERZEKERAARS[(d.verzekeraar as VerzekeraarKey) ?? "baloise"]?.name ?? String(d.verzekeraar ?? "—")}
                  </span>
                  <span className="text-text-secondary">{d.geldig_van ? formatDate(String(d.geldig_van)) : "—"}</span>
                  <span className="font-medium">{String(d.imported ?? 0)}</span>
                  <span className="text-text-muted text-[12px]">{formatDate(h.timestamp)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-text-muted">Nog geen imports.</p>
        )}
      </Card>
    </>
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
