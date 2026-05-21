import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconCheck, IconCopy, IconDownload, IconFileSpreadsheet, IconLink, IconMail } from "@tabler/icons-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";
import { Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { VERZEKERAARS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";
import { formatEur, formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";

const BTW = 0.21;
const INDIRECT = 0.10;

export function Step5Regeling({ dossierId }: { dossierId: string }) {
  const session = useSession();
  const previewRef = useRef<HTMLDivElement>(null);
  const [betalingswijze, setBetalingswijze] = useState<"overschrijving" | "cash">("overschrijving");
  const [linkInfo, setLinkInfo] = useState<{ token: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const dossierQ = useQuery({
    queryKey: ["dossier", dossierId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dossiers").select("*").eq("id", dossierId).single();
      if (error) throw error;
      return data;
    },
  });

  const lijnenQ = useQuery({
    queryKey: ["schade_lijnen", dossierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schade_lijnen")
        .select("*")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [betaalreferentie, setBetaalreferentie] = useState<string>("");

  const dossier = dossierQ.data;
  const lijnen = lijnenQ.data ?? [];

  // sync betaalreferentie once dossier loaded
  useMemo(() => {
    if (dossier && !betaalreferentie) setBetaalreferentie(dossier.dossiernummer);
  }, [dossier, betaalreferentie]);

  const totals = useMemo(() => {
    const subtotaal = lijnen.reduce((s, l) => s + Number(l.subtotaal ?? 0), 0);
    const indirect = dossier?.heeft_indirecte_verliezen ? subtotaal * INDIRECT : 0;
    const btw = (subtotaal + indirect) * BTW;
    const bruto = subtotaal + indirect + btw;
    const vrijstelling = dossier?.heeft_vrijstelling ? Number(dossier.vrijstelling_bedrag ?? 0) : 0;
    const netto = Math.max(0, bruto - vrijstelling);
    return { subtotaal, indirect, btw, bruto, vrijstelling, netto };
  }, [lijnen, dossier]);

  if (dossierQ.isLoading || !dossierQ.data) {
    return <Card><div className="text-[13px] text-text-secondary">Laden…</div></Card>;
  }
  const dossierData = dossierQ.data;

  const verzekeraarMeta = dossierData.verzekeraar
    ? VERZEKERAARS[dossierData.verzekeraar as VerzekeraarKey]
    : null;
  const schadeTypeLabel = SCHADE_TYPES.find((s) => s.value === dossierData.schade_type)?.label ?? "";


  const timelineSteps = [
    { label: "Dossierdata", done: !!dossier.klant_naam },
    { label: "Schadeberekening", done: lijnen.length > 0 },
    { label: "Bestekanalyse", done: !!dossier.ai_score },
    { label: "Akkoord klant", done: dossier.status === "akkoord" || dossier.status === "afgerond" },
    { label: "Regelingsdocument", done: dossier.status === "afgerond" },
  ];

  async function audit(actie: string, detail: Record<string, unknown>) {
    await supabase.from("audit_log").insert({
      dossier_id: dossierId,
      uitgevoerd_door: session?.userId ?? null,
      actie,
      detail_json: detail as never,
    });
  }

  async function exportPdf() {
    if (!previewRef.current) return;
    const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - 48;
    const imgH = (canvas.height * imgW) / canvas.width;
    let y = 24;
    if (imgH <= pageH - 48) {
      pdf.addImage(img, "PNG", 24, y, imgW, imgH);
    } else {
      // split into multiple pages
      const ratio = imgW / canvas.width;
      const pageContentH = (pageH - 48) / ratio;
      let sy = 0;
      while (sy < canvas.height) {
        const sliceH = Math.min(pageContentH, canvas.height - sy);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d")!;
        ctx.drawImage(canvas, 0, sy, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const sliceImg = slice.toDataURL("image/png");
        if (sy > 0) pdf.addPage();
        pdf.addImage(sliceImg, "PNG", 24, 24, imgW, sliceH * ratio);
        sy += sliceH;
      }
    }
    pdf.save(`WZ-${dossier.dossiernummer}-Minnelijke-Regeling.pdf`);
    await audit("pdf_gegenereerd", { dossiernummer: dossier.dossiernummer, bruto: totals.bruto, netto: totals.netto });
  }

  function exportBrioCsv() {
    const headers = [
      "dossiernummer", "polisnummer", "klant", "schadedatum", "schadesoort",
      "verzekeraar", "vergoeding_bruto", "vrijstelling", "vergoeding_netto",
      "abex_index", "beheerder", "ai_score", "datum_regeling",
    ];
    const row = [
      dossier.dossiernummer,
      dossier.polis_nummer ?? "",
      dossier.klant_naam ?? "",
      dossier.schade_datum ?? "",
      schadeTypeLabel,
      verzekeraarMeta?.name ?? "",
      totals.bruto.toFixed(2),
      totals.vrijstelling.toFixed(2),
      totals.netto.toFixed(2),
      String(dossier.abex_index_gebruikt ?? ""),
      session?.displayName ?? "",
      String(dossier.ai_score ?? ""),
      new Date().toISOString().slice(0, 10),
    ];
    const csv = [headers, row].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WZ-${dossier.dossiernummer}-Brio.csv`;
    a.click();
    URL.revokeObjectURL(url);
    audit("brio_export", { dossiernummer: dossier.dossiernummer });
  }

  async function generateKlantLink() {
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("klant_tokens").insert({
      dossier_id: dossierId,
      token,
      expires_at: expires,
    });
    if (error) {
      console.error(error);
      return;
    }
    setLinkInfo({ token, expires });
    await audit("klant_link_aangemaakt", { token, expires });
  }

  const klantUrl = linkInfo ? `${window.location.origin}/klant/${linkInfo.token}` : "";

  async function copyLink() {
    if (!klantUrl) return;
    await navigator.clipboard.writeText(klantUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function mailLink() {
    const subject = encodeURIComponent(`Minnelijke regeling ${dossier.dossiernummer}`);
    const body = encodeURIComponent(
      `Beste ${dossier.klant_naam},\n\nGelieve onderstaande link te openen om uw schaderegeling te ondertekenen:\n${klantUrl}\n\nDeze link is 7 dagen geldig.\n\nMet vriendelijke groet,\nWelZeker Schadebeheer`,
    );
    window.location.href = `mailto:${""}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">
      {/* LEFT */}
      <div className="space-y-5">
        <Card>
          <SectionHeading>Dossiergegevens</SectionHeading>
          <div className="space-y-3">
            <ReadonlyField label="Dossiernummer" value={dossier.dossiernummer} />
            <ReadonlyField label="Polisnummer" value={dossier.polis_nummer ?? "—"} />
            <ReadonlyField label="Schadedatum" value={dossier.schade_datum ? formatDate(dossier.schade_datum) : "—"} />
            <ReadonlyField label="Verzekeraar" value={verzekeraarMeta?.name ?? "—"} />
            <ReadonlyField label="Klant" value={dossier.klant_naam} />
            <ReadonlyField label="Adres" value={dossier.klant_adres ?? "—"} />

            <div>
              <label className="text-[11px] text-text-muted block mb-1">Betalingswijze</label>
              <select
                value={betalingswijze}
                onChange={(e) => setBetalingswijze(e.target.value as "overschrijving" | "cash")}
                className="w-full bg-card border border-border rounded-md px-3 py-2 text-[13px]"
              >
                <option value="overschrijving">Overschrijving</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-text-muted block mb-1">Betaalreferentie</label>
              <input
                value={betaalreferentie}
                onChange={(e) => setBetaalreferentie(e.target.value)}
                className="w-full bg-card border border-border rounded-md px-3 py-2 text-[13px]"
              />
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeading>Voortgang</SectionHeading>
          <ol className="space-y-3">
            {timelineSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ${
                    s.done ? "bg-primary text-primary-foreground border-primary" : "bg-card text-text-muted border-border"
                  }`}
                >
                  {s.done ? <IconCheck size={12} /> : i + 1}
                </div>
                <div className="text-[13px] text-foreground">{s.label}</div>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <SectionHeading>Klantportaal</SectionHeading>
          {!linkInfo ? (
            <button
              onClick={generateKlantLink}
              className="inline-flex items-center gap-1.5 bg-card border border-border rounded-md px-3 py-2 text-[13px] hover:bg-muted"
            >
              <IconLink size={14} /> Genereer ondertekenlink
            </button>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-text-muted">Link (geldig tot {formatDate(linkInfo.expires)})</div>
              <div className="bg-muted border border-border rounded-md px-3 py-2 text-[12px] break-all font-mono">
                {klantUrl}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 bg-card border border-border rounded-md px-3 py-1.5 text-[12px] hover:bg-muted"
                >
                  <IconCopy size={12} /> {copied ? "Gekopieerd" : "Kopieer link"}
                </button>
                <button
                  onClick={mailLink}
                  className="inline-flex items-center gap-1.5 bg-card border border-border rounded-md px-3 py-1.5 text-[12px] hover:bg-muted"
                >
                  <IconMail size={12} /> Verstuur via e-mail
                </button>
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={exportPdf}>
            <IconDownload size={14} /> Genereer PDF
          </PrimaryButton>
          <button
            onClick={exportBrioCsv}
            className="inline-flex items-center justify-center gap-1.5 bg-card border border-border rounded-md px-4 py-2 text-[13px] hover:bg-muted"
          >
            <IconFileSpreadsheet size={14} /> Brio-export (CSV)
          </button>
        </div>
      </div>

      {/* RIGHT — preview */}
      <Card className="!p-0 overflow-hidden">
        <div ref={previewRef} className="bg-white text-[#1a1a1a] p-10" style={{ fontFamily: "Inter, sans-serif" }}>
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <div style={{ color: "#8DB92E", fontSize: 22, fontWeight: 500, lineHeight: 1 }}>WelZeker</div>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7280", marginTop: 4 }}>
                uw toekomst
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", textAlign: "right" }}>
              <div>Dossier {dossier.dossiernummer}</div>
              <div>{formatDate(new Date())}</div>
            </div>
          </div>

          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.02em" }}>
              OVEREENKOMST TOT MINNELIJKE SCHADEREGELING
            </div>
            <div style={{ fontSize: 11, fontStyle: "italic", color: "#6b7280", marginTop: 4 }}>
              Minnelijke regeling — Definitieve Kwijting
            </div>
          </div>

          <PdfSection title="1. Partijen">
            <p className="mb-2">
              <strong>Tussen:</strong> NV WelZeker, met maatschappelijke zetel te België, hierna "de Verzekeraar/Beheerder",
              optredend voor rekening van {verzekeraarMeta?.name ?? "de verzekeraar"};
            </p>
            <p>
              <strong>En:</strong> {dossier.klant_naam}
              {dossier.klant_adres ? `, wonende te ${dossier.klant_adres}` : ""}
              {dossier.klant_rijksregister ? `, RR ${dossier.klant_rijksregister}` : ""}, hierna "de Begunstigde".
            </p>
          </PdfSection>

          <PdfSection title="2. Voorwerp">
            <p>
              Deze overeenkomst regelt de minnelijke afhandeling van het schadegeval dd.{" "}
              {dossier.schade_datum ? formatDate(dossier.schade_datum) : "—"} ({schadeTypeLabel.toLowerCase()}),
              gekend onder polisnummer {dossier.polis_nummer ?? "—"}.
            </p>
            {dossier.schade_omschrijving && (
              <p className="mt-2"><em>Omschrijving:</em> {dossier.schade_omschrijving}</p>
            )}
          </PdfSection>

          <PdfSection title="3. Minnelijke vergoeding">
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", marginBottom: 12 }}>
              <tbody>
                <PdfRow label="Subtotaal schade" value={formatEur(totals.subtotaal)} />
                {totals.indirect > 0 && <PdfRow label="Indirecte verliezen (10%)" value={formatEur(totals.indirect)} />}
                <PdfRow label="BTW (21%)" value={formatEur(totals.btw)} />
                <PdfRow label="Bruto vergoeding" value={formatEur(totals.bruto)} bold />
                {totals.vrijstelling > 0 && <PdfRow label="Vrijstelling" value={`− ${formatEur(totals.vrijstelling)}`} />}
              </tbody>
            </table>
            <div style={{ border: "1px solid #8DB92E", borderRadius: 6, padding: "10px 14px", background: "#EEF5D6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Netto uit te keren</span>
              <span style={{ fontSize: 16, fontWeight: 500, color: "#3B6D11" }}>{formatEur(totals.netto)}</span>
            </div>
            <p style={{ fontSize: 10, color: "#6b7280", marginTop: 8 }}>
              Betaling via {betalingswijze === "overschrijving" ? "overschrijving" : "cash"} — referentie: {betaalreferentie}.
              {dossier.abex_index_gebruikt ? ` ABEX-index gehanteerd: ${dossier.abex_index_gebruikt}.` : ""}
            </p>
          </PdfSection>

          <PdfSection title="4. Definitieve kwijting">
            <p>
              De Begunstigde verklaart, door ondertekening van huidige overeenkomst en na ontvangst van het bovenvermelde
              bedrag, volledig en definitief vergoed te zijn voor alle directe en indirecte gevolgen van het schadegeval.
              De Begunstigde verleent aan de Verzekeraar/Beheerder en aan alle aansprakelijke derden onherroepelijke,
              algehele en definitieve kwijting voor het geheel van zijn vorderingen, gekend of ongekend, uit hoofde van
              het hierboven omschreven schadegeval.
            </p>
          </PdfSection>

          <PdfSection title="5. Toepasselijk recht">
            <p>
              Huidige overeenkomst wordt beheerst door het Belgisch recht. Elk geschil betreffende de uitvoering of
              interpretatie ervan behoort tot de uitsluitende bevoegdheid van de hoven en rechtbanken van het gerechtelijk
              arrondissement van de zetel van de Verzekeraar/Beheerder.
            </p>
          </PdfSection>

          <PdfSection title="6. Vertrouwelijkheid">
            <p>
              Partijen verbinden zich ertoe de inhoud van deze regeling vertrouwelijk te behandelen en niet aan derden
              mee te delen, behoudens wettelijke verplichting of mits voorafgaand schriftelijk akkoord.
            </p>
          </PdfSection>

          {/* Signatures */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 32 }}>
            {[
              { name: dossier.klant_naam, role: "De Begunstigde" },
              { name: session?.displayName ?? "WelZeker Schadebeheer", role: "Voor WelZeker" },
            ].map((sig, i) => (
              <div key={i}>
                <div style={{ border: "1px dashed #9ca3af", borderRadius: 4, height: 70, marginBottom: 6 }} />
                <div style={{ fontSize: 11, fontWeight: 500 }}>{sig.name}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{sig.role}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 40, paddingTop: 12, borderTop: "1px solid #e5e7eb", fontSize: 9, color: "#6b7280", display: "flex", justifyContent: "space-between" }}>
            <div>
              <div>WelZeker NV — info@welzeker.be — +32 (0)… </div>
              <div>FSMA nr. 0000000 A</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>Gegenereerd: {formatDate(new Date())}</div>
              <div>Dossier {dossier.dossiernummer}</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-[11px] text-text-muted block mb-1">{label}</label>
      <div className="w-full bg-muted border border-border rounded-md px-3 py-2 text-[13px] text-text-secondary">
        {value}
      </div>
    </div>
  );
}

function PdfSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{ color: "#8DB92E", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #8DB92E", paddingBottom: 4, marginBottom: 8, fontWeight: 500 }}>
        {title}
      </h3>
      <div style={{ fontSize: 11, lineHeight: 1.55, color: "#1f2937" }}>{children}</div>
    </section>
  );
}

function PdfRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
      <td style={{ padding: "6px 0", fontWeight: bold ? 500 : 400 }}>{label}</td>
      <td style={{ padding: "6px 0", textAlign: "right", fontWeight: bold ? 500 : 400 }}>{value}</td>
    </tr>
  );
}
