import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IconPlus, IconChevronRight, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, PrimaryButton, Card } from "@/components/Topbar";
import { InsurerBadge, StatusBadge } from "@/components/InsurerBadge";
import { formatEur, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dossiers")({
  component: DossiersPage,
});

function DossiersPage() {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["dossiers", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .select("*, insurer:insurers(name, color_token)")
        .order("damage_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter((d) =>
    [d.customer_name, d.damage_type, d.insurer?.name ?? ""]
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

        <div className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr_60px] gap-2 px-3 py-2 bg-secondary rounded-md text-[11px] font-medium text-text-secondary uppercase tracking-[0.5px] mb-1">
          <span>Klant</span>
          <span>Schade</span>
          <span>Verzekeraar</span>
          <span>Bedrag</span>
          <span>Status</span>
          <span />
        </div>

        {filtered.map((d) => (
          <Link
            key={d.id}
            to="/dossiers/$id"
            params={{ id: d.id }}
            className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr_60px] gap-2 px-3 py-2.5 rounded-md text-[13px] items-center border-b-[0.5px] border-border hover:bg-secondary transition-colors"
          >
            <div className="font-medium">{d.customer_name}</div>
            <div>
              <div>{d.damage_type}</div>
              <div className="text-[11px] text-text-secondary">{formatDate(d.damage_date)}</div>
            </div>
            <div>{d.insurer && <InsurerBadge name={d.insurer.name} color={d.insurer.color_token} />}</div>
            <div className="font-medium">{formatEur(Number(d.amount))}</div>
            <div><StatusBadge status={d.status} label={d.status_label} /></div>
            <div className="text-right text-text-muted"><IconChevronRight size={14} /></div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-[13px] text-text-muted">Geen dossiers gevonden.</div>
        )}
      </Card>
    </>
  );
}
