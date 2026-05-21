import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";
import { VergelijkbareSchadesCard } from "@/components/VergelijkbareSchadesCard";
import { SCHADE_TYPES, VERZEKERAAR_KEYS, VERZEKERAARS } from "@/lib/insurers";

export const Route = createFileRoute("/_authenticated/schadeberekening")({
  component: SchadeberekeningPage,
});

function SchadeberekeningPage() {
  const [schadeType, setSchadeType] = useState("");
  const [verzekeraar, setVerzekeraar] = useState("");

  return (
    <>
      <Topbar title="Schadeberekening" subtitle="Bereken schadevergoeding met de actieve ABEX-index" />
      <div className="grid grid-cols-[1fr_320px] gap-4">
        <div className="flex flex-col gap-4">
          <Card>
            <SectionHeading>Schadegegevens</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Schadesoort">
                <select
                  className="input"
                  value={schadeType}
                  onChange={(e) => setSchadeType(e.target.value)}
                >
                  <option value="">— Kies —</option>
                  {SCHADE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Verzekeraar">
                <select
                  className="input"
                  value={verzekeraar}
                  onChange={(e) => setVerzekeraar(e.target.value)}
                >
                  <option value="">— Kies —</option>
                  {VERZEKERAAR_KEYS.map((k) => (
                    <option key={k} value={k}>{VERZEKERAARS[k].name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card>
            <SectionHeading>Berekeningsmodule</SectionHeading>
            <p className="text-[13px] text-text-secondary">
              De volledige schadeberekeningsmotor (oppervlakte × eenheidsprijs × ABEX-correctie, met
              slijtage en vrijstelling) wordt hier toegevoegd.
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <VergelijkbareSchadesCard
            schadeType={schadeType || null}
            verzekeraar={verzekeraar || null}
          />
        </div>
      </div>
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
