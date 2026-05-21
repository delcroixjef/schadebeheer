import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { InsurerBadge, StatusBadge } from "@/components/InsurerBadge";
import { formatDate, formatEur } from "@/lib/format";
import { VERZEKERAARS, VERZEKERAAR_KEYS, STATUS_LABELS, type VerzekeraarKey } from "@/lib/insurers";
import { useSession } from "@/lib/session";
import { IconCheck, IconAlertTriangle, IconChevronDown, IconChevronRight, IconFileDownload, IconFileTypePdf } from "@tabler/icons-react";
import jsPDF from "jspdf";

export const Route = createFileRoute("/_authenticated/auditrapport")({
  component: AuditReport,
});

const PAGE_SIZE = 50;
const REQUIRED_STEPS = ["dossier_aangemaakt", "berekening_opgeslagen", "bestek_geanalyseerd", "akkoord_klant", "regeling_opgesteld"];

type Dossier = {
  id: string;
  dossiernummer: string;
  klant_naam: string;
  verzekeraar: VerzekeraarKey | null;
  schade_type: string | null;
  status: string;
  abex_index_gebruikt: number | null;
  ai_score: number | null;
  beheerder_id: string | null;
  updated_at: string;
  ondertekend_op: string | null;
};

type AuditEntry = {
  id: string;
  dossier_id: string | null;
  actie: string;
  timestamp: string;
  uitgevoerd_door: string | null;
  detail_json: unknown;
};

function AuditReport() {
  const session = useSession();
  const isAdmin = session?.role === "admin";

  const today = new Date().toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const [van, setVan] = useState(ninetyAgo);
  const [tot, setTot] = useState(today);
  const [verzekeraar, setVerzekeraar] = useState<string>("alle");
  const [status, setStatus] = useState<string>("alle");
  const [beheerder, setBeheerder] = useState<string>("alle");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: dossiers = [] } = useQuery({
    queryKey: ["audit-dossiers", van, tot, verzekeraar, status, beheerder],
    queryFn: async () => {
      let q = supabase
        .from("dossiers")
        .select("id,dossiernummer,klant_naam,verzekeraar,schade_type,status,abex_index_gebruikt,ai_score,beheerder_id,updated_at,ondertekend_op")
        .gte("updated_at", `${van}T00:00:00`)
        .lte("updated_at", `${tot}T23:59:59`)
        .order("updated_at", { ascending: false });
      if (verzekeraar !== "alle") q = q.eq("verzekeraar", verzekeraar as VerzekeraarKey);
      if (status !== "alle") q = q.eq("status", status as Dossier["status"] as never);
      if (beheerder !== "alle") q = q.eq("beheerder_id", beheerder);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Dossier[];
    },
  });

  const dossierIds = dossiers.map((d) => d.id);

  const { data: lijnen = [] } = useQuery({
    queryKey: ["audit-lijnen", dossierIds.join(",")],
    enabled: dossierIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schade_lijnen")
        .select("dossier_id,subtotaal")
        .in("dossier_id", dossierIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: auditEntries = [] } = useQuery({
    queryKey: ["audit-entries", dossierIds.join(",")],
    enabled: dossierIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .in("dossier_id", dossierIds)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
  });

  const { data: activeAbex } = useQuery({
    queryKey: ["abex-active"],
    queryFn: async () => {
      const { data } = await supabase.from("abex_index").select("indexwaarde,ingangsdatum").order("ingangsdatum", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lijnen) {
      map.set(l.dossier_id, (map.get(l.dossier_id) ?? 0) + Number(l.subtotaal ?? 0));
    }
    return map;
  }, [lijnen]);

  const entriesByDossier = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of auditEntries) {
      if (!e.dossier_id) continue;
      const arr = map.get(e.dossier_id) ?? [];
      arr.push(e);
      map.set(e.dossier_id, arr);
    }
    return map;
  }, [auditEntries]);

  function compliance(d: Dossier) {
    const vergoeding = totals.get(d.id) ?? 0;
    const max = d.verzekeraar ? VERZEKERAARS[d.verzekeraar].maxAuthority : Infinity;
    const bevoegdheid = vergoeding <= max;
    const abexOk = activeAbex ? d.abex_index_gebruikt === activeAbex.indexwaarde : true;
    const entries = entriesByDossier.get(d.id) ?? [];
    const acties = new Set(entries.map((e) => e.actie));
    const auditCompleet = REQUIRED_STEPS.every((s) => acties.has(s));
    const ok = bevoegdheid && abexOk && auditCompleet;
    return { ok, bevoegdheid, abexOk, auditCompleet, vergoeding };
  }

  const totalPages = Math.max(1, Math.ceil(dossiers.length / PAGE_SIZE));
  const pageRows = dossiers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function exportCSV() {
    const headers = ["Dossiernummer", "Klant", "Verzekeraar", "Schadesoort", "Vergoeding", "ABEX", "AI-score", "Datum", "Status", "Compliance"];
    const lines = [headers.join(";")];
    for (const d of dossiers) {
      const c = compliance(d);
      lines.push([
        d.dossiernummer,
        `"${d.klant_naam.replace(/"/g, '""')}"`,
        d.verzekeraar ?? "",
        d.schade_type ?? "",
        c.vergoeding.toFixed(2).replace(".", ","),
        d.abex_index_gebruikt ?? "",
        d.ai_score ?? "",
        formatDate(d.updated_at),
        d.status,
        c.ok ? "OK" : "WARN",
      ].join(";"));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditrapport-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFontSize(16);
    pdf.setTextColor(141, 185, 46);
    pdf.text("WelZeker — Auditrapport", 14, 16);
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Periode: ${formatDate(van)} – ${formatDate(tot)}`, 14, 23);
    pdf.text(`Verzekeraar: ${verzekeraar} · Status: ${status}${isAdmin ? ` · Beheerder: ${beheerder}` : ""}`, 14, 28);
    pdf.text(`Aantal dossiers: ${dossiers.length}`, 14, 33);

    pdf.setFontSize(8);
    pdf.setTextColor(0, 0, 0);
    let y = 42;
    const headers = ["Dossier", "Klant", "Verz.", "Type", "Vergoeding", "ABEX", "AI", "Datum", "Status", "✓"];
    const cols = [14, 38, 75, 100, 125, 155, 172, 185, 210, 240];
    headers.forEach((h, i) => pdf.text(h, cols[i], y));
    pdf.setLineWidth(0.1);
    pdf.line(14, y + 1.5, 285, y + 1.5);
    y += 6;

    for (const d of dossiers) {
      if (y > 195) { pdf.addPage(); y = 16; }
      const c = compliance(d);
      const row = [
        d.dossiernummer,
        d.klant_naam.slice(0, 22),
        d.verzekeraar ? VERZEKERAARS[d.verzekeraar].name.slice(0, 10) : "—",
        (d.schade_type ?? "—").slice(0, 12),
        formatEur(c.vergoeding),
        String(d.abex_index_gebruikt ?? "—"),
        d.ai_score != null ? String(d.ai_score) : "—",
        formatDate(d.updated_at),
        (STATUS_LABELS[d.status] ?? d.status).slice(0, 14),
        c.ok ? "OK" : "!",
      ];
      row.forEach((v, i) => pdf.text(String(v), cols[i], y));
      y += 5;
    }
    pdf.save(`auditrapport-${today}.pdf`);
  }

  return (
    <>
      <Topbar
        title="Auditrapport"
        subtitle="Volledig overzicht van afgehandelde dossiers met compliance-controle"
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV} className="inline-flex items-center gap-1.5 border border-border rounded-md px-3 py-2 text-[13px] hover:bg-bg-muted">
              <IconFileDownload size={16} /> Exporteer als CSV
            </button>
            <PrimaryButton onClick={exportPDF}>
              <IconFileTypePdf size={16} /> Exporteer als PDF
            </PrimaryButton>
          </div>
        }
      />

      <Card className="mb-4">
        <SectionHeading>Filters</SectionHeading>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[13px]">
          <div>
            <label className="block text-text-muted text-[11px] mb-1">Van</label>
            <input type="date" value={van} onChange={(e) => { setVan(e.target.value); setPage(0); }} className="w-full border border-border rounded-md px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-text-muted text-[11px] mb-1">Tot</label>
            <input type="date" value={tot} onChange={(e) => { setTot(e.target.value); setPage(0); }} className="w-full border border-border rounded-md px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-text-muted text-[11px] mb-1">Verzekeraar</label>
            <select value={verzekeraar} onChange={(e) => { setVerzekeraar(e.target.value); setPage(0); }} className="w-full border border-border rounded-md px-2 py-1.5">
              <option value="alle">Alle</option>
              {VERZEKERAAR_KEYS.map((k) => <option key={k} value={k}>{VERZEKERAARS[k].name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-text-muted text-[11px] mb-1">Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="w-full border border-border rounded-md px-2 py-1.5">
              <option value="alle">Alle</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="block text-text-muted text-[11px] mb-1">Beheerder</label>
              <select value={beheerder} onChange={(e) => { setBeheerder(e.target.value); setPage(0); }} className="w-full border border-border rounded-md px-2 py-1.5">
                <option value="alle">Alle</option>
                {Array.from(new Set(dossiers.map((d) => d.beheerder_id).filter(Boolean))).map((id) => (
                  <option key={id!} value={id!}>{id!.slice(0, 8)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeading>Dossiers ({dossiers.length})</SectionHeading>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-text-muted text-[11px] border-b border-border">
                <th className="py-2 pr-2 w-6"></th>
                <th className="py-2 pr-3">Dossier</th>
                <th className="py-2 pr-3">Klant</th>
                <th className="py-2 pr-3">Verzekeraar</th>
                <th className="py-2 pr-3">Schadesoort</th>
                <th className="py-2 pr-3 text-right">Vergoeding</th>
                <th className="py-2 pr-3">ABEX</th>
                <th className="py-2 pr-3">AI</th>
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d) => {
                const c = compliance(d);
                const isOpen = expanded[d.id];
                const entries = entriesByDossier.get(d.id) ?? [];
                return (
                  <tbody key={d.id} className="contents">
                    <tr className="border-b-[0.5px] border-border hover:bg-bg-muted">
                      <td className="py-2 pr-2">

                        <button onClick={() => setExpanded((s) => ({ ...s, [d.id]: !s[d.id] }))} className="text-text-muted hover:text-foreground">
                          {isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-medium">{d.dossiernummer}</td>
                      <td className="py-2 pr-3">{d.klant_naam}</td>
                      <td className="py-2 pr-3">{d.verzekeraar ? <InsurerBadge name={VERZEKERAARS[d.verzekeraar].name} color={VERZEKERAARS[d.verzekeraar].color} /> : "—"}</td>
                      <td className="py-2 pr-3">{d.schade_type ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatEur(c.vergoeding)}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.abex_index_gebruikt ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.ai_score ?? "—"}</td>
                      <td className="py-2 pr-3">{formatDate(d.updated_at)}</td>
                      <td className="py-2 pr-3"><StatusBadge status={d.status} label={STATUS_LABELS[d.status]} /></td>
                      <td className="py-2 pr-3">
                        {c.ok ? (
                          <span className="inline-flex items-center gap-1 text-status-green-fg"><IconCheck size={14} /> OK</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-status-red-fg" title={[
                            !c.bevoegdheid && "Boven regelingsbevoegdheid",
                            !c.abexOk && "ABEX wijkt af",
                            !c.auditCompleet && "Auditlog incompleet",
                          ].filter(Boolean).join(" · ")}>
                            <IconAlertTriangle size={14} /> Controle
                          </span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-bg-muted/50">
                        <td colSpan={11} className="px-6 py-3">
                          <div className="text-[11px] text-text-muted mb-2">Auditlog</div>
                          <div className="grid grid-cols-1 gap-1">
                            {entries.length === 0 ? (
                              <span className="text-[12px] text-text-muted">Geen log-entries voor dit dossier.</span>
                            ) : entries.map((e) => (
                              <div key={e.id} className="flex justify-between text-[12px] border-b-[0.5px] border-border py-1">
                                <span className="font-medium">{e.actie}</span>
                                <span className="text-text-muted">{formatDate(e.timestamp)} · {new Date(e.timestamp).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-4 text-[11px]">
                            <span className={c.bevoegdheid ? "text-status-green-fg" : "text-status-red-fg"}>● Regelingsbevoegdheid</span>
                            <span className={c.abexOk ? "text-status-green-fg" : "text-status-red-fg"}>● ABEX correct</span>
                            <span className={c.auditCompleet ? "text-status-green-fg" : "text-status-red-fg"}>● Auditlog compleet</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>

                );
              })}
              {pageRows.length === 0 && (
                <tr><td colSpan={11} className="py-8 text-center text-text-muted text-[13px]">Geen dossiers in dit filterbereik.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-[12px]">
            <span className="text-text-muted">Pagina {page + 1} van {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="border border-border rounded-md px-3 py-1 disabled:opacity-40">Vorige</button>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="border border-border rounded-md px-3 py-1 disabled:opacity-40">Volgende</button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
