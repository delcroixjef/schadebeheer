import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { formatEur, formatDate } from "@/lib/format";
import { VERZEKERAARS, VERZEKERAAR_KEYS } from "@/lib/insurers";

export const Route = createFileRoute("/_authenticated/instellingen")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();

  const history = useQuery({
    queryKey: ["abex", "history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("abex_index")
        .select("*")
        .order("ingangsdatum", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const active = history.data?.[0] ?? null;

  const [indexwaarde, setIndexwaarde] = useState("");
  const [periode, setPeriode] = useState("");
  const [ingangsdatum, setIngangsdatum] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(indexwaarde, 10);
    if (!Number.isFinite(n) || n < 100 || n > 5000) {
      toast.error("Geef een geldige indexwaarde (100-5000).");
      return;
    }
    if (!periode.trim()) {
      toast.error("Periode is vereist.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("abex_index").insert({
      indexwaarde: n,
      periode: periode.trim(),
      ingangsdatum,
      manueel_ingevoerd: true,
      bron: "manueel",
    });
    setSaving(false);
    if (error) {
      toast.error("Opslaan mislukt: " + error.message);
      return;
    }
    toast.success("ABEX-index opgeslagen.");
    setIndexwaarde("");
    setPeriode("");
    await qc.invalidateQueries({ queryKey: ["abex"] });
    await qc.invalidateQueries({ queryKey: ["abex-active"] });
  };

  return (
    <>
      <Topbar title="Instellingen" subtitle="Verzekeraars en ABEX-indexbeheer" />

      <Card className="mb-4">
        <SectionHeading>Actieve ABEX-index</SectionHeading>
        {active ? (
          <div className="flex items-end gap-8">
            <div>
              <div className="text-[36px] font-medium leading-none text-primary-dark">{active.indexwaarde}</div>
              <div className="text-[13px] text-text-secondary mt-1.5">{active.periode}</div>
            </div>
            <div className="text-[12px] text-text-muted pb-1">
              Ingang {formatDate(active.ingangsdatum)} ·{" "}
              {active.manueel_ingevoerd ? "manueel ingevoerd" : `automatisch (${active.bron ?? "—"})`}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-text-muted">Geen actieve index.</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card>
          <SectionHeading>Manueel ABEX-index instellen</SectionHeading>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Indexwaarde">
              <input
                type="number"
                value={indexwaarde}
                onChange={(e) => setIndexwaarde(e.target.value)}
                placeholder="bv. 1023"
                className="input"
                required
              />
            </Field>
            <Field label="Periode">
              <input
                type="text"
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                placeholder="bv. 2de semester 2026"
                className="input"
                required
              />
            </Field>
            <Field label="Ingangsdatum">
              <input
                type="date"
                value={ingangsdatum}
                onChange={(e) => setIngangsdatum(e.target.value)}
                className="input"
                required
              />
            </Field>
            <div>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Opslaan…" : "Opslaan"}
              </PrimaryButton>
            </div>
          </form>
        </Card>

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
      </div>

      <Card>
        <SectionHeading>Historiek (laatste 6)</SectionHeading>
        <div className="grid grid-cols-[1fr_2fr_1.2fr_1.2fr_1fr] gap-2 px-3 py-2 bg-secondary rounded-md text-[11px] font-medium text-text-secondary uppercase tracking-[0.5px] mb-1">
          <span>Indexwaarde</span>
          <span>Periode</span>
          <span>Ingangsdatum</span>
          <span>Bron</span>
          <span>Type</span>
        </div>
        {history.data?.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[1fr_2fr_1.2fr_1.2fr_1fr] gap-2 px-3 py-2.5 text-[13px] border-b-[0.5px] border-border items-center"
          >
            <span className="font-medium">{r.indexwaarde}</span>
            <span>{r.periode}</span>
            <span className="text-text-secondary">{formatDate(r.ingangsdatum)}</span>
            <span className="text-text-muted text-[12px] truncate">{r.bron ?? "—"}</span>
            <span>
              {r.manueel_ingevoerd ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-status-amber-bg text-status-amber-fg">manueel</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-status-green-bg text-status-green-fg">automatisch</span>
              )}
            </span>
          </div>
        ))}
        {history.data && history.data.length === 0 && (
          <p className="text-[13px] text-text-muted py-4">Nog geen historiek.</p>
        )}
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-secondary uppercase tracking-[0.5px]">{label}</span>
      {children}
    </label>
  );
}
