import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/klant/$token")({
  component: KlantPortal,
  head: () => ({ meta: [{ title: "WelZeker — Klantenportaal" }] }),
});

function KlantPortal() {
  const { token } = Route.useParams();

  const q = useQuery({
    queryKey: ["klant_token", token],
    queryFn: async () => {
      const { data: t, error } = await supabase
        .from("klant_tokens")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      if (error) throw error;
      if (!t) return { status: "invalid" as const };
      if (new Date(t.expires_at) < new Date()) return { status: "expired" as const, t };
      const { data: dossier } = await supabase
        .from("dossiers")
        .select("dossiernummer, klant_naam, schade_datum")
        .eq("id", t.dossier_id)
        .maybeSingle();
      return { status: "ok" as const, t, dossier };
    },
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-card border border-border rounded-xl p-8">
        <div className="mb-6">
          <div style={{ color: "#8DB92E", fontSize: 22, fontWeight: 500 }}>WelZeker</div>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            uw toekomst
          </div>
        </div>

        {q.isLoading && <div className="text-[13px] text-text-secondary">Laden…</div>}

        {q.data?.status === "invalid" && (
          <div>
            <h1 className="text-[18px] font-medium">Ongeldige link</h1>
            <p className="text-[13px] text-text-secondary mt-2">Deze link bestaat niet of werd ingetrokken.</p>
          </div>
        )}

        {q.data?.status === "expired" && (
          <div>
            <h1 className="text-[18px] font-medium">Link verlopen</h1>
            <p className="text-[13px] text-text-secondary mt-2">
              Deze ondertekenlink is verlopen. Neem contact op met uw schadebeheerder.
            </p>
          </div>
        )}

        {q.data?.status === "ok" && q.data.dossier && (
          <div>
            <h1 className="text-[18px] font-medium">Beste {q.data.dossier.klant_naam}</h1>
            <p className="text-[13px] text-text-secondary mt-2">
              Dossier <strong>{q.data.dossier.dossiernummer}</strong>
              {q.data.dossier.schade_datum && <> — schadedatum {formatDate(q.data.dossier.schade_datum)}</>}
            </p>
            <p className="text-[13px] text-text-secondary mt-4">
              Hieronder kan u uw minnelijke regeling raadplegen en digitaal ondertekenen.
              Deze module wordt in een volgende stap uitgewerkt.
            </p>
            <p className="text-[11px] text-text-muted mt-6">
              Link geldig tot {formatDate(q.data.t.expires_at)}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
