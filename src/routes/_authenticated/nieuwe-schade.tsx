import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { useSession } from "@/lib/session";
import { VERZEKERAARS, VERZEKERAAR_KEYS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";


type SchadeType = (typeof SCHADE_TYPES)[number]["value"];

export const Route = createFileRoute("/_authenticated/nieuwe-schade")({
  component: NewClaim,
});

function NewClaim() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();


  const [form, setForm] = useState({
    klant_naam: "",
    schade_type: "" as SchadeType | "",
    schade_datum: new Date().toISOString().slice(0, 10),
    verzekeraar: "" as VerzekeraarKey | "",
    schade_omschrijving: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .insert({
          klant_naam: form.klant_naam,
          schade_type: form.schade_type || null,
          schade_datum: form.schade_datum,
          verzekeraar: form.verzekeraar || null,
          schade_omschrijving: form.schade_omschrijving || null,
          status: "concept",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      void navigate({ to: "/dossiers/$id", params: { id: d.id } });
    },
  });

  return (
    <>
      <Topbar title="Nieuwe schade" subtitle="Maak een nieuw schadedossier aan" />

      <Card className="max-w-3xl">
        <SectionHeading>Klant & schade</SectionHeading>
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
          <Field label="Type schade" required>
            <select className={inputCls} value={form.schade_type} required onChange={(e) => setForm({ ...form, schade_type: e.target.value as SchadeType })}>
              <option value="">— kies —</option>
              {SCHADE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Schadedatum" required>
            <input type="date" className={inputCls} value={form.schade_datum} required onChange={(e) => setForm({ ...form, schade_datum: e.target.value })} />
          </Field>
          <Field label="Verzekeraar">
            <select className={inputCls} value={form.verzekeraar} onChange={(e) => setForm({ ...form, verzekeraar: e.target.value as VerzekeraarKey })}>
              <option value="">— kies —</option>
              {VERZEKERAAR_KEYS.map((k) => <option key={k} value={k}>{VERZEKERAARS[k].name}</option>)}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Omschrijving">
              <textarea rows={4} className={inputCls} value={form.schade_omschrijving} onChange={(e) => setForm({ ...form, schade_omschrijving: e.target.value })} />
            </Field>
          </div>
          <div className="col-span-2 flex items-center justify-between mt-2">
            {mutation.error && <span className="text-[12px] text-status-red-fg">{(mutation.error as Error).message}</span>}
            <div className="ml-auto">
              <PrimaryButton type="submit">
                <IconDeviceFloppy size={14} />
                {mutation.isPending ? "Bezig…" : "Dossier aanmaken"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Card>
    </>
  );
}

const inputCls =
  "w-full px-3 py-2 text-[13px] bg-card border-[0.5px] border-border rounded-md focus:outline-none focus:border-primary";

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
