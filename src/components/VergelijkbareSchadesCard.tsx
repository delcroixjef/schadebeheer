import { useMemo } from "react";
import { Card, SectionHeading } from "@/components/Topbar";
import { formatEur } from "@/lib/format";
import { useAfgerondDossiers, computeStats } from "@/lib/precedenten";

export function VergelijkbareSchadesCard({
  schadeType,
  verzekeraar,
}: {
  schadeType: string | null;
  verzekeraar?: string | null;
}) {
  const { data, isLoading } = useAfgerondDossiers();

  const stats = useMemo(() => {
    if (!data || !schadeType) return null;
    const filtered = data.filter(
      (d) =>
        d.schade_type === schadeType &&
        (!verzekeraar || d.verzekeraar === verzekeraar),
    );
    return computeStats(filtered);
  }, [data, schadeType, verzekeraar]);

  // Only render if databank has >5 afgeronde dossiers total
  if (!data || data.length <= 5 || !schadeType) return null;

  return (
    <Card>
      <SectionHeading>Vergelijkbare schades</SectionHeading>
      {isLoading ? (
        <p className="text-[13px] text-text-muted">Laden…</p>
      ) : !stats ? (
        <p className="text-[13px] text-text-muted">
          Geen vergelijkbare afgeronde dossiers gevonden.
        </p>
      ) : (
        <>
          <div className="text-[12px] text-text-secondary mb-3">
            Op basis van {stats.count} afgeronde dossiers:
          </div>
          <div className="flex flex-col gap-1.5 text-[13px]">
            <Row label="Gemiddeld" value={formatEur(stats.gemiddeld)} />
            <Row label="Minimum" value={formatEur(stats.min)} />
            <Row label="Maximum" value={formatEur(stats.max)} />
          </div>
          <div className="text-[10px] text-text-muted mt-3 italic">
            Indicatief — elke schade is uniek
          </div>
        </>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b-[0.5px] border-border py-1.5">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
