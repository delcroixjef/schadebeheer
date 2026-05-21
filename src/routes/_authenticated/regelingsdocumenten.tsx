import { createFileRoute } from "@tanstack/react-router";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";

export const Route = createFileRoute("/_authenticated/regelingsdocumenten")({
  component: () => (
    <>
      <Topbar title="Regelingsdocumenten" subtitle="Genereer PDF-regelingen met handtekening" />
      <Card>
        <SectionHeading>Nieuwe regeling</SectionHeading>
        <p className="text-[13px] text-text-secondary">
          Selecteer een dossier en genereer een ondertekenbare regeling-PDF. (Module komt binnenkort.)
        </p>
      </Card>
    </>
  ),
});
