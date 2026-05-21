import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";
import { formatEur } from "@/lib/format";
import { VERZEKERAARS, VERZEKERAAR_KEYS } from "@/lib/insurers";

export const Route = createFileRoute("/_authenticated/instellingen")({
  component: SettingsPage,
});

function SettingsPage() {
  const abex = useQuery({
    queryKey: ["abex", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("abex_index")
        .select("*")
        .order("ingangsdatum", { ascending: false })
        .limit(1)
        .maybeSingle();
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
            {VERZEKERAAR_KEYS.map((k) => {
              const i = VERZEKERAARS[k];
              return (
                <div key={k} className="flex justify-between text-[13px] border-b-[0.5px] border-border py-2">
                  <span>{i.name}</span>
                  <span className="font-medium">≤ {formatEur(i.maxAuthority)}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <SectionHeading>Actieve ABEX-index</SectionHeading>
          {abex.data ? (
            <div className="text-[13px]">
              <div className="text-[22px] font-medium">{abex.data.indexwaarde}</div>
              <div className="text-text-secondary mt-1">{abex.data.periode}</div>
            </div>
          ) : (
            <p className="text-[13px] text-text-muted">Geen actieve index.</p>
          )}
        </Card>
      </div>
    </>
  );
}
