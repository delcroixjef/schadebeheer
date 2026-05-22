// Catalogus-types voor referentieprijzen-catalogi.
// Eén verzekeraar kan meerdere actieve catalogi hebben (bv. Stormschade + Algemene schade).

export type CatalogusType =
  | "algemene_schade"
  | "stormschade"
  | "tuinafsluiting"
  | "macrotool"
  | "glas"
  | "algemeen";

export const CATALOGUS_TYPES: { value: CatalogusType; label: string; hint: string }[] = [
  { value: "algemene_schade", label: "Algemene schade", hint: "schilderwerk, pleisterwerk, vloeren, plafonds, sanitair" },
  { value: "stormschade", label: "Stormschade", hint: "dakgoten, dakbedekking, rolluiken, buitenschrijnwerk" },
  { value: "tuinafsluiting", label: "Tuinafsluiting & buitenaanleg", hint: "tuinmuren, afsluitingen, gazon, boordstenen, afbraak, container" },
  { value: "macrotool", label: "Macrotool (eenheidsprijzen)", hint: "bredere prijsregels met codes" },
  { value: "glas", label: "Glasberekening", hint: "apart te verwerken via glasmodule" },
  { value: "algemeen", label: "Algemeen / overig", hint: "niet automatisch herkend" },
];

export function catalogusLabel(value: string | null | undefined): string {
  if (!value) return "Algemeen";
  return CATALOGUS_TYPES.find((c) => c.value === value)?.label ?? value;
}

/**
 * Detecteer catalogus_type uit bestandsnaam en tabbladnamen.
 */
export function detectCatalogusType(filename: string, sheetNames: string[] = []): CatalogusType {
  const f = filename.toLowerCase();
  const sheets = sheetNames.map((s) => s.toLowerCase()).join("|");

  if (sheets.includes("glas") || f.includes("glas")) return "glas";
  if (f.includes("storm")) return "stormschade";
  if (f.includes("tuinafsluit") || f.includes("tuin-afsluit")) return "tuinafsluiting";
  if (f.includes("berekeningstool") || f.includes("macrotool") || f.endsWith(".xlsm")) return "macrotool";
  if (f.includes("algemene")) return "algemene_schade";
  return "algemeen";
}

/**
 * Hint-tekst voor de AI: welke catalogus bevat welk soort werk.
 */
export const CATALOGUS_AI_HINTS = `
Beschikbare referentiecatalogi en wat ze typisch bevatten:
- algemene_schade: schilderwerk, pleisterwerk, vloeren, plafonds, sanitair, binnendeuren.
- stormschade: dakgoten, dakbedekking, dakpannen, rolluiken, buitenschrijnwerk, gevelbekleding.
- tuinafsluiting: tuinmuren, draadafsluiting, poorten, gazon, boordstenen, afbraak, containers.
- macrotool: bredere eenheidsprijzen met code (gebruik enkel als geen specifiekere catalogus past).
- glas: glasbraak — apart via de glasmodule.

Kies per besteklijn de meest passende catalogus. Vermeld in de aanbeveling bv. "vergeleken met Stormschade > Zinken dakgoot".
`.trim();

/**
 * Default catalogi om eerst in te zoeken voor een gegeven schade_type.
 */
export function defaultCatalogiVoorSchadeType(schadeType: string | null | undefined): CatalogusType[] {
  switch (schadeType) {
    case "stormschade":
      return ["stormschade", "macrotool"];
    case "tuinafsluiting":
      return ["tuinafsluiting", "macrotool"];
    case "glasbraak":
      return ["glas"];
    case "waterschade":
    case "brandschade":
    case "andere":
    default:
      return ["algemene_schade", "macrotool"];
  }
}
