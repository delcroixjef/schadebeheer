import { createFileRoute } from "@tanstack/react-router";
import { Topbar, Card, SectionHeading } from "@/components/Topbar";

export const Route = createFileRoute("/_authenticated/schadeberekening")({
  component: () => (
    <>
      <Topbar title="Schadeberekening" subtitle="Bereken schadevergoeding met de actieve ABEX-index" />
      <Card>
        <SectionHeading>Berekeningsmodule</SectionHeading>
        <p className="text-[13px] text-text-secondary">
          De volledige schadeberekeningsmotor (oppervlakte × eenheidsprijs × ABEX-correctie, met
          slijtage en vrijstelling) wordt hier toegevoegd. Voor nu volstaat deze placeholder.
        </p>
      </Card>
    </>
  ),
});
