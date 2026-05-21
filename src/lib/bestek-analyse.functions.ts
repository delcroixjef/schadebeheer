import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  dossierId: z.string().uuid(),
  fileBase64: z.string().min(10),
  mimeType: z.string().min(3),
  abexActueel: z.number().int().positive(),
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
    })
  ),
});

export type BestekLijn = {
  omschrijving: string;
  bestek_prijs: number;
  referentie_prijs: number;
  afwijking_pct: number;
  oordeel: "conform" | "licht_verhoogd" | "niet_conform";
};

export type BestekAnalyseResult = {
  score: number;
  lijnen: BestekLijn[];
  aanbeveling: string;
  verdacht_label: string | null;
};

const SYSTEM_PROMPT = (abex: number) =>
  `Je bent een schade-expert voor Belgische brandverzekeringen.
Analyseer het aangeleverde bestek van de klant en vergelijk elke besteklijn met de referentieprijzen (gecorrigeerd voor ABEX-index ${abex}).
Geef per lijn een oordeel: conform (afwijking <10%), licht_verhoogd (10-25%), niet_conform (>25%).
Geef een totale conformiteitsscore van 0-100.
Geef een Nederlandse aanbeveling van max 3 zinnen.
Antwoord uitsluitend in JSON met dit formaat:
{ "score": number, "lijnen": [{"omschrijving": string, "bestek_prijs": number, "referentie_prijs": number, "afwijking_pct": number, "oordeel": "conform"|"licht_verhoogd"|"niet_conform"}], "aanbeveling": string, "verdacht_label": string|null }`;

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
        )}\n\nReferentieprijzen catalogus (basisprijs is op ABEX-basisindex; corrigeer naar ${data.abexActueel}):\n${JSON.stringify(
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
          { role: "system", content: SYSTEM_PROMPT(data.abexActueel) },
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
