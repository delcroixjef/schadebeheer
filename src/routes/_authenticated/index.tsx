import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  IconPlus,
  IconBuilding,
  IconRefresh,
  IconCalculator,
  IconFileSearch,
  IconFileExport,
  IconChevronRight,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, PrimaryButton, Card } from "@/components/Topbar";
import { InsurerBadge, StatusBadge } from "@/components/InsurerBadge";
import { formatEur, formatEurK, formatDate } from "@/lib/format";
import { VERZEKERAARS, VERZEKERAAR_KEYS, STATUS_LABELS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

const schadeLabel = (k: string | null) =>
  SCHADE_TYPES.find((s) => s.value === k)?.label ?? k ?? "—";

function Dashboard() {
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

  const dossiers = useQuery({
    queryKey: ["dossiers", "recent"],
    queryFn: async () => {
      const [{ data: rows, error }, { data: lijnen }] = await Promise.all([
        supabase.from("dossiers").select("*").order("schade_datum", { ascending: false }).limit(5),
        supabase.from("schade_lijnen").select("dossier_id, subtotaal"),
      ]);
      if (error) throw error;
      const totals = new Map<string, number>();
      (lijnen ?? []).forEach((l) => totals.set(l.dossier_id, (totals.get(l.dossier_id) ?? 0) + Number(l.subtotaal)));
      return (rows ?? []).map((d) => ({ ...d, _totaal: totals.get(d.id) ?? 0 }));
    },
  });

  const stats = useQuery({
    queryKey: ["dossiers", "stats"],
    queryFn: async () => {
      const [{ data: rows, error }, { data: lijnen }] = await Promise.all([
        supabase.from("dossiers").select("id, status, created_at"),
        supabase.from("schade_lijnen").select("dossier_id, subtotaal"),
      ]);
      if (error) throw error;
      const data = rows ?? [];
      const totals = new Map<string, number>();
      (lijnen ?? []).forEach((l) => totals.set(l.dossier_id, (totals.get(l.dossier_id) ?? 0) + Number(l.subtotaal)));
      const lopend = data.filter((d) => d.status !== "afgerond").length;
      const inBeh = data.filter((d) => ["berekening", "bestekanalyse"].includes(d.status)).length;
      const actie = data.filter((d) => d.status === "concept").length;
      const afgehandeld2025 = data.filter((d) => d.status === "afgerond" && new Date(d.created_at).getFullYear() === 2025).length;
      const totaal = data.filter((d) => d.status === "afgerond").reduce((s, d) => s + (totals.get(d.id) ?? 0), 0);
      const gemiddeld = afgehandeld2025 > 0 ? totaal / afgehandeld2025 : 0;
      const week = data.filter((d) => Date.now() - new Date(d.created_at).getTime() < 7 * 86400000).length;
      return { lopend, inBeh, actie, afgehandeld2025, totaal, gemiddeld, week };
    },
  });

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Overzicht lopende schadedossiers"
        action={
          <Link to="/nieuwe-schade">
            <PrimaryButton>
              <IconPlus size={14} />
              Nieuw dossier
            </PrimaryButton>
          </Link>
        }
      />

      <div className="mb-6 rounded-md border-[0.5px] border-primary bg-primary-light px-3.5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconBuilding size={16} className="text-primary-dark" />
          <span className="text-[12px] text-primary-dark font-medium">Actieve ABEX-index:</span>
          <span className="text-[13px] font-medium text-primary-dark">
            {abex.data ? `${abex.data.indexwaarde} (${abex.data.periode})` : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-primary-dark">
          {abex.data && <span>Bijgewerkt {formatDate(abex.data.created_at)}</span>}
          <IconRefresh size={14} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Lopende dossiers" value={stats.data?.lopend ?? 0} badge={`${stats.data?.week ?? 0} nieuw deze week`} badgeColor="blue" />
        <StatCard label="In behandeling" value={stats.data?.inBeh ?? 0} badge={`Actie vereist: ${stats.data?.actie ?? 0}`} badgeColor="amber" />
        <StatCard label="Afgehandeld (2025)" value={stats.data?.afgehandeld2025 ?? 0} badge="↑ 12% vs vorig jaar" badgeColor="green" />
        <StatCard
          label="Totaal vergoed"
          value={formatEurK(Number(stats.data?.totaal ?? 0))}
          sub={`Gemiddeld ${formatEur(Math.round(Number(stats.data?.gemiddeld ?? 0)))}/dossier`}
        />
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[14px] font-medium text-foreground">Recente dossiers</div>
            <Link to="/dossiers" className="text-[12px] text-primary hover:text-primary-dark">
              Alle dossiers →
            </Link>
          </div>

          <div className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_60px] gap-2 px-3 py-2 bg-secondary rounded-md text-[11px] font-medium text-text-secondary uppercase tracking-[0.5px] mb-1">
            <span>Klant / Schade</span>
            <span>Verzekeraar</span>
            <span>Bedrag</span>
            <span>Status</span>
            <span />
          </div>

          {dossiers.data?.map((d) => {
            const ins = d.verzekeraar ? VERZEKERAARS[d.verzekeraar as VerzekeraarKey] : null;
            return (
              <Link
                key={d.id}
                to="/dossiers/$id"
                params={{ id: d.id }}
                className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_60px] gap-2 px-3 py-2.5 rounded-md text-[13px] items-center border-b-[0.5px] border-border hover:bg-secondary transition-colors"
              >
                <div>
                  <div className="font-medium">{d.klant_naam}</div>
                  <div className="text-[11px] text-text-secondary">
                    {schadeLabel(d.schade_type)} — {d.schade_datum ? formatDate(d.schade_datum) : "—"}
                  </div>
                </div>
                <div>{ins && <InsurerBadge name={ins.name} color={ins.color} />}</div>
                <div className="font-medium">{formatEur(d._totaal)}</div>
                <div>
                  <StatusBadge status={d.status} label={STATUS_LABELS[d.status]} />
                </div>
                <div className="text-right text-text-muted">
                  <IconChevronRight size={14} />
                </div>
              </Link>
            );
          })}
        </Card>

        <div className="flex flex-col gap-3">
          <Card>
            <div className="text-[14px] font-medium text-foreground mb-3">Snelle acties</div>
            <div className="flex flex-col gap-2">
              <QuickAction to="/schadeberekening" icon={<IconCalculator size={18} />} color="green" title="Schade berekenen" sub="Start nieuwe berekening" />
              <QuickAction to="/bestekanalyse" icon={<IconFileSearch size={18} />} color="blue" title="Bestek analyseren" sub="AI-controle klantbestek" />
              <QuickAction to="/regelingsdocumenten" icon={<IconFileExport size={18} />} color="amber" title="Regelingsdoc. opmaken" sub="PDF + handtekening" />
            </div>
          </Card>

          <Card>
            <div className="text-[14px] font-medium text-foreground mb-3">Regelingsbevoegdheid</div>
            <div className="flex flex-col gap-1.5">
              {VERZEKERAAR_KEYS.map((k) => {
                const i = VERZEKERAARS[k];
                return (
                  <div key={k} className="flex justify-between items-center text-[12px]">
                    <span className="text-text-secondary">{i.name}</span>
                    <span className="font-medium">≤ {formatEur(i.maxAuthority)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatCard({
  label, value, badge, badgeColor, sub,
}: {
  label: string; value: number | string; badge?: string; badgeColor?: "blue" | "amber" | "green"; sub?: string;
}) {
  const badgeCls =
    badgeColor === "amber" ? "bg-status-amber-bg text-status-amber-fg"
    : badgeColor === "green" ? "bg-status-green-bg text-status-green-fg"
    : "bg-status-blue-bg text-status-blue-fg";
  return (
    <div className="bg-card border-[0.5px] border-border rounded-xl p-4">
      <div className="text-[12px] text-text-secondary mb-1.5">{label}</div>
      <div className="text-[22px] font-medium text-foreground">{value}</div>
      {badge && <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] ${badgeCls}`}>{badge}</span>}
      {sub && <div className="text-[11px] text-text-muted mt-1">{sub}</div>}
    </div>
  );
}

function QuickAction({
  to, icon, title, sub, color,
}: {
  to: string; icon: React.ReactNode; title: string; sub: string; color: "green" | "blue" | "amber";
}) {
  const iconCls =
    color === "green" ? "bg-status-green-bg text-status-green-fg"
    : color === "blue" ? "bg-status-blue-bg text-status-blue-fg"
    : "bg-status-amber-bg text-status-amber-fg";
  return (
    <Link to={to} className="flex items-center gap-3 p-3.5 rounded-xl border-[0.5px] border-border bg-card hover:border-primary hover:bg-primary-light/30 transition-colors">
      <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${iconCls}`}>{icon}</div>
      <div>
        <div className="text-[13px] font-medium text-foreground">{title}</div>
        <div className="text-[11px] text-text-secondary mt-0.5">{sub}</div>
      </div>
    </Link>
  );
}
