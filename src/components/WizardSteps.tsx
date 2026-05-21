import { IconCheck } from "@tabler/icons-react";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const WIZARD_LABELS: Record<WizardStep, string> = {
  1: "Dossierdata",
  2: "Schadeberekening",
  3: "Bestekanalyse",
  4: "Akkoord",
  5: "Regeling",
};

export function WizardSteps({ current }: { current: WizardStep }) {
  const steps: WizardStep[] = [1, 2, 3, 4, 5];
  return (
    <div className="mb-6 flex items-center">
      {steps.map((s, idx) => {
        const done = s < current;
        const active = s === current;
        const circleCls = done
          ? "bg-primary text-primary-foreground border-primary"
          : active
            ? "bg-primary-dark text-primary-foreground border-primary-dark ring-4 ring-primary-light"
            : "bg-card text-text-muted border-border";
        const lineCls = s < current ? "bg-primary" : "bg-border";
        return (
          <div key={s} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full border-[0.5px] flex items-center justify-center text-[12px] font-medium ${circleCls}`}
              >
                {done ? <IconCheck size={14} /> : s}
              </div>
              <div
                className={`mt-1.5 text-[11px] whitespace-nowrap ${
                  active ? "text-foreground font-medium" : "text-text-muted"
                }`}
              >
                Stap {s}: {WIZARD_LABELS[s]}
              </div>
            </div>
            {idx < steps.length - 1 && <div className={`h-px flex-1 mx-2 ${lineCls}`} />}
          </div>
        );
      })}
    </div>
  );
}
