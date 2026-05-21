import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IconArrowLeft } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";
import { InsurerBadge, StatusBadge } from "@/components/InsurerBadge";
import { formatEur, formatDate } from "@/lib/format";
import { VERZEKERAARS, STATUS_LABELS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";

export const Route = createFileRoute("/_authenticated/dossiers/$id")({
  component: DossierDetail,
});

const schadeLabel = (k: string | null) =>
  SCHADE_TYPES.find((s) => s.value === k)?.label ?? k ?? "—";

function DossierDetail() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["dossier", id],
    queryFn: async () => {
      const [{ data: dossier, error }, { data: lijnen }] = await Promise.all([
        supabase.from("dossiers").select("*").eq("id", id).maybeSingle(),
        supabase.from("schade_lijnen").select("*").eq("dossier_id", id),
      ]);
      if (error) throw error;
      return { dossier, lijnen: lijnen ?? [] };
    },
  });

  if (isLoading) return <div className="text-[13px] text-text-muted">Laden…</div>;
  if (!data?.dossier) return <div className="text-[13px] text-text-muted">Dossier niet gevonden.</div>;

  const d = data.dossier;
  const ins = d.verzekeraar ? VERZEKERAARS[d.verzekeraar as VerzekeraarKey] : null;
  const totaal = data.lijnen.reduce((sum, l) => sum + Number(l.subtotaal ?? 0), 0);

  return (
    <>
      <Link to="/dossiers" className="inline-flex items-center gap-1 text-[12px] text-text-secondary hover:text-foreground mb-3">
        <IconArrowLeft size={14} /> Terug naar dossiers
      </Link>
      <Topbar title={d.klant_naam} subtitle={`${schadeLabel(d.schade_type)} — ${d.schade_datum ? formatDate(d.schade_datum) : "—"}`} />

      <div className="grid grid-cols-[1fr_340px] gap-4">
        <Card>
          <SectionHeading>Schadegegevens</SectionHeading>
          <dl className="grid grid-cols-2 gap-y-3 text-[13px]">
            <dt className="text-text-secondary">WelZeker dossiernr</dt><dd className="font-medium">{d.dossiernummer}</dd>
            <dt className="text-text-secondary">Maatschappij dossiernr</dt><dd className="font-medium">{(d as any).maatschappij_dossiernr ?? "—"}</dd>
            <dt className="text-text-secondary">Klant</dt><dd className="font-medium">{d.klant_naam}</dd>
            <dt className="text-text-secondary">Type schade</dt><dd>{schadeLabel(d.schade_type)}</dd>
            <dt className="text-text-secondary">Schadedatum</dt><dd>{d.schade_datum ? formatDate(d.schade_datum) : "—"}</dd>
            <dt className="text-text-secondary">Totaal</dt><dd className="font-medium">{formatEur(totaal)}</dd>
            <dt className="text-text-secondary">Status</dt><dd><StatusBadge status={d.status} label={STATUS_LABELS[d.status]} /></dd>
          </dl>

          {d.schade_omschrijving && (
            <>
              <div className="mt-6"><SectionHeading>Omschrijving</SectionHeading></div>
              <p className="text-[13px] text-text-secondary whitespace-pre-wrap">{d.schade_omschrijving}</p>
            </>
          )}
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
            <div className="text-[14px] font-medium text-foreground mb-3">Acties</div>
            <div className="flex flex-col gap-2 text-[13px] text-text-secondary">
              <button className="text-left hover:text-foreground">Bestek toevoegen</button>
              <button className="text-left hover:text-foreground">Regelingsdoc. genereren</button>
              <button className="text-left hover:text-foreground">Status wijzigen</button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
