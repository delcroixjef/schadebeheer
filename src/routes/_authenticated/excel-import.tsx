import { createFileRoute } from "@tanstack/react-router";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";

export const Route = createFileRoute("/_authenticated/excel-import")({
  component: () => (
    <>
      <Topbar title="Excel import" subtitle="Importeer dossiers vanuit een Excel-bestand" />
      <Card>
        <SectionHeading>Bestand kiezen</SectionHeading>
        <div className="border-[0.5px] border-dashed border-border rounded-md p-10 text-center text-[13px] text-text-muted">
          Sleep een .xlsx-bestand hierheen
        </div>
      </Card>
    </>
  ),
});
