import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, type DragEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { WizardSteps } from "@/components/WizardSteps";
import { analyseBestek, type BestekAnalyseResult } from "@/lib/bestek-analyse.functions";
import { formatEur, formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
const fmtEUR = formatEur;
const fmtDateTime = (d: Date) => `${formatDate(d)} ${d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}`;


export const Route = createFileRoute("/_authenticated/bestekanalyse")({
  component: BestekanalysePage,
});

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ACCEPTED_FILE_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

function isAcceptedBestekFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_FILE_TYPES.has(file.type) || ACCEPTED_FILE_EXTENSIONS.has(ext);
}

function getBestekMimeType(file: File) {
  if (ACCEPTED_FILE_TYPES.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return file.type || "application/octet-stream";
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",")[1];
      if (!base64) reject(new Error("Bestand kon niet gelezen worden."));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Bestand kon niet gelezen worden."));
    reader.readAsDataURL(file);
  });
}

function BestekanalysePage() {
  const qc = useQueryClient();
  const session = useSession();
  const [dossierId, setDossierId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [uploadedAt, setUploadedAt] = useState<Date | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const runAnalyse = useServerFn(analyseBestek);

  const { data: dossiers = [] } = useQuery({
    queryKey: ["dossiers-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .select("id,dossiernummer,klant_naam,abex_index_gebruikt,ai_score,ai_aanbeveling,ai_verdacht_label,bestek_filename,bestek_uploaded_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const dossier = useMemo(() => dossiers.find((d) => d.id === dossierId) ?? null, [dossiers, dossierId]);

  const { data: schadeLijnen = [] } = useQuery({
    queryKey: ["schade_lijnen", dossierId],
    enabled: !!dossierId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schade_lijnen")
        .select("id,omschrijving,hoeveelheid,eenheid,eenheidsprijs_incl_abex,subtotaal,ai_oordeel,beheerder_oordeel,referentieprijs_baloise,afwijking_percentage")
        .eq("dossier_id", dossierId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });


  const { data: refprijzen = [] } = useQuery({
    queryKey: ["referentieprijzen"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referentieprijzen")
        .select("omschrijving,eenheid,basisprijs")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [analyse, setAnalyse] = useState<BestekAnalyseResult | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (f: File) => {
      if (!dossierId) throw new Error("Selecteer eerst een dossier");
      if (!isAcceptedBestekFile(f)) throw new Error("Upload enkel PDF, JPG of PNG.");
      if (f.size > MAX_BYTES) throw new Error("Bestand is groter dan 10 MB");
      const ext = f.name.split(".").pop() ?? "bin";
      const mimeType = getBestekMimeType(f);
      const path = `${dossierId}/${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from("bestekken").upload(path, f, {
        upsert: true,
        contentType: mimeType,
      });
      if (upErr) throw upErr;
      let pages: number | null = null;
      if (mimeType === "application/pdf") {
        const buf = await f.arrayBuffer();
        const txt = new TextDecoder("latin1").decode(buf);
        pages = (txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length || null;
      } else {
        pages = 1;
      }
      const now = new Date();
      const { error: dossierErr } = await supabase
        .from("dossiers")
        .update({ bestek_storage_path: path, bestek_filename: f.name, bestek_uploaded_at: now.toISOString() })
        .eq("id", dossierId);
      if (dossierErr) throw dossierErr;
      return { path, pages, now, ext };
    },
    onSuccess: ({ path, pages, now }) => {
      setStoragePath(path);
      setPageCount(pages);
      setUploadedAt(now);
      setError(null);
      qc.invalidateQueries({ queryKey: ["dossiers-min"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const analyseMutation = useMutation({
    mutationFn: async () => {
      if (!file || !dossier) throw new Error("Geen bestand of dossier");
      const b64 = await fileToBase64(file);
      const abex = dossier.abex_index_gebruikt ?? 1010;
      const result = await runAnalyse({
        data: {
          dossierId,
          fileBase64: b64,
          mimeType: getBestekMimeType(file),
          abexActueel: abex,
          schadeLijnen: schadeLijnen.map((l) => ({
            omschrijving: l.omschrijving,
            hoeveelheid: Number(l.hoeveelheid),
            eenheid: l.eenheid,
            eenheidsprijs_incl_abex: Number(l.eenheidsprijs_incl_abex),
          })),
          referentieprijzen: refprijzen.map((r) => ({
            omschrijving: r.omschrijving,
            eenheid: r.eenheid,
            basisprijs: Number(r.basisprijs),
          })),
        },
      });
      // Persist results
      await supabase
        .from("dossiers")
        .update({
          ai_score: Math.round(result.score),
          ai_aanbeveling: result.aanbeveling,
          ai_verdacht_label: result.verdacht_label,
          ai_analyse_op: new Date().toISOString(),
          status: "bestekanalyse",
        })
        .eq("id", dossierId);
      // Update schade_lijnen oordeel by matching omschrijving
      for (const line of result.lijnen) {
        const match = schadeLijnen.find((l) => l.omschrijving.toLowerCase().trim() === line.omschrijving.toLowerCase().trim());
        if (match) {
          await supabase
            .from("schade_lijnen")
            .update({
              ai_oordeel: line.oordeel,
              referentieprijs_baloise: line.referentie_prijs,
              afwijking_percentage: line.afwijking_pct,
            })
            .eq("id", match.id);
        }
      }
      await supabase.from("audit_log").insert({
        dossier_id: dossierId,
        actie: "ai_bestekanalyse",
        uitgevoerd_door: session?.userId ?? null,
        detail_json: { score: result.score, label: result.verdacht_label, lijnen_count: result.lijnen.length },
      });
      return result;
    },
    onSuccess: (r) => {
      setAnalyse(r);
      qc.invalidateQueries({ queryKey: ["schade_lijnen", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossiers-min"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const oordeelMutation = useMutation({
    mutationFn: async ({ id, oordeel }: { id: string; oordeel: "goedgekeurd" | "afgekeurd" | null }) => {
      const { error } = await supabase
        .from("schade_lijnen")
        .update({
          beheerder_oordeel: oordeel,
          beheerder_oordeel_op: oordeel ? new Date().toISOString() : null,
          beheerder_oordeel_door: oordeel ? (session?.userId ?? null) : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schade_lijnen", dossierId] }),
    onError: (e: Error) => setError(e.message),
  });


  function onPick(f: File | null) {
    setError(null);
    setDragOver(false);
    setAnalyse(null);
    setStoragePath(null);
    setPageCount(null);
    setUploadedAt(null);
    setFile(f);
    if (f) uploadMutation.mutate(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!dossierId) {
      setError("Selecteer eerst een dossier");
      return;
    }
    onPick(e.dataTransfer.files?.[0] ?? null);
  }

  const scoreColor = analyse
    ? analyse.score >= 80
      ? { border: "#639922", text: "#3B6D11", bg: "#EAF3DE" }
      : analyse.score >= 60
      ? { border: "#BA7517", text: "#7A4D0D", bg: "#FDF1DA" }
      : { border: "#A32D2D", text: "#7A1F1F", bg: "#FAE0E0" }
    : null;

  return (
    <>
      <Topbar title="Bestekanalyse" subtitle="Stap 3 — AI-controle van het klantbestek" />
      <WizardSteps current={3} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* LEFT */}
        <Card>
          <SectionHeading>Klantbestek uploaden</SectionHeading>

          <label className="block text-[12px] text-text-secondary mb-1">Dossier</label>
          <select
            value={dossierId}
            onChange={(e) => setDossierId(e.target.value)}
            className="w-full text-[13px] border-[0.5px] border-border rounded-md px-2 py-2 mb-4 bg-background"
          >
            <option value="">— Kies dossier —</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.dossiernummer} · {d.klant_naam}
              </option>
            ))}
          </select>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <div
            role="button"
            tabIndex={0}
            aria-disabled={!dossierId}
            onClick={() => {
              if (dossierId) fileRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (dossierId && (e.key === "Enter" || e.key === " ")) fileRef.current?.click();
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dossierId) setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dossierId) setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
            }}
            onDrop={onDrop}
            className={`w-full border-[0.5px] border-dashed rounded-md p-10 text-center text-[13px] text-text-muted hover:bg-muted/40 cursor-pointer ${!dossierId ? "opacity-50" : ""} ${
              dragOver ? "border-primary bg-primary-light text-primary" : "border-border"
            }`}
          >
            {file ? "Ander bestand kiezen of hier droppen…" : "Sleep PDF, JPG of PNG hierheen of klik om te uploaden (max 10 MB)"}
          </div>

          {uploadMutation.isPending && (
            <div className="mt-3 text-[12px] text-text-secondary">Uploaden…</div>
          )}

          {file && storagePath && (
            <div className="mt-4 border-[0.5px] border-border rounded-md p-3 text-[13px]">
              <div className="font-medium">{file.name}</div>
              <div className="text-[12px] text-text-secondary mt-0.5">
                {pageCount ? `${pageCount} pagina${pageCount === 1 ? "" : "'s"} · ` : ""}
                {uploadedAt ? `Geüpload ${fmtDateTime(uploadedAt)}` : ""}
              </div>
              <div className="mt-3">
                <PrimaryButton onClick={() => analyseMutation.mutate()}>
                  {analyseMutation.isPending ? "AI analyseert…" : "AI-analyse starten"}
                </PrimaryButton>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 text-[12px] text-[#A32D2D] bg-[#FAE0E0] border-[0.5px] border-[#A32D2D] rounded-md p-2">
              {error}
            </div>
          )}

          <p className="mt-4 text-[10px] text-text-muted">
            AI-analyse is indicatief. Schadebeheerder valideert finaal.
          </p>
        </Card>

        {/* RIGHT */}
        <Card>
          <SectionHeading>AI-resultaat</SectionHeading>
          {!analyse ? (
            <div className="text-[13px] text-text-muted">
              Nog geen analyse uitgevoerd. Upload een bestek en start de AI-analyse.
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div
                className="flex flex-col items-center justify-center rounded-full"
                style={{
                  width: 120,
                  height: 120,
                  border: `6px solid ${scoreColor!.border}`,
                  background: scoreColor!.bg,
                  color: scoreColor!.text,
                }}
              >
                <div className="text-[28px] font-medium leading-none">{Math.round(analyse.score)}</div>
                <div className="text-[10px] mt-1 uppercase tracking-wider">score</div>
              </div>
              <div className="flex-1">
                <div className="text-[12px] text-text-secondary">Verdict</div>
                <div className="text-[15px] font-medium" style={{ color: scoreColor!.text }}>
                  {analyse.verdacht_label ?? (analyse.score >= 80 ? "Bestek conform" : analyse.score >= 60 ? "Lichte afwijkingen" : "Substantiële afwijkingen")}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {analyse && (
        <>
          <Card className="mt-5">
            <SectionHeading>Vergelijking per lijn — keur elke lijn goed of af</SectionHeading>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-text-secondary border-b border-border">
                  <th className="py-2 font-medium">Omschrijving</th>
                  <th className="py-2 font-medium text-right">Bestek klant</th>
                  <th className="py-2 font-medium text-right">Ref. eenheidsprijs</th>
                  <th className="py-2 font-medium text-right">Verschil %</th>
                  <th className="py-2 font-medium">AI-oordeel</th>
                  <th className="py-2 font-medium text-right">Beslissing</th>
                </tr>
              </thead>
              <tbody>
                {schadeLijnen.map((l) => {
                  const ai = l.ai_oordeel;
                  const aiChip =
                    ai === "conform"
                      ? { bg: "#EAF3DE", text: "#3B6D11", label: "Conform" }
                      : ai === "licht_verhoogd"
                      ? { bg: "#FDF1DA", text: "#7A4D0D", label: "Licht verhoogd" }
                      : ai === "niet_conform"
                      ? { bg: "#FAE0E0", text: "#7A1F1F", label: "Niet conform" }
                      : { bg: "#EEE", text: "#555", label: "—" };
                  const dec = l.beheerder_oordeel as "goedgekeurd" | "afgekeurd" | null;
                  return (
                    <tr key={l.id} className="border-b border-border/60">
                      <td className="py-2">{l.omschrijving}</td>
                      <td className="py-2 text-right">{fmtEUR(Number(l.eenheidsprijs_incl_abex))}</td>
                      <td className="py-2 text-right">{l.referentieprijs_baloise != null ? fmtEUR(Number(l.referentieprijs_baloise)) : "—"}</td>
                      <td className="py-2 text-right">
                        {l.afwijking_percentage != null
                          ? `${Number(l.afwijking_percentage) > 0 ? "+" : ""}${Number(l.afwijking_percentage).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="py-2">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: aiChip.bg, color: aiChip.text }}>
                          {aiChip.label}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          disabled={oordeelMutation.isPending}
                          onClick={() => oordeelMutation.mutate({ id: l.id, oordeel: dec === "goedgekeurd" ? null : "goedgekeurd" })}
                          className="px-2 py-1 rounded text-[11px] font-medium border-[0.5px]"
                          style={{
                            background: dec === "goedgekeurd" ? "#3B6D11" : "transparent",
                            color: dec === "goedgekeurd" ? "white" : "#3B6D11",
                            borderColor: "#3B6D11",
                          }}
                        >
                          ✓ Goedkeuren
                        </button>{" "}
                        <button
                          disabled={oordeelMutation.isPending}
                          onClick={() => oordeelMutation.mutate({ id: l.id, oordeel: dec === "afgekeurd" ? null : "afgekeurd" })}
                          className="px-2 py-1 rounded text-[11px] font-medium border-[0.5px]"
                          style={{
                            background: dec === "afgekeurd" ? "#7A1F1F" : "transparent",
                            color: dec === "afgekeurd" ? "white" : "#7A1F1F",
                            borderColor: "#7A1F1F",
                          }}
                        >
                          ✗ Afkeuren
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2 text-[11px] text-text-muted">
              {schadeLijnen.filter((l) => l.beheerder_oordeel === "goedgekeurd").length} goedgekeurd ·{" "}
              {schadeLijnen.filter((l) => l.beheerder_oordeel === "afgekeurd").length} afgekeurd ·{" "}
              {schadeLijnen.filter((l) => !l.beheerder_oordeel).length} nog te beoordelen
            </div>
          </Card>

          <div className="mt-5 p-4 rounded-md bg-muted border-l-4 border-primary">
            <div className="italic text-[12px] text-text-secondary mb-1">AI-aanbeveling</div>
            <div className="text-[13px] text-foreground">{analyse.aanbeveling}</div>
          </div>

          <Card className="mt-5">
            <SectionHeading>Gecorrigeerde schatting</SectionHeading>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[12px] text-text-secondary">Totaal goedgekeurde lijnen</div>
                <div className="text-[22px] font-medium text-primary mt-1">
                  {fmtEUR(
                    schadeLijnen
                      .filter((l) => l.beheerder_oordeel === "goedgekeurd")
                      .reduce((s, l) => s + Number(l.subtotaal ?? 0), 0)
                  )}
                </div>
              </div>
              <Link to="/regelingsdocumenten" search={{ id: dossierId }}>
                <PrimaryButton>Volgende stap →</PrimaryButton>
              </Link>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
