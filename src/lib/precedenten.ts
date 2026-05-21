import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PrecedentDossier = {
  id: string;
  dossiernummer: string;
  schade_type: string | null;
  verzekeraar: string | null;
  schade_datum: string | null;
  ai_score: number | null;
  abex_index_gebruikt: number | null;
  vergoeding: number;
};

type RawRow = {
  id: string;
  dossiernummer: string;
  schade_type: string | null;
  verzekeraar: string | null;
  schade_datum: string | null;
  ai_score: number | null;
  abex_index_gebruikt: number | null;
  heeft_vrijstelling: boolean;
  vrijstelling_bedrag: number | null;
  schade_lijnen: { subtotaal: number | null }[] | null;
};

async function fetchAfgerond(): Promise<PrecedentDossier[]> {
  const { data, error } = await supabase
    .from("dossiers")
    .select(
      "id, dossiernummer, schade_type, verzekeraar, schade_datum, ai_score, abex_index_gebruikt, heeft_vrijstelling, vrijstelling_bedrag, schade_lijnen(subtotaal)",
    )
    .eq("status", "afgerond");
  if (error) throw error;
  return ((data ?? []) as unknown as RawRow[]).map((d) => {
    const sub = (d.schade_lijnen ?? []).reduce<number>(
      (acc, l) => acc + Number(l.subtotaal ?? 0),
      0,
    );
    const vrij = d.heeft_vrijstelling ? Number(d.vrijstelling_bedrag ?? 0) : 0;
    return {
      id: d.id,
      dossiernummer: d.dossiernummer,
      schade_type: d.schade_type,
      verzekeraar: d.verzekeraar,
      schade_datum: d.schade_datum,
      ai_score: d.ai_score,
      abex_index_gebruikt: d.abex_index_gebruikt,
      vergoeding: Math.max(0, sub - vrij),
    };
  });
}

export function useAfgerondDossiers() {
  return useQuery({
    queryKey: ["precedenten", "afgerond"],
    queryFn: fetchAfgerond,
    staleTime: 60_000,
  });
}

export function usePrecedentenAvailable() {
  const q = useAfgerondDossiers();
  return { available: (q.data?.length ?? 0) > 5, count: q.data?.length ?? 0 };
}

export type VergelijkbareStats = {
  count: number;
  gemiddeld: number;
  min: number;
  max: number;
};

export function computeStats(rows: PrecedentDossier[]): VergelijkbareStats | null {
  if (rows.length === 0) return null;
  const v = rows.map((r) => r.vergoeding).filter((x) => x > 0);
  if (v.length === 0) return null;
  return {
    count: v.length,
    gemiddeld: v.reduce((a, b) => a + b, 0) / v.length,
    min: Math.min(...v),
    max: Math.max(...v),
  };
}
