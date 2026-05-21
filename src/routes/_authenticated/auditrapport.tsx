import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/auditrapport")({
  component: AuditReport,
});

function AuditReport() {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <Topbar title="Auditrapport" subtitle="Recente acties in het systeem" />
      <Card>
        <SectionHeading>Logboek</SectionHeading>
        {(data ?? []).length === 0 ? (
          <p className="text-[13px] text-text-muted">Geen log-entries.</p>
        ) : (
          <div className="space-y-2">
            {data?.map((row) => (
              <div key={row.id} className="flex justify-between text-[13px] border-b-[0.5px] border-border py-2">
                <span>{row.actie}</span>
                <span className="text-text-muted text-[11px]">{formatDate(row.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
