import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { WizardSteps } from "@/components/WizardSteps";
import { InsurerBadge } from "@/components/InsurerBadge";
import { formatEur, formatDate } from "@/lib/format";
import { VERZEKERAARS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";

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

function RegelingDetail({
  dossier,
  lijnen,
}: {
  dossier: any;
  lijnen: Array<{
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
  }>;
}) {
  const ins = dossier.verzekeraar ? VERZEKERAARS[dossier.verzekeraar as VerzekeraarKey] : null;
  const schadeType = SCHADE_TYPES.find((s) => s.value === dossier.schade_type)?.label ?? dossier.schade_type ?? "—";

  const goedgekeurd = lijnen.filter((l) => l.beheerder_oordeel === "goedgekeurd");
  const afgekeurd = lijnen.filter((l) => l.beheerder_oordeel === "afgekeurd");
  const onbeoordeeld = lijnen.filter((l) => !l.beheerder_oordeel);

  const totaalGoedgekeurd = goedgekeurd.reduce((s, l) => s + Number(l.subtotaal ?? 0), 0);
  const totaalBestek = lijnen.reduce((s, l) => s + Number(l.subtotaal ?? 0), 0);
  const vrijstelling = Number(dossier.vrijstelling_bedrag ?? 0);
  const teVergoeden = Math.max(0, totaalGoedgekeurd - vrijstelling);

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
            {onbeoordeeld.length > 0 && (
              <div className="mt-3 text-[11px] text-[#7A4D0D] bg-[#FDF1DA] border-[0.5px] border-[#BA7517] rounded-md p-2">
                Er zijn nog {onbeoordeeld.length} lijn(en) zonder beslissing.{" "}
                <Link to="/bestekanalyse" className="underline">Terug naar bestekanalyse</Link>
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
        <div className="mt-4 flex justify-end">
          <PrimaryButton
            onClick={() => alert("PDF-generatie wordt binnenkort toegevoegd. Alle gegevens zijn klaar om te genereren.")}
          >
            Genereer regeling-PDF →
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}
