import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IconArrowLeft } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";
import { InsurerBadge, StatusBadge } from "@/components/InsurerBadge";
import { formatEur, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dossiers/$id")({
  component: DossierDetail,
});

function DossierDetail() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["dossier", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .select("*, insurer:insurers(name, color_token, max_authority_amount)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="text-[13px] text-text-muted">Laden…</div>;
  if (!data) return <div className="text-[13px] text-text-muted">Dossier niet gevonden.</div>;

  return (
    <>
      <Link to="/dossiers" className="inline-flex items-center gap-1 text-[12px] text-text-secondary hover:text-foreground mb-3">
        <IconArrowLeft size={14} /> Terug naar dossiers
      </Link>
      <Topbar title={data.customer_name} subtitle={`${data.damage_type} — ${formatDate(data.damage_date)}`} />

      <div className="grid grid-cols-[1fr_340px] gap-4">
        <Card>
          <SectionHeading>Schadegegevens</SectionHeading>
          <dl className="grid grid-cols-2 gap-y-3 text-[13px]">
            <dt className="text-text-secondary">Klant</dt><dd className="font-medium">{data.customer_name}</dd>
            <dt className="text-text-secondary">Type schade</dt><dd>{data.damage_type}</dd>
            <dt className="text-text-secondary">Schadedatum</dt><dd>{formatDate(data.damage_date)}</dd>
            <dt className="text-text-secondary">Bedrag</dt><dd className="font-medium">{formatEur(Number(data.amount))}</dd>
            <dt className="text-text-secondary">Status</dt><dd><StatusBadge status={data.status} label={data.status_label} /></dd>
          </dl>

          {data.notes && (
            <>
              <SectionHeading><span className="mt-6 block">Notities</span></SectionHeading>
              <p className="text-[13px] text-text-secondary whitespace-pre-wrap">{data.notes}</p>
            </>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card>
            <div className="text-[14px] font-medium text-foreground mb-3">Verzekeraar</div>
            {data.insurer && (
              <>
                <InsurerBadge name={data.insurer.name} color={data.insurer.color_token} />
                <div className="mt-3 text-[12px] text-text-secondary">
                  Regelingsbevoegdheid: <span className="font-medium text-foreground">≤ {formatEur(Number(data.insurer.max_authority_amount))}</span>
                </div>
              </>
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
