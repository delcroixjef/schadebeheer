import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CATALOGUS_AI_HINTS, defaultCatalogiVoorSchadeType } from "@/lib/catalogus";

const inputSchema = z.object({
  dossierId: z.string().uuid(),
  fileBase64: z.string().min(10),
  mimeType: z.string().min(3),
  abexActueel: z.number().int().positive(),
  schadeType: z.string().nullable().optional(),
  schadeLijnen: z.array(
    z.object({
      omschrijving: z.string(),
      hoeveelheid: z.number(),
      eenheid: z.string().nullable().optional(),
      eenheidsprijs_incl_abex: z.number(),
    })
  ),
  referentieprijzen: z.array(
    z.object({
      omschrijving: z.string(),
      eenheid: z.string().nullable().optional(),
      basisprijs: z.number(),
      maximale_basisprijs: z.number().nullable().optional(),
      abex_basisindex: z.number().nullable().optional(),
      categorie: z.string().nullable().optional(),
      catalogus_type: z.string().nullable().optional(),
      catalogus_label: z.string().nullable().optional(),
      bron_bestand: z.string().nullable().optional(),
    })
  ),
});

export type BestekLijn = {
  omschrijving: string;
  bestek_prijs: number;
  referentie_prijs: number | null;
  maximum_prijs?: number | null;
  afwijking_pct: number | null;
  oordeel: "conform" | "licht_verhoogd" | "niet_conform" | "geen_referentie";
  bron_catalogus?: string | null;
  bron_categorie?: string | null;
};

export type BestekAnalyseResult = {
  score: number;
  lijnen: BestekLijn[];
  aanbeveling: string;
  verdacht_label: string | null;
};

const SYSTEM_PROMPT = (abex: number, schadeType: string | null | undefined) => {
  const voorkeur = defaultCatalogiVoorSchadeType(schadeType);
  return `Je bent een schade-expert voor Belgische brandverzekeringen.

${CATALOGUS_AI_HINTS}

SCHADETYPE: ${schadeType ?? "onbekend"}. Begin met te zoeken in deze catalogi (voorkeur): ${voorkeur.join(", ")}. Val terug op andere actieve catalogi indien geen match.

STRIKTE REGELS — VERPLICHT:
1. Extraheer ELKE individuele lijn uit het bijgevoegde klantbestek met exacte omschrijving en eenheidsprijs.
2. Voor de vergelijking gebruik je UITSLUITEND de meegegeven referentieprijzen-catalogus. Verzin nooit een referentieprijs.
3. Voor elke besteklijn zoek je de best passende post (semantische match op omschrijving + eenheid + catalogus_type). Corrigeer naar ABEX-index ${abex}: referentie_prijs = basisprijs × (${abex} / abex_basisindex). Geen abex_basisindex → basisprijs ongewijzigd.
4. Als de catalogus een maximale_basisprijs heeft: maximum_prijs = maximale_basisprijs × (${abex} / abex_basisindex). Boven dit maximum = automatisch "niet_conform".
5. Geen redelijke match → referentie_prijs = null, maximum_prijs = null, afwijking_pct = null, oordeel = "geen_referentie". NIET verzinnen.
6. Wel match: conform (<10%), licht_verhoogd (10–25%), niet_conform (>25% OF boven maximum_prijs).
7. Vermeld in bron_catalogus de catalogus_label (bv. "Stormschade") en in bron_categorie de categorie indien aanwezig (bv. "Zinken dakgoot").
8. Score 0–100 = % conforme + match-dekkings-ratio.
9. Aanbeveling in NL, max 3 zinnen, feitelijk en verwijzend naar bron (bv. "vergeleken met Stormschade > Dakgoten").

Antwoord uitsluitend in JSON:
{ "score": number, "lijnen": [{"omschrijving": string, "bestek_prijs": number, "referentie_prijs": number|null, "maximum_prijs": number|null, "afwijking_pct": number|null, "oordeel": "conform"|"licht_verhoogd"|"niet_conform"|"geen_referentie", "bron_catalogus": string|null, "bron_categorie": string|null}], "aanbeveling": string, "verdacht_label": string|null }`;
};

export const analyseBestek = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<BestekAnalyseResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Schade-lijnen uit dossier (referentie eigen berekening):\n${JSON.stringify(
          data.schadeLijnen,
          null,
          2
        )}\n\nReferentieprijzen catalogus (actieve catalogi, met catalogus_type/label/bron_bestand/categorie; basisprijs op abex_basisindex; corrigeer naar ${data.abexActueel}):\n${JSON.stringify(
          data.referentieprijzen,
          null,
          2
        )}\n\nAnalyseer het bijgevoegde klantbestek.`,
      },
    ];

    if (data.mimeType === "application/pdf") {
      userContent.push({
        type: "file",
        file: {
          filename: "bestek.pdf",
          file_data: `data:application/pdf;base64,${data.fileBase64}`,
        },
      });
    } else {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${data.mimeType};base64,${data.fileBase64}` },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT(data.abexActueel, data.schadeType) },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      if (response.status === 429) throw new Error("AI rate limit bereikt. Probeer over enkele minuten opnieuw.");
      if (response.status === 402) throw new Error("AI-tegoed opgebruikt. Voeg credits toe aan je workspace.");
      throw new Error(`AI gateway fout (${response.status}): ${t.slice(0, 200)}`);
    }

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: BestekAnalyseResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI-respons kon niet geparsed worden");
      parsed = JSON.parse(m[0]);
    }

    if (typeof parsed.score !== "number" || !Array.isArray(parsed.lijnen)) {
      throw new Error("AI-respons heeft ongeldig formaat");
    }
    return parsed;
  });
