import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";
import { formatEur, formatDate } from "@/lib/format";
import { useAfgerondDossiers } from "@/lib/precedenten";
import { SCHADE_TYPES, VERZEKERAARS, VERZEKERAAR_KEYS } from "@/lib/insurers";

export const Route = createFileRoute("/_authenticated/precedenten")({
  component: PrecedentenPage,
});

function PrecedentenPage() {
  const { data, isLoading } = useAfgerondDossiers();
  const [fSchade, setFSchade] = useState("");
  const [fVerz, setFVerz] = useState("");

  const filtered = useMemo(() => {
    return (data ?? []).filter(
      (d) =>
        (!fSchade || d.schade_type === fSchade) &&
        (!fVerz || d.verzekeraar === fVerz),
    );
  }, [data, fSchade, fVerz]);

  const perSchadetype = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const d of filtered) {
      const k = d.schade_type ?? "andere";
      const cur = map.get(k) ?? { sum: 0, n: 0 };
      cur.sum += d.vergoeding;
      cur.n += 1;
      map.set(k, cur);
    }
    return Array.from(map.entries()).map(([schade, v]) => ({
      schade: SCHADE_TYPES.find((s) => s.value === schade)?.label ?? schade,
      gemiddeld: Math.round(v.sum / v.n),
    }));
  }, [filtered]);

  const overTijd = useMemo(() => {
    const sorted = [...filtered]
      .filter((d) => d.schade_datum)
      .sort((a, b) => (a.schade_datum! < b.schade_datum! ? -1 : 1));
    // group by year-month
    const map = new Map<string, { sum: number; n: number }>();
    for (const d of sorted) {
      const ym = d.schade_datum!.slice(0, 7);
      const cur = map.get(ym) ?? { sum: 0, n: 0 };
      cur.sum += d.vergoeding;
      cur.n += 1;
      map.set(ym, cur);
    }
    return Array.from(map.entries()).map(([periode, v]) => ({
      periode,
      gemiddeld: Math.round(v.sum / v.n),
    }));
  }, [filtered]);

  if (!isLoading && (data?.length ?? 0) <= 5) {
    return (
      <>
        <Topbar title="Precedenten" subtitle="Inzicht in afgeronde schades" />
        <Card>
          <p className="text-[13px] text-text-secondary">
            Precedenten worden beschikbaar zodra er minstens 6 afgeronde dossiers in de databank zitten. Huidig
            aantal: {data?.length ?? 0}.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Precedenten"
        subtitle={`Databank van ${data?.length ?? 0} afgeronde dossiers`}
      />

      <Card className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter label="Schadesoort" value={fSchade} onChange={setFSchade}>
            <option value="">Alle</option>
            {SCHADE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Filter>
          <Filter label="Verzekeraar" value={fVerz} onChange={setFVerz}>
            <option value="">Alle</option>
            {VERZEKERAAR_KEYS.map((k) => (
              <option key={k} value={k}>{VERZEKERAARS[k].name}</option>
            ))}
          </Filter>
          <div className="ml-auto text-[12px] text-text-muted">
            {filtered.length} dossiers in selectie
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card>
          <SectionHeading>Gemiddelde vergoeding per schadesoort</SectionHeading>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={perSchadetype}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="schade" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => formatEur(v)}
                  contentStyle={{ fontSize: 12, border: "0.5px solid rgba(0,0,0,0.12)" }}
                />
                <Bar dataKey="gemiddeld" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionHeading>Vergoed bedrag over tijd</SectionHeading>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={overTijd}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="periode" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => formatEur(v)}
                  contentStyle={{ fontSize: 12, border: "0.5px solid rgba(0,0,0,0.12)" }}
                />
                <Line
                  type="monotone"
                  dataKey="gemiddeld"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeading>Afgeronde dossiers</SectionHeading>
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr_0.8fr_0.8fr] gap-2 px-3 py-2 bg-secondary rounded-md text-[11px] font-medium text-text-secondary uppercase tracking-[0.5px] mb-1">
          <span>Dossier</span>
          <span>Schadesoort</span>
          <span>Verzekeraar</span>
          <span>Vergoeding</span>
          <span>ABEX</span>
          <span>Datum</span>
          <span>AI-score</span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-[13px] text-text-muted py-4">Geen dossiers in selectie.</p>
        ) : (
          filtered.map((d) => (
            <div
              key={d.id}
              className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr_0.8fr_0.8fr] gap-2 px-3 py-2.5 text-[13px] border-b-[0.5px] border-border items-center"
            >
              <span className="font-medium">{d.dossiernummer}</span>
              <span className="text-text-secondary">
                {SCHADE_TYPES.find((s) => s.value === d.schade_type)?.label ?? "—"}
              </span>
              <span className="text-text-secondary">
                {d.verzekeraar
                  ? (VERZEKERAARS[d.verzekeraar as keyof typeof VERZEKERAARS]?.name ?? d.verzekeraar)
                  : "—"}
              </span>
              <span className="font-medium">{formatEur(d.vergoeding)}</span>
              <span className="text-text-secondary">{d.abex_index_gebruikt ?? "—"}</span>
              <span className="text-text-secondary">
                {d.schade_datum ? formatDate(d.schade_datum) : "—"}
              </span>
              <span className="text-text-secondary">{d.ai_score ?? "—"}</span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="text-text-secondary uppercase tracking-[0.5px] text-[11px]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input !py-1 !text-[12px]"
      >
        {children}
      </select>
    </label>
  );
}
