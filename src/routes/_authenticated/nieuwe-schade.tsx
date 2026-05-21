import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Topbar, Card, SectionHeading, PrimaryButton } from "@/components/Topbar";

export const Route = createFileRoute("/_authenticated/nieuwe-schade")({
  component: NewClaim,
});

function NewClaim() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const insurers = useQuery({
    queryKey: ["insurers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    customer_name: "",
    damage_type: "",
    damage_date: new Date().toISOString().slice(0, 10),
    insurer_id: "",
    amount: "",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .insert({
          customer_name: form.customer_name,
          damage_type: form.damage_type,
          damage_date: form.damage_date,
          insurer_id: form.insurer_id || null,
          amount: Number(form.amount) || 0,
          notes: form.notes || null,
          status: "in_behandeling",
          status_label: "In behandeling",
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
            <input className={inputCls} value={form.customer_name} required onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          </Field>
          <Field label="Type schade" required>
            <input className={inputCls} value={form.damage_type} required placeholder="Bv. Waterschade" onChange={(e) => setForm({ ...form, damage_type: e.target.value })} />
          </Field>
          <Field label="Schadedatum" required>
            <input type="date" className={inputCls} value={form.damage_date} required onChange={(e) => setForm({ ...form, damage_date: e.target.value })} />
          </Field>
          <Field label="Verzekeraar">
            <select className={inputCls} value={form.insurer_id} onChange={(e) => setForm({ ...form, insurer_id: e.target.value })}>
              <option value="">— kies —</option>
              {insurers.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <Field label="Bedrag (EUR)">
            <input type="number" min="0" step="1" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <div />
          <div className="col-span-2">
            <Field label="Notities">
              <textarea rows={4} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
