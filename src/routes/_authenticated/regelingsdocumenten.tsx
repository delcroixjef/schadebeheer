import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { IconDownload } from "@tabler/icons-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { WizardSteps } from "@/components/WizardSteps";
import { InsurerBadge } from "@/components/InsurerBadge";
import { formatEur, formatDate } from "@/lib/format";
import { VERZEKERAARS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";
import { useSession } from "@/lib/session";

type Search = { id?: string };

export const Route = createFileRoute("/_authenticated/regelingsdocumenten")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: RegelingsdocumentenPage,
});

function RegelingsdocumentenPage() {
  const { id } = Route.useSearch();

  const { data: dossiers = [] } = useQuery({
    queryKey: ["dossiers-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .select("id,dossiernummer,klant_naam")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !id,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["regeling", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: dossier, error: dErr }, { data: lijnen, error: lErr }] = await Promise.all([
        supabase.from("dossiers").select("*").eq("id", id!).maybeSingle(),
        supabase
          .from("schade_lijnen")
          .select("id,omschrijving,hoeveelheid,eenheid,eenheidsprijs_incl_abex,subtotaal,ai_oordeel,beheerder_oordeel,referentieprijs_baloise,afwijking_percentage")
          .eq("dossier_id", id!)
          .order("created_at"),
      ]);
      if (dErr) throw dErr;
      if (lErr) throw lErr;
      return { dossier, lijnen: lijnen ?? [] };
    },
  });

  return (
    <>
      <Topbar title="Regelingsdocumenten" subtitle="Stap 5 — Genereer een ondertekenbare PDF-regeling" />
      <WizardSteps current={5} />

      {!id && (
        <Card className="mt-5">
          <SectionHeading>Selecteer een dossier</SectionHeading>
          <p className="text-[13px] text-text-secondary mb-3">
            Er is geen dossier meegegeven. Kies hieronder een dossier om verder te gaan.
          </p>
          <div className="flex flex-col gap-1">
            {dossiers.map((d) => (
              <Link
                key={d.id}
                to="/regelingsdocumenten"
                search={{ id: d.id }}
                className="text-[13px] px-3 py-2 rounded-md border-[0.5px] border-border hover:bg-secondary"
              >
                <span className="font-medium">{d.dossiernummer}</span>
                <span className="text-text-secondary"> · {d.klant_naam}</span>
              </Link>
            ))}
            {dossiers.length === 0 && (
              <div className="text-[13px] text-text-muted">Geen dossiers gevonden.</div>
            )}
          </div>
        </Card>
      )}

      {id && isLoading && (
        <div className="mt-5 text-[13px] text-text-muted">Dossier laden…</div>
      )}

      {id && !isLoading && !data?.dossier && (
        <Card className="mt-5">
          <div className="text-[13px] text-[#A32D2D]">Dossier niet gevonden.</div>
        </Card>
      )}

      {id && data?.dossier && (
        <RegelingDetail dossier={data.dossier} lijnen={data.lijnen} />
      )}
    </>
  );
}

type LijnRow = {
  id: string;
  omschrijving: string;
  hoeveelheid: number;
  eenheid: string | null;
  eenheidsprijs_incl_abex: number;
  subtotaal: number;
  ai_oordeel: string;
  beheerder_oordeel: string | null;
  referentieprijs_baloise: number | null;
  afwijking_percentage: number | null;
};

function RegelingDetail({
  dossier,
  lijnen,
}: {
  dossier: any;
  lijnen: LijnRow[];
}) {
  const session = useSession();
  const previewRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [iban, setIban] = useState("");

  const ins = dossier.verzekeraar ? VERZEKERAARS[dossier.verzekeraar as VerzekeraarKey] : null;
  const schadeType = SCHADE_TYPES.find((s) => s.value === dossier.schade_type)?.label ?? dossier.schade_type ?? "—";

  const goedgekeurd = lijnen.filter((l) => l.beheerder_oordeel === "goedgekeurd");
  const afgekeurd = lijnen.filter((l) => l.beheerder_oordeel === "afgekeurd");
  const onbeoordeeld = lijnen.filter((l) => !l.beheerder_oordeel);

  const totaalGoedgekeurd = goedgekeurd.reduce((s, l) => s + Number(l.subtotaal ?? 0), 0);
  const totaalBestek = lijnen.reduce((s, l) => s + Number(l.subtotaal ?? 0), 0);
  const vrijstelling = Number(dossier.vrijstelling_bedrag ?? 0);
  const teVergoeden = Math.max(0, totaalGoedgekeurd - vrijstelling);

  const ibanCompact = iban.replace(/\s+/g, "").toUpperCase();
  const ibanValid = /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(ibanCompact);
  const ibanFormatted = ibanCompact.replace(/(.{4})/g, "$1 ").trim();

  const missingDecisions = onbeoordeeld.length > 0;
  const blocked = missingDecisions || !ibanValid;

  async function generatePdf() {
    if (!previewRef.current || blocked) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 48;
      const ratio = imgW / canvas.width;
      const imgH = canvas.height * ratio;
      if (imgH <= pageH - 48) {
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 24, 24, imgW, imgH);
      } else {
        const pageContentH = (pageH - 48) / ratio;
        let sy = 0;
        while (sy < canvas.height) {
          const sliceH = Math.min(pageContentH, canvas.height - sy);
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = sliceH;
          const ctx = slice.getContext("2d")!;
          ctx.drawImage(canvas, 0, sy, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (sy > 0) pdf.addPage();
          pdf.addImage(slice.toDataURL("image/png"), "PNG", 24, 24, imgW, sliceH * ratio);
          sy += sliceH;
        }
      }
      pdf.save(`WZ-${dossier.dossiernummer}-Minnelijke-Regeling.pdf`);
      await supabase.from("audit_log").insert({
        dossier_id: dossier.id,
        uitgevoerd_door: session?.userId ?? null,
        actie: "regeling_pdf_gegenereerd",
        detail_json: {
          dossiernummer: dossier.dossiernummer,
          totaal_goedgekeurd: totaalGoedgekeurd,
          vrijstelling,
          te_vergoeden: teVergoeden,
          aantal_goedgekeurde_lijnen: goedgekeurd.length,
          iban: ibanCompact,
          gegenereerd_op: new Date().toISOString(),
        } as never,
      });
      toast.success("Regelings-PDF gegenereerd.");
    } catch (e) {
      console.error(e);
      toast.error("PDF kon niet gegenereerd worden.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 mt-5">
        <Card>
          <SectionHeading>Dossiergegevens</SectionHeading>
          <dl className="grid grid-cols-2 gap-y-3 text-[13px]">
            <dt className="text-text-secondary">WelZeker dossiernr</dt>
            <dd className="font-medium">{dossier.dossiernummer}</dd>
            <dt className="text-text-secondary">Maatschappij dossiernr</dt>
            <dd className="font-medium">{dossier.maatschappij_dossiernr ?? "—"}</dd>
            <dt className="text-text-secondary">Klant</dt>
            <dd className="font-medium">{dossier.klant_naam}</dd>
            <dt className="text-text-secondary">Polisnummer</dt>
            <dd>{dossier.polis_nummer ?? "—"}</dd>
            <dt className="text-text-secondary">Schadedatum</dt>
            <dd>{dossier.schade_datum ? formatDate(dossier.schade_datum) : "—"}</dd>
            <dt className="text-text-secondary">Type schade</dt>
            <dd>{schadeType}</dd>
            <dt className="text-text-secondary">ABEX-index</dt>
            <dd>{dossier.abex_index_gebruikt ?? "—"} {dossier.abex_periode ? `(${dossier.abex_periode})` : ""}</dd>
          </dl>
        </Card>

        <div className="flex flex-col gap-3">
          <Card>
            <div className="text-[14px] font-medium text-foreground mb-3">Verzekeraar</div>
            {ins ? (
              <>
                <InsurerBadge name={ins.name} color={ins.color} />
                <div className="mt-3 text-[12px] text-text-secondary">
                  Regelingsbevoegdheid: <span className="font-medium text-foreground">≤ {formatEur(ins.maxAuthority)}</span>
                </div>
              </>
            ) : (
              <span className="text-[12px] text-text-muted">Niet ingesteld</span>
            )}
          </Card>
          <Card>
            <div className="text-[14px] font-medium text-foreground mb-2">Beoordeling</div>
            <div className="text-[12px] text-text-secondary">
              <div>{goedgekeurd.length} goedgekeurd</div>
              <div>{afgekeurd.length} afgekeurd</div>
              <div>{onbeoordeeld.length} nog te beoordelen</div>
            </div>
            {blocked && (
              <div className="mt-3 text-[11px] text-[#7A4D0D] bg-[#FDF1DA] border-[0.5px] border-[#BA7517] rounded-md p-2">
                Er zijn nog {onbeoordeeld.length} lijn(en) zonder beslissing.{" "}
                <Link to="/bestekanalyse" search={{ dossier: dossier.id }} className="underline">Terug naar bestekanalyse</Link>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <SectionHeading>Lijnen in regeling</SectionHeading>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-text-secondary border-b border-border">
              <th className="py-2 font-medium">Omschrijving</th>
              <th className="py-2 font-medium text-right">Hoeveelheid</th>
              <th className="py-2 font-medium text-right">Eenheidsprijs</th>
              <th className="py-2 font-medium text-right">Subtotaal</th>
              <th className="py-2 font-medium">Beslissing</th>
            </tr>
          </thead>
          <tbody>
            {lijnen.map((l) => {
              const dec = l.beheerder_oordeel;
              const chip =
                dec === "goedgekeurd"
                  ? { bg: "#EAF3DE", text: "#3B6D11", label: "Goedgekeurd" }
                  : dec === "afgekeurd"
                  ? { bg: "#FAE0E0", text: "#7A1F1F", label: "Afgekeurd" }
                  : { bg: "#EEE", text: "#555", label: "Nog te beoordelen" };
              return (
                <tr key={l.id} className="border-b border-border/60" style={{ opacity: dec === "afgekeurd" ? 0.55 : 1 }}>
                  <td className="py-2">{l.omschrijving}</td>
                  <td className="py-2 text-right">{Number(l.hoeveelheid)} {l.eenheid ?? ""}</td>
                  <td className="py-2 text-right">{formatEur(Number(l.eenheidsprijs_incl_abex))}</td>
                  <td className="py-2 text-right">{formatEur(Number(l.subtotaal))}</td>
                  <td className="py-2">
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: chip.bg, color: chip.text }}>
                      {chip.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {lijnen.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-text-muted">Geen schadelijnen.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="mt-5">
        <SectionHeading>Totalen</SectionHeading>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-[13px]">
          <div>
            <div className="text-text-secondary text-[12px]">Totaal bestek klant</div>
            <div className="font-medium text-[16px]">{formatEur(totaalBestek)}</div>
          </div>
          <div>
            <div className="text-text-secondary text-[12px]">Totaal goedgekeurd</div>
            <div className="font-medium text-[16px] text-primary">{formatEur(totaalGoedgekeurd)}</div>
          </div>
          <div>
            <div className="text-text-secondary text-[12px]">Vrijstelling</div>
            <div className="font-medium text-[16px]">- {formatEur(vrijstelling)}</div>
          </div>
          <div>
            <div className="text-text-secondary text-[12px]">Te vergoeden</div>
            <div className="font-medium text-[18px] text-primary">{formatEur(teVergoeden)}</div>
          </div>
        </div>
        <div className="mt-4 flex justify-end items-center gap-3">
          {blocked ? (
            <div className="text-[12px] text-[#7A4D0D] bg-[#FDF1DA] border-[0.5px] border-[#BA7517] rounded-md px-3 py-2">
              Er zijn nog lijnen zonder beslissing. Beoordeel eerst alle lijnen vooraleer de regeling te genereren.
            </div>
          ) : (
            <PrimaryButton onClick={generatePdf} disabled={generating}>
              <IconDownload size={14} />
              {generating ? "PDF genereren…" : "Genereer regeling-PDF"}
            </PrimaryButton>
          )}
        </div>
      </Card>

      {/* Off-screen PDF preview rendered for html2canvas */}
      <div style={{ position: "fixed", left: -10000, top: 0, width: 800 }} aria-hidden>
        <div
          ref={previewRef}
          className="bg-white text-[#1a1a1a] p-10"
          style={{ fontFamily: "Inter, sans-serif", width: 800 }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
            <div>
              <div style={{ color: "#8DB92E", fontSize: 22, fontWeight: 500, lineHeight: 1 }}>WelZeker</div>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7280", marginTop: 4 }}>
                uw toekomst
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", textAlign: "right" }}>
              <div>WelZeker {dossier.dossiernummer}</div>
              {dossier.maatschappij_dossiernr && <div>Mij. {dossier.maatschappij_dossiernr}</div>}
              <div>{formatDate(new Date())}</div>
            </div>
          </div>

          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "0.02em" }}>
              MINNELIJKE SCHADEREGELING
            </div>
            <div style={{ fontSize: 11, fontStyle: "italic", color: "#6b7280", marginTop: 4 }}>
              Definitieve afhandeling van schadegeval
            </div>
          </div>

          <PdfSection title="1. Dossiergegevens">
            <PdfKV k="WelZeker dossiernr" v={dossier.dossiernummer} />
            <PdfKV k="Maatschappij dossiernr" v={dossier.maatschappij_dossiernr ?? "—"} />
            <PdfKV k="Klant" v={dossier.klant_naam} />
            {dossier.klant_adres && <PdfKV k="Adres" v={dossier.klant_adres} />}
            <PdfKV k="Polisnummer" v={dossier.polis_nummer ?? "—"} />
            <PdfKV k="Verzekeraar" v={ins?.name ?? "—"} />
            <PdfKV k="Schadedatum" v={dossier.schade_datum ? formatDate(dossier.schade_datum) : "—"} />
            <PdfKV k="Type schade" v={schadeType} />
            {dossier.abex_index_gebruikt && (
              <PdfKV k="ABEX-index" v={`${dossier.abex_index_gebruikt}${dossier.abex_periode ? ` (${dossier.abex_periode})` : ""}`} />
            )}
            {dossier.schade_omschrijving && (
              <p style={{ fontSize: 11, marginTop: 8 }}>
                <em>Omschrijving:</em> {dossier.schade_omschrijving}
              </p>
            )}
          </PdfSection>

          <PdfSection title="2. Weerhouden posten">
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d1d5db", textAlign: "left" }}>
                  <th style={{ padding: "6px 4px" }}>Omschrijving</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Hoeveelheid</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Eenheidsprijs</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Subtotaal</th>
                </tr>
              </thead>
              <tbody>
                {goedgekeurd.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 4px" }}>{l.omschrijving}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>
                      {Number(l.hoeveelheid)} {l.eenheid ?? ""}
                    </td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>
                      {formatEur(Number(l.eenheidsprijs_incl_abex))}
                    </td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>
                      {formatEur(Number(l.subtotaal))}
                    </td>
                  </tr>
                ))}
                {goedgekeurd.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, textAlign: "center", color: "#9ca3af" }}>
                      Geen goedgekeurde lijnen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </PdfSection>

          <PdfSection title="3. Totalen">
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", marginBottom: 10 }}>
              <tbody>
                <PdfRow label="Totaal bestek klant" value={formatEur(totaalBestek)} />
                <PdfRow label="Totaal goedgekeurd" value={formatEur(totaalGoedgekeurd)} bold />
                {vrijstelling > 0 && <PdfRow label="Vrijstelling" value={`− ${formatEur(vrijstelling)}`} />}
              </tbody>
            </table>
            <div style={{ border: "1px solid #8DB92E", borderRadius: 6, padding: "10px 14px", background: "#EEF5D6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Te vergoeden</span>
              <span style={{ fontSize: 16, fontWeight: 500, color: "#3B6D11" }}>{formatEur(teVergoeden)}</span>
            </div>
          </PdfSection>

          {afgekeurd.length > 0 && (
            <PdfSection title="4. Niet weerhouden posten">
              <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", color: "#6b7280" }}>
                <tbody>
                  {afgekeurd.map((l) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 4px" }}>{l.omschrijving}</td>
                      <td style={{ padding: "4px 4px", textAlign: "right" }}>
                        {formatEur(Number(l.subtotaal))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
                Deze posten zijn niet weerhouden in de minnelijke regeling.
              </p>
            </PdfSection>
          )}

          <PdfSection title={`${afgekeurd.length > 0 ? "5" : "4"}. Akkoord & definitieve kwijting`}>
            <p style={{ fontSize: 11 }}>
              Ondergetekende partijen verklaren akkoord te gaan met bovenstaande minnelijke schaderegeling. De
              Begunstigde verklaart, door ondertekening van huidige overeenkomst en na ontvangst van het bedrag van{" "}
              <strong>{formatEur(teVergoeden)}</strong>, volledig en definitief vergoed te zijn voor alle directe en
              indirecte gevolgen van het hierboven omschreven schadegeval, en verleent algehele en definitieve kwijting.
            </p>
          </PdfSection>

          {/* Signatures */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 28 }}>
            {[
              { name: dossier.klant_naam, role: "De Verzekerde" },
              { name: session?.displayName ?? "WelZeker Schadebeheer", role: "Voor WelZeker" },
            ].map((sig, i) => (
              <div key={i}>
                <div style={{ border: "1px dashed #9ca3af", borderRadius: 4, height: 70, marginBottom: 6 }} />
                <div style={{ fontSize: 11, fontWeight: 500 }}>{sig.name}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{sig.role}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                  Datum: ……………………………………
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function PdfSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "#8DB92E", borderBottom: "1px solid #EEF5D6", paddingBottom: 4, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function PdfKV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}>
      <span style={{ color: "#6b7280" }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function PdfRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr>
      <td style={{ padding: "4px 0", color: "#6b7280" }}>{label}</td>
      <td style={{ padding: "4px 0", textAlign: "right", fontWeight: bold ? 500 : 400 }}>{value}</td>
    </tr>
  );
}
