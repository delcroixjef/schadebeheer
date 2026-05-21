import { createFileRoute } from "@tanstack/react-router";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";

export const Route = createFileRoute("/_authenticated/bestekanalyse")({
  component: () => (
    <>
      <Topbar title="Bestekanalyse" subtitle="AI-gestuurde controle van het klantbestek" />
      <Card>
        <SectionHeading>Bestek uploaden</SectionHeading>
        <p className="text-[13px] text-text-secondary mb-4">
          Upload een PDF-bestek; AI vergelijkt eenheidsprijzen met de marktreferentie en markeert
          afwijkingen.
        </p>
        <div className="border-[0.5px] border-dashed border-border rounded-md p-10 text-center text-[13px] text-text-muted">
          Sleep een PDF-bestek hierheen of klik om te uploaden
        </div>
      </Card>
    </>
  ),
});
