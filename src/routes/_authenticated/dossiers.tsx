import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IconPlus, IconChevronRight, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, PrimaryButton, Card } from "@/components/Topbar";
import { InsurerBadge, StatusBadge } from "@/components/InsurerBadge";
import { formatDate } from "@/lib/format";
import { VERZEKERAARS, STATUS_LABELS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";

export const Route = createFileRoute("/_authenticated/dossiers")({
  component: DossiersPage,
});

const schadeLabel = (k: string | null) =>
  SCHADE_TYPES.find((s) => s.value === k)?.label ?? k ?? "—";

function DossiersPage() {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["dossiers", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .select("*")
        .order("schade_datum", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter((d) =>
    [d.klant_naam, d.schade_type ?? "", d.verzekeraar ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase()),
  );

  return (
    <>
      <Topbar
        title="Dossiers"
        subtitle="Alle schadedossiers"
        action={
          <Link to="/nieuwe-schade">
            <PrimaryButton>
              <IconPlus size={14} /> Nieuw dossier
            </PrimaryButton>
          </Link>
        }
      />

      <Card>
        <div className="relative mb-4">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoeken op klant, schade of verzekeraar…"
            className="w-full pl-9 pr-3 py-2 text-[13px] bg-secondary rounded-md border-[0.5px] border-border focus:outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.8fr_60px] gap-2 px-3 py-2 bg-secondary rounded-md text-[11px] font-medium text-text-secondary uppercase tracking-[0.5px] mb-1">
          <span>Dossier</span>
          <span>Klant / Schade</span>
          <span>Verzekeraar</span>
          <span>Schadedatum</span>
          <span>Status</span>
          <span />
        </div>

        {filtered.map((d) => {
          const ins = d.verzekeraar ? VERZEKERAARS[d.verzekeraar as VerzekeraarKey] : null;
          return (
            <Link
              key={d.id}
              to="/dossiers/$id"
              params={{ id: d.id }}
              className="grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.8fr_60px] gap-2 px-3 py-2.5 rounded-md text-[13px] items-center border-b-[0.5px] border-border hover:bg-secondary transition-colors"
            >
              <div className="font-medium">{d.dossiernummer}</div>
              <div>
                <div className="font-medium">{d.klant_naam}</div>
                <div className="text-[11px] text-text-secondary">{schadeLabel(d.schade_type)}</div>
              </div>
              <div>{ins && <InsurerBadge name={ins.name} color={ins.color} />}</div>
              <div className="text-text-secondary">{d.schade_datum ? formatDate(d.schade_datum) : "—"}</div>
              <div><StatusBadge status={d.status} label={STATUS_LABELS[d.status]} /></div>
              <div className="text-right text-text-muted"><IconChevronRight size={14} /></div>
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-[13px] text-text-muted">Geen dossiers gevonden.</div>
        )}
      </Card>
    </>
  );
}
