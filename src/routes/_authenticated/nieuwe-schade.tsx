import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { IconDeviceFloppy, IconPlus, IconTrash, IconArrowRight, IconAlertTriangle, IconSparkles, IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { WizardSteps, type WizardStep } from "@/components/WizardSteps";
import { Step5Regeling } from "@/components/Step5Regeling";
import { GlasbraakCalculator } from "@/components/GlasbraakCalculator";
import { extractBestekLijnen } from "@/lib/bestek-extract.functions";

import { useSession } from "@/lib/session";
import { formatSupabaseError } from "@/lib/supabase-error";
import { VERZEKERAARS, VERZEKERAAR_KEYS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";
import { formatEur } from "@/lib/format";

type SchadeType = (typeof SCHADE_TYPES)[number]["value"];

type Search = { step?: number; id?: string };

export const Route = createFileRoute("/_authenticated/nieuwe-schade")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    step: s.step ? Number(s.step) : 1,
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: Wizard,
});

function Wizard() {
  const { step = 1, id } = Route.useSearch();
  const current = (Math.min(Math.max(step, 1), 5) as WizardStep);

  return (
    <>
      <Topbar title="Nieuw schadedossier" subtitle="Doorloop de 5 stappen om het dossier af te ronden" />
      <WizardSteps current={current} />
      {current === 1 && <Step1 dossierId={id} />}
      {current === 2 && id && <Step2 dossierId={id} />}
      {current === 2 && !id && <MissingDossier />}
      {current === 3 && id && <Navigate to="/bestekanalyse" search={{ dossier: id }} replace />}
      {current === 3 && !id && <MissingDossier />}
      {current === 4 && <Placeholder step={4} />}
      {current === 5 && id && <Step5Regeling dossierId={id} />}
      {current === 5 && !id && <MissingDossier />}
    </>

  );
}

function MissingDossier() {
  return (
    <Card>
      <div className="text-[13px] text-text-secondary">
        Eerst stap 1 voltooien om een dossier aan te maken.
      </div>
    </Card>
  );
}

function Placeholder({ step }: { step: WizardStep }) {
  const labels = { 3: "Bestekanalyse", 4: "Akkoord klant", 5: "Regelingsdocument" } as Record<number, string>;
  return (
    <Card>
      <SectionHeading>{labels[step]}</SectionHeading>
      <p className="text-[13px] text-text-secondary">Deze stap wordt in een volgende prompt uitgewerkt.</p>
    </Card>
  );
}

// ============ STEP 1 ============

function Step1({ dossierId }: { dossierId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();

  const existing = useQuery({
    queryKey: ["dossier", dossierId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dossiers").select("*").eq("id", dossierId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!dossierId,
  });

  const [form, setForm] = useState({
    klant_naam: "",
    klant_adres: "",
    klant_rijksregister: "",
    polis_nummer: "",
    maatschappij_dossiernr: "",
    verzekeraar: "" as VerzekeraarKey | "",
    schade_type: "" as SchadeType | "",
    schade_datum: new Date().toISOString().slice(0, 10),
    schade_omschrijving: "",
  });

  useEffect(() => {
    if (existing.data) {
      setForm({
        klant_naam: existing.data.klant_naam ?? "",
        klant_adres: existing.data.klant_adres ?? "",
        klant_rijksregister: existing.data.klant_rijksregister ?? "",
        polis_nummer: existing.data.polis_nummer ?? "",
        maatschappij_dossiernr: (existing.data as any).maatschappij_dossiernr ?? "",
        verzekeraar: (existing.data.verzekeraar as VerzekeraarKey) ?? "",
        schade_type: (existing.data.schade_type as SchadeType) ?? "",
        schade_datum: existing.data.schade_datum ?? new Date().toISOString().slice(0, 10),
        schade_omschrijving: existing.data.schade_omschrijving ?? "",
      });
    }
  }, [existing.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: abex } = await supabase
        .from("abex_index")
        .select("indexwaarde, periode")
        .order("ingangsdatum", { ascending: false })
        .limit(1)
        .maybeSingle();

      const payload = {
        klant_naam: form.klant_naam,
        klant_adres: form.klant_adres || null,
        klant_rijksregister: form.klant_rijksregister || null,
        polis_nummer: form.polis_nummer || null,
        maatschappij_dossiernr: form.maatschappij_dossiernr || null,
        verzekeraar: form.verzekeraar || null,
        schade_type: form.schade_type || null,
        schade_datum: form.schade_datum,
        schade_omschrijving: form.schade_omschrijving || null,
        abex_index_gebruikt: abex?.indexwaarde ?? null,
        abex_periode: abex?.periode ?? null,
      };

      if (dossierId) {
        const { data, error } = await supabase.from("dossiers").update(payload).eq("id", dossierId).select("id, dossiernummer").single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("dossiers")
        .insert({ ...payload, status: "concept", beheerder_id: session.userId })
        .select("id, dossiernummer")
        .single();
      if (error) throw error;
      await supabase.from("audit_log").insert({
        actie: "dossier_aangemaakt",
        dossier_id: data.id,
        uitgevoerd_door: session.userId,
        detail_json: { dossiernummer: data.dossiernummer, door: session.displayName },
      });
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      void navigate({ to: "/nieuwe-schade", search: { step: 2, id: d.id } });
    },
  });

  const verz = form.verzekeraar ? VERZEKERAARS[form.verzekeraar] : null;

  return (
    <Card className="max-w-3xl">
      <SectionHeading>Stap 1 — Dossierdata</SectionHeading>
      <form
        className="grid grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Klantnaam" required>
          <input className={inputCls} value={form.klant_naam} required onChange={(e) => setForm({ ...form, klant_naam: e.target.value })} />
        </Field>
        <Field label="Adres">
          <input className={inputCls} value={form.klant_adres} onChange={(e) => setForm({ ...form, klant_adres: e.target.value })} />
        </Field>
        <Field label="Rijksregisternummer / KBO">
          <input className={inputCls} value={form.klant_rijksregister} onChange={(e) => setForm({ ...form, klant_rijksregister: e.target.value })} />
        </Field>
        <Field label="Polisnummer">
          <input className={inputCls} value={form.polis_nummer} onChange={(e) => setForm({ ...form, polis_nummer: e.target.value })} />
        </Field>
        <Field label="WelZeker dossiernr">
          <input
            className={inputCls}
            value={existing.data?.dossiernummer ?? "— wordt automatisch toegekend bij opslaan —"}
            readOnly
            disabled
          />
        </Field>
        <Field label="Maatschappij dossiernr">
          <input
            className={inputCls}
            value={form.maatschappij_dossiernr}
            placeholder="bv. SIN-2026-0001"
            onChange={(e) => setForm({ ...form, maatschappij_dossiernr: e.target.value })}
          />
        </Field>
        <Field label="Verzekeraar" required>
          <select className={inputCls} value={form.verzekeraar} required onChange={(e) => setForm({ ...form, verzekeraar: e.target.value as VerzekeraarKey })}>
            <option value="">— kies —</option>
            {VERZEKERAAR_KEYS.map((k) => (
              <option key={k} value={k}>{VERZEKERAARS[k].name}</option>
            ))}
          </select>
          {verz && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-primary-light text-primary-dark">
              Max regelingsbevoegdheid: {formatEur(verz.maxAuthority)}
            </div>
          )}
        </Field>
        <Field label="Schadesoort" required>
          <select className={inputCls} value={form.schade_type} required onChange={(e) => setForm({ ...form, schade_type: e.target.value as SchadeType })}>
            <option value="">— kies —</option>
            {SCHADE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Schadedatum" required>
          <input type="date" className={inputCls} value={form.schade_datum} required onChange={(e) => setForm({ ...form, schade_datum: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label="Omschrijving">
            <textarea rows={4} className={inputCls} value={form.schade_omschrijving} onChange={(e) => setForm({ ...form, schade_omschrijving: e.target.value })} />
          </Field>
        </div>
        {mutation.error && (
          <div className="col-span-2 rounded-md border-[0.5px] border-status-red-fg/40 bg-status-red-bg text-status-red-fg px-3 py-2 text-[12px]">
            {formatSupabaseError(mutation.error)}
          </div>
        )}
        <div className="col-span-2 flex items-center justify-end mt-2">
          <div className="ml-auto flex items-center gap-2">
            <PrimaryButton type="submit">
              <IconDeviceFloppy size={14} />
              {mutation.isPending ? "Bezig…" : dossierId ? "Bewaren & volgende" : "Opslaan & volgende"}
              <IconArrowRight size={14} />
            </PrimaryButton>
          </div>
        </div>
      </form>
    </Card>
  );
}

// ============ STEP 2 ============

type Lijn = {
  id?: string;
  _local?: string;
  omschrijving: string;
  hoeveelheid: number;
  eenheid: string;
  eenheidsprijs_excl_abex: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function Step2({ dossierId }: { dossierId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const dossierQ = useQuery({
    queryKey: ["dossier", dossierId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dossiers").select("*").eq("id", dossierId).single();
      if (error) throw error;
      return data;
    },
  });

  // Glasbraak-dossiers krijgen de gespecialiseerde calculator i.p.v. de generieke schadelijnen-UI
  if (dossierQ.data?.schade_type === "glasbraak") {
    return <GlasbraakCalculator dossierId={dossierId} />;
  }

  const abexQ = useQuery({
    queryKey: ["abex", "active"],
    queryFn: async () => {
      const { data } = await supabase.from("abex_index").select("*").order("ingangsdatum", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });
  const lijnenQ = useQuery({
    queryKey: ["schade_lijnen", dossierId],
    queryFn: async () => {
      const { data, error } = await supabase.from("schade_lijnen").select("*").eq("dossier_id", dossierId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const [lijnen, setLijnen] = useState<Lijn[]>([]);
  const [vrijstelling, setVrijstelling] = useState(0);
  const [heeftIndirect, setHeeftIndirect] = useState(false);

  useEffect(() => {
    if (lijnenQ.data) {
      setLijnen(lijnenQ.data.map((l) => ({
        id: l.id,
        omschrijving: l.omschrijving,
        hoeveelheid: Number(l.hoeveelheid),
        eenheid: l.eenheid ?? "",
        eenheidsprijs_excl_abex: Number(l.eenheidsprijs_excl_abex),
      })));
    }
  }, [lijnenQ.data]);

  useEffect(() => {
    if (dossierQ.data) {
      setVrijstelling(Number(dossierQ.data.vrijstelling_bedrag ?? 0));
      setHeeftIndirect(!!dossierQ.data.heeft_indirecte_verliezen);
    }
  }, [dossierQ.data]);

  const abexActueel = abexQ.data?.indexwaarde ?? 100;
  const abexBasis = dossierQ.data?.abex_index_gebruikt ?? abexActueel;
  const factor = abexBasis > 0 ? abexActueel / abexBasis : 1;

  const rows = lijnen.map((l) => {
    const incl = round2(l.eenheidsprijs_excl_abex * factor);
    const subtotaal = round2(incl * l.hoeveelheid);
    return { ...l, incl, subtotaal };
  });

  const subtotaal = round2(rows.reduce((s, r) => s + r.subtotaal, 0));
  const indirect = heeftIndirect ? round2(subtotaal * 0.1) : 0;
  const basisBtw = round2(subtotaal + indirect);
  const btw = round2(basisBtw * 0.21);
  const vrijstellingApplied = Math.min(vrijstelling, basisBtw + btw);
  const totaal = round2(basisBtw + btw - vrijstellingApplied);

  const verzKey = dossierQ.data?.verzekeraar as VerzekeraarKey | null | undefined;
  const verz = verzKey ? VERZEKERAARS[verzKey] : null;
  const limietPct = verz ? totaal / verz.maxAuthority : 0;

  const addRow = () =>
    setLijnen((ls) => [
      ...ls,
      { _local: crypto.randomUUID(), omschrijving: "", hoeveelheid: 1, eenheid: "stuk", eenheidsprijs_excl_abex: 0 },
    ]);
  const updateRow = (idx: number, patch: Partial<Lijn>) =>
    setLijnen((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeRow = (idx: number) => setLijnen((ls) => ls.filter((_, i) => i !== idx));

  const saveMutation = useMutation({
    mutationFn: async (opts: { goNext: boolean }) => {
      // Replace lijnen: delete existing, insert current.
      await supabase.from("schade_lijnen").delete().eq("dossier_id", dossierId);
      if (lijnen.length) {
        const rowsToInsert = lijnen.map((l) => {
          const incl = round2(l.eenheidsprijs_excl_abex * factor);
          return {
            dossier_id: dossierId,
            omschrijving: l.omschrijving,
            hoeveelheid: l.hoeveelheid,
            eenheid: l.eenheid || null,
            eenheidsprijs_excl_abex: l.eenheidsprijs_excl_abex,
            eenheidsprijs_incl_abex: incl,
            subtotaal: round2(incl * l.hoeveelheid),
          };
        });
        const { error } = await supabase.from("schade_lijnen").insert(rowsToInsert);
        if (error) throw error;
      }
      const { error: dErr } = await supabase
        .from("dossiers")
        .update({
          vrijstelling_bedrag: vrijstelling,
          heeft_vrijstelling: vrijstelling > 0,
          heeft_indirecte_verliezen: heeftIndirect,
          status: opts.goNext ? "berekening" : dossierQ.data?.status ?? "concept",
        })
        .eq("id", dossierId);
      if (dErr) throw dErr;
      return opts;
    },
    onSuccess: ({ goNext }) => {
      qc.invalidateQueries({ queryKey: ["schade_lijnen", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossier", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      if (goNext) void navigate({ to: "/nieuwe-schade", search: { step: 3, id: dossierId } });
    },
  });

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4">
      <div className="flex flex-col gap-4">
        <Card>
          <SectionHeading>Schadelijnen</SectionHeading>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2 px-2 py-1.5 text-[11px] text-text-secondary uppercase tracking-[0.5px] bg-secondary rounded-md mb-1">
            <span>Omschrijving</span>
            <span>Hoeveelheid / eenheid</span>
            <span>EP incl. ABEX</span>
            <span>Subtotaal</span>
            <span />
          </div>
          {rows.map((r, idx) => (
            <div key={r.id ?? r._local ?? idx} className="grid grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2 items-center px-2 py-1.5 border-b-[0.5px] border-border">
              <input className={inputCls} value={r.omschrijving} placeholder="Bijv. Gipsplaat 12mm" onChange={(e) => updateRow(idx, { omschrijving: e.target.value })} />
              <div className="flex gap-1">
                <input className={inputCls} type="number" step="0.01" value={r.hoeveelheid} onChange={(e) => updateRow(idx, { hoeveelheid: Number(e.target.value) })} />
                <input className={inputCls} value={r.eenheid} placeholder="m²" onChange={(e) => updateRow(idx, { eenheid: e.target.value })} />
              </div>
              <input className={inputCls} type="number" step="0.01" value={r.eenheidsprijs_excl_abex} onChange={(e) => updateRow(idx, { eenheidsprijs_excl_abex: Number(e.target.value) })} />
              <div className="text-[13px] font-medium">{formatEur(r.subtotaal)}</div>
              <button type="button" onClick={() => removeRow(idx)} className="text-text-muted hover:text-status-red-fg">
                <IconTrash size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed text-[13px] text-primary-dark hover:bg-primary-light/40"
            style={{ borderColor: "#8DB92E" }}
          >
            <IconPlus size={14} />
            Schadelijn toevoegen
          </button>
        </Card>

        <BestekDropCard
          dossierId={dossierId}
          abexActueel={abexActueel}
          abexBasis={abexBasis}
          onLijnenExtracted={(extracted) => {
            setLijnen((ls) => [
              ...ls,
              ...extracted.map((l) => ({
                _local: crypto.randomUUID(),
                omschrijving: l.omschrijving,
                hoeveelheid: l.hoeveelheid,
                eenheid: l.eenheid,
                eenheidsprijs_excl_abex: l.eenheidsprijs_excl_abex,
              })),
            ]);
          }}
        />

        <Card>
          <SectionHeading>Polisopties</SectionHeading>
          <div className="flex items-center justify-between py-2 border-b-[0.5px] border-border">
            <div>
              <div className="text-[13px] font-medium">Vrijstelling</div>
              <div className="text-[11px] text-text-secondary">Eigen risico aftrekken van het schadebedrag</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                className={`${inputCls} w-28`}
                type="number"
                step="0.01"
                value={vrijstelling}
                onChange={(e) => setVrijstelling(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-[13px] font-medium">Indirecte verliezen</div>
              <div className="text-[11px] text-text-secondary">Forfaitair +10% bovenop schadebedrag</div>
            </div>
            <Toggle checked={heeftIndirect} onChange={setHeeftIndirect} />
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {verz && limietPct >= 0.9 && (
          <div className={`rounded-md border-[0.5px] px-3 py-2 text-[12px] flex items-start gap-2 ${
            limietPct >= 1
              ? "bg-status-red-bg text-status-red-fg border-status-red-fg"
              : "bg-status-amber-bg text-status-amber-fg border-status-amber-fg"
          }`}>
            <IconAlertTriangle size={14} className="mt-0.5" />
            <div>
              {limietPct >= 1 ? "Boven regelingsbevoegdheid" : "Bijna aan limiet"} van {verz.name} ({formatEur(verz.maxAuthority)}).
            </div>
          </div>
        )}

        <Card>
          <SectionHeading>Samenvatting</SectionHeading>
          <SumRow label="Subtotaal" value={subtotaal} />
          {heeftIndirect && <SumRow label="Indirecte verliezen (+10%)" value={indirect} />}
          <SumRow label="BTW (21%)" value={btw} />
          {vrijstellingApplied > 0 && <SumRow label="Vrijstelling" value={-vrijstellingApplied} />}
          <div className="mt-3 rounded-md bg-status-green-bg text-status-green-fg px-3 py-2 flex justify-between items-center">
            <span className="text-[12px] font-medium">Totaal vergoeding</span>
            <span className="text-[16px] font-medium">{formatEur(totaal)}</span>
          </div>
        </Card>

        <Card>
          <SectionHeading>ABEX-index</SectionHeading>
          <div className="text-[12px] text-text-secondary">Actief</div>
          <div className="text-[15px] font-medium">{abexQ.data?.indexwaarde ?? "—"} <span className="text-[12px] text-text-secondary">({abexQ.data?.periode ?? "—"})</span></div>
          {dossierQ.data?.abex_index_gebruikt && dossierQ.data.abex_index_gebruikt !== abexActueel && (
            <div className="mt-1.5 text-[11px] text-text-muted">
              Dossier basis: {dossierQ.data.abex_index_gebruikt} ({dossierQ.data.abex_periode}) — factor ×{factor.toFixed(3)}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => saveMutation.mutate({ goNext: true })}>
            {saveMutation.isPending ? "Bezig…" : "Volgende stap"}
            <IconArrowRight size={14} />
          </PrimaryButton>
          <button
            type="button"
            onClick={() => saveMutation.mutate({ goNext: false })}
            className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[13px] border-[0.5px] border-border bg-card hover:bg-secondary"
          >
            <IconDeviceFloppy size={14} />
            Bewaren als concept
          </button>
        </div>
      </div>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center py-1 text-[13px]">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-medium ${value < 0 ? "text-status-red-fg" : ""}`}>{formatEur(value)}</span>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-primary" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-card transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

const inputCls =
  "w-full px-2.5 py-1.5 text-[13px] bg-card border-[0.5px] border-border rounded-md focus:outline-none focus:border-primary";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-text-secondary mb-1">
        {label}
        {required && <span className="text-status-red-fg ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

// ============ Bestek-drop in Step 2 (AI extractie) ============

const ACCEPTED_MIMES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ACCEPTED_EXTS = new Set(["pdf", "jpg", "jpeg", "png"]);
const MAX_BESTEK_BYTES = 10 * 1024 * 1024;

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const b64 = result.split(",")[1];
      if (!b64) reject(new Error("Bestand kon niet gelezen worden."));
      else resolve(b64);
    };
    reader.onerror = () => reject(new Error("Bestand kon niet gelezen worden."));
    reader.readAsDataURL(file);
  });
}

function getMime(f: File) {
  if (ACCEPTED_MIMES.has(f.type)) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return f.type || "application/octet-stream";
}

function isAccepted(f: File) {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_MIMES.has(f.type) || ACCEPTED_EXTS.has(ext);
}

type ExtractedRow = {
  omschrijving: string;
  hoeveelheid: number;
  eenheid: string;
  eenheidsprijs_excl_abex: number;
};

function BestekDropCard({
  dossierId,
  abexActueel,
  abexBasis,
  onLijnenExtracted,
}: {
  dossierId: string;
  abexActueel: number;
  abexBasis: number;
  onLijnenExtracted: (rows: ExtractedRow[]) => void;
}) {
  const session = useSession();
  const runExtract = useServerFn(extractBestekLijnen);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ count: number; samenvatting: string } | null>(null);

  const { data: refprijzen = [] } = useQuery({
    queryKey: ["referentieprijzen-extract"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referentieprijzen")
        .select("omschrijving,eenheid,basisprijs,maximale_basisprijs,abex_basisindex")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const factor = abexBasis > 0 ? abexActueel / abexBasis : 1;

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Geen bestand gekozen.");
      const payload = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          mimeType: getMime(f),
          base64: await fileToBase64(f),
        }))
      );
      const result = await runExtract({
        data: {
          files: payload,
          abexActueel,
          referentieprijzen: (refprijzen as Array<{ omschrijving: string; eenheid: string | null; basisprijs: number; maximale_basisprijs: number | null; abex_basisindex: number | null }>).map((r) => ({
            omschrijving: r.omschrijving,
            eenheid: r.eenheid,
            basisprijs: Number(r.basisprijs),
            maximale_basisprijs: r.maximale_basisprijs != null ? Number(r.maximale_basisprijs) : null,
            abex_basisindex: r.abex_basisindex != null ? Number(r.abex_basisindex) : null,
          })),
        },
      });
      // Bestek-prijzen zijn meestal "actuele" prijzen → converteer naar excl. ABEX zodat huidige berekening klopt
      const rows: ExtractedRow[] = result.lijnen.map((l) => ({
        omschrijving: l.omschrijving,
        hoeveelheid: l.hoeveelheid || 1,
        eenheid: l.eenheid || "stuk",
        eenheidsprijs_excl_abex: factor > 0 ? Number((l.eenheidsprijs_excl_abex / factor).toFixed(2)) : l.eenheidsprijs_excl_abex,
      }));
      await supabase.from("audit_log").insert({
        dossier_id: dossierId,
        actie: "bestek_lijnen_geextraheerd",
        uitgevoerd_door: session?.userId ?? null,
        detail_json: { bestanden: files.map((f) => f.name), aantal_lijnen: rows.length, samenvatting: result.samenvatting },
      });
      return { rows, samenvatting: result.samenvatting };
    },
    onSuccess: ({ rows, samenvatting }) => {
      onLijnenExtracted(rows);
      setLastResult({ count: rows.length, samenvatting });
      setFiles([]);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function addFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list);
    const valid: File[] = [];
    for (const f of arr) {
      if (!isAccepted(f)) {
        setError(`Bestand ${f.name} is geen PDF, JPG of PNG.`);
        return;
      }
      if (f.size > MAX_BESTEK_BYTES) {
        setError(`Bestand ${f.name} is groter dan 10 MB.`);
        return;
      }
      valid.push(f);
    }
    setError(null);
    setFiles((fs) => [...fs, ...valid].slice(0, 5));
  }

  return (
    <Card>
      <SectionHeading>Of: bestek(ken) door AI laten extraheren</SectionHeading>
      <p className="text-[12px] text-text-secondary mb-3">
        Sleep één of meerdere bestekken (PDF, JPG of PNG, max 5) hierheen. De AI extraheert alle lijnen,
        vergelijkt met de geïmporteerde referentieprijzen-catalogus, en voegt ze toe aan de schadelijnen hierboven.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`w-full border-[0.5px] border-dashed rounded-md p-6 text-center text-[13px] cursor-pointer ${
          dragOver ? "border-primary bg-primary-light text-primary" : "border-border text-text-muted hover:bg-muted/40"
        }`}
      >
        {files.length === 0
          ? "Sleep bestek(ken) hierheen of klik om te kiezen"
          : `${files.length} bestand${files.length === 1 ? "" : "en"} klaar`}
      </div>

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between text-[12px] border-[0.5px] border-border rounded-md px-2 py-1.5">
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setFiles((fs) => fs.filter((_, idx) => idx !== i))}
                className="text-text-muted hover:text-status-red-fg"
              >
                <IconX size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {refprijzen.length === 0 && (
        <div className="mt-3 text-[12px] text-[#7A4D0D] bg-[#FDF1DA] border-[0.5px] border-[#BA7517] rounded-md p-2">
          Geen referentieprijzen in de catalogus. De AI kan dan enkel lijnen extraheren zonder vergelijking. Importeer eerst een prijzen-Excel via Excel-import voor betere controle.
        </div>
      )}

      {error && (
        <div className="mt-3 text-[12px] text-[#A32D2D] bg-[#FAE0E0] border-[0.5px] border-[#A32D2D] rounded-md p-2">
          {error}
        </div>
      )}

      {lastResult && (
        <div className="mt-3 text-[12px] text-status-green-fg bg-status-green-bg border-[0.5px] border-status-green-fg rounded-md p-2">
          {lastResult.count} lijn{lastResult.count === 1 ? "" : "en"} toegevoegd. {lastResult.samenvatting}
        </div>
      )}

      <div className="mt-3">
        <PrimaryButton
          onClick={() => extractMutation.mutate()}
          disabled={files.length === 0 || extractMutation.isPending}
        >
          <IconSparkles size={14} />
          {extractMutation.isPending ? "AI extraheert…" : "Lijnen extraheren via AI"}
        </PrimaryButton>
      </div>
    </Card>
  );
}
