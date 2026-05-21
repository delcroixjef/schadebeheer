import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconBrandWindows, IconAlertCircle } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const ALLOWED_DOMAIN = "welzeker.be";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: "/" });
    }
  }, [loading, session, navigate]);

  const handleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    const { error: ssoError } = await supabase.auth.signInWithSSO({
      domain: ALLOWED_DOMAIN,
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (ssoError) {
      setError(ssoError.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="text-[28px] font-medium text-primary tracking-[-0.5px]">WelZeker</div>
          <div className="text-[13px] text-text-muted mt-1">Schadebeheer</div>
        </div>

        <div className="bg-card border-[0.5px] border-border rounded-xl p-6">
          <h1 className="text-[16px] font-medium text-foreground mb-1">Aanmelden</h1>
          <p className="text-[13px] text-text-secondary mb-5">
            Gebruik je @welzeker.be Microsoft-account.
          </p>

          <button
            onClick={() => void handleSignIn()}
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2.5 text-[13px] font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            <IconBrandWindows size={16} />
            {submitting ? "Bezig…" : "Aanmelden met Microsoft 365"}
          </button>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-status-red-bg text-status-red-fg px-3 py-2 text-[12px]">
              <IconAlertCircle size={14} className="mt-px flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="mt-5 text-[11px] text-text-muted">
            Enkel @{ALLOWED_DOMAIN}-accounts hebben toegang.
          </p>
        </div>
      </div>
    </div>
  );
}
