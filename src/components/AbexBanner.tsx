import { useQuery } from "@tanstack/react-query";
import { IconRefresh } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";

export function AbexBanner() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["abex-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("abex_index")
        .select("value, period_label, updated_at")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updated = data?.updated_at
    ? new Date(data.updated_at).toLocaleDateString("nl-BE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <div className="flex items-center justify-between gap-4 bg-primary-light border-[0.5px] border-primary rounded-lg px-4 py-2.5">
      <div className="flex items-center gap-6 text-[12px] text-primary-dark">
        <div>
          <span className="text-text-muted mr-1.5">ABEX-index</span>
          <span className="font-medium">{data?.value ?? "—"}</span>
          {data?.period_label && (
            <span className="text-text-secondary ml-1.5">({data.period_label})</span>
          )}
        </div>
        <div>
          <span className="text-text-muted mr-1.5">Bijgewerkt</span>
          <span>{updated}</span>
        </div>
      </div>
      <button
        onClick={() => void refetch()}
        className="text-primary-dark hover:text-primary transition-colors disabled:opacity-50"
        disabled={isFetching}
        title="Vernieuwen"
        aria-label="Vernieuwen"
      >
        <IconRefresh size={14} className={isFetching ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
