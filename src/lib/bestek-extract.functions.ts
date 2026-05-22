import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CATALOGUS_AI_HINTS, defaultCatalogiVoorSchadeType } from "@/lib/catalogus";

const fileSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  base64: z.string().min(10),
});

const inputSchema = z.object({
  files: z.array(fileSchema).min(1).max(5),
  referentieprijzen: z
    .array(
      z.object({
        omschrijving: z.string(),
        eenheid: z.string().nullable().optional(),
        basisprijs: z.number(),
        maximale_basisprijs: z.number().nullable().optional(),
        abex_basisindex: z.number().nullable().optional(),
      })
    )
    .default([]),
  abexActueel: z.number().int().positive(),
});

export type ExtractedLijn = {
  omschrijving: string;
  hoeveelheid: number;
  eenheid: string;
  eenheidsprijs_excl_abex: number;
  referentie_prijs: number | null;
  maximum_prijs: number | null;
  afwijking_pct: number | null;
  oordeel: "conform" | "licht_verhoogd" | "niet_conform" | "geen_referentie";
};

export type BestekExtractResult = {
  lijnen: ExtractedLijn[];
  samenvatting: string;
};

const SYSTEM = (abex: number) => `Je bent een schade-expert voor Belgische brandverzekeringen.

OPDRACHT: Extraheer ALLE individuele posten/lijnen uit de bijgevoegde bestekken (één of meerdere). Voor elke lijn geef je: omschrijving, hoeveelheid, eenheid (m², m, stuk, …), eenheidsprijs (excl. BTW, zoals in het bestek staat).

VERVOLGENS vergelijk je elke lijn met de meegegeven referentieprijzen-catalogus:
- Zoek de best passende post (semantische match op omschrijving + eenheid).
- Corrigeer de catalogus-basisprijs naar ABEX-index ${abex}: referentie_prijs = basisprijs × (${abex} / abex_basisindex). Als geen abex_basisindex aanwezig is, gebruik basisprijs ongewijzigd.
- Indien maximale_basisprijs aanwezig: maximum_prijs = maximale_basisprijs × (${abex} / abex_basisindex) (of ongewijzigd).
- Indien GEEN match in de catalogus: referentie_prijs = null, maximum_prijs = null, afwijking_pct = null, oordeel = "geen_referentie". NIETS verzinnen.
- Match wel: oordeel = conform (<10% afwijking), licht_verhoogd (10–25%), niet_conform (>25% of boven maximum_prijs).

Antwoord uitsluitend in JSON:
{ "lijnen": [{"omschrijving": string, "hoeveelheid": number, "eenheid": string, "eenheidsprijs_excl_abex": number, "referentie_prijs": number|null, "maximum_prijs": number|null, "afwijking_pct": number|null, "oordeel": "conform"|"licht_verhoogd"|"niet_conform"|"geen_referentie"}], "samenvatting": string }`;

export const extractBestekLijnen = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<BestekExtractResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Referentieprijzen-catalogus (basisprijs op abex_basisindex; corrigeer naar ${data.abexActueel}):\n${JSON.stringify(
          data.referentieprijzen,
          null,
          2
        )}\n\nExtraheer alle lijnen uit de bijgevoegde bestek-bestand(en) en vergelijk met de catalogus.`,
      },
    ];

    for (const f of data.files) {
      if (f.mimeType === "application/pdf") {
        userContent.push({
          type: "file",
          file: { filename: f.filename, file_data: `data:application/pdf;base64,${f.base64}` },
        });
      } else {
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
        });
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM(data.abexActueel) },
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
    let parsed: BestekExtractResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI-respons kon niet geparsed worden");
      parsed = JSON.parse(m[0]);
    }
    if (!Array.isArray(parsed.lijnen)) throw new Error("AI-respons heeft ongeldig formaat");
    return parsed;
  });
