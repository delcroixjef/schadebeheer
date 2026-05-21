import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";
import { formatEur } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/instellingen")({
  component: SettingsPage,
});

function SettingsPage() {
  const insurers = useQuery({
    queryKey: ["insurers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const abex = useQuery({
    queryKey: ["abex", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("abex_index").select("*").eq("is_active", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <Topbar title="Instellingen" subtitle="Verzekeraars en indexparameters" />
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <SectionHeading>Verzekeraars</SectionHeading>
          <div className="flex flex-col gap-2">
            {insurers.data?.map((i) => (
              <div key={i.id} className="flex justify-between text-[13px] border-b-[0.5px] border-border py-2">
                <span>{i.name}</span>
                <span className="font-medium">≤ {formatEur(Number(i.max_authority_amount))}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHeading>Actieve ABEX-index</SectionHeading>
          {abex.data ? (
            <div className="text-[13px]">
              <div className="text-[22px] font-medium">{abex.data.value}</div>
              <div className="text-text-secondary mt-1">{abex.data.period_label}</div>
            </div>
          ) : (
            <p className="text-[13px] text-text-muted">Geen actieve index.</p>
          )}
        </Card>
      </div>
    </>
  );
}
