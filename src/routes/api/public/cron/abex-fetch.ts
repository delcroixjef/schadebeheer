import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SOURCES = [
  "https://www.confederatiebouw.be/nl/economie/abex-index",
  "https://embuild.be/nl/economie/abex-index",
];

// Parse "ABEX-index ... <number> ... <semester X 20YY>" out of free text.
function parseAbex(text: string): { indexwaarde: number; periode: string } | null {
  const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // Look for a 3-4 digit number adjacent to ABEX / index mentions
  const numMatch = stripped.match(/ABEX[^0-9]{0,60}(\d{3,4})/i);
  const periodeMatch = stripped.match(
    /(1ste|2de|eerste|tweede)\s+semester\s+(20\d{2})/i,
  );
  if (!numMatch) return null;
  const indexwaarde = parseInt(numMatch[1], 10);
  if (!Number.isFinite(indexwaarde) || indexwaarde < 500 || indexwaarde > 2000) {
    return null;
  }
  const periode = periodeMatch
    ? `${periodeMatch[1]} semester ${periodeMatch[2]}`
    : `Auto ${new Date().toISOString().slice(0, 7)}`;
  return { indexwaarde, periode };
}

async function fetchAbex(): Promise<{ indexwaarde: number; periode: string; url: string } | null> {
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 WelZekerBot" } });
      if (!r.ok) continue;
      const html = await r.text();
      const parsed = parseAbex(html);
      if (parsed) return { ...parsed, url };
    } catch {
      // try next source
    }
  }
  return null;
}

export const Route = createFileRoute("/api/public/cron/abex-fetch")({
  server: {
    handlers: {
      POST: async () => {
        const result = await fetchAbex();
        if (!result) {
          await supabaseAdmin.from("audit_log").insert({
            actie: "abex_fetch_failed",
            detail_json: { reason: "Kon ABEX-index niet parsen uit bron" },
          });
          return Response.json({ ok: false, reason: "parse_failed" }, { status: 200 });
        }

        // Compare to most recent stored value
        const { data: latest } = await supabaseAdmin
          .from("abex_index")
          .select("indexwaarde, periode")
          .order("ingangsdatum", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest && latest.indexwaarde === result.indexwaarde && latest.periode === result.periode) {
          await supabaseAdmin.from("audit_log").insert({
            actie: "abex_fetch_unchanged",
            detail_json: { indexwaarde: result.indexwaarde, periode: result.periode },
          });
          return Response.json({ ok: true, changed: false });
        }

        const { error } = await supabaseAdmin.from("abex_index").insert({
          indexwaarde: result.indexwaarde,
          periode: result.periode,
          ingangsdatum: new Date().toISOString().slice(0, 10),
          bron: result.url,
          manueel_ingevoerd: false,
        });
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        await supabaseAdmin.from("audit_log").insert({
          actie: "abex_fetch_updated",
          detail_json: { indexwaarde: result.indexwaarde, periode: result.periode, bron: result.url },
        });
        return Response.json({ ok: true, changed: true, ...result });
      },
      GET: async () => Response.json({ ok: true, info: "POST to trigger fetch" }),
    },
  },
});
