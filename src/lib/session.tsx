import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PortalRole = "schadebeheerder" | "admin";

export type PortalSession = {
  userId: string;
  displayName: string;
  email: string;
  role: PortalRole;
};

const SessionContext = createContext<PortalSession | null>(null);

declare global {
  interface Window {
    __WELZEKER_SESSION__?: PortalSession;
  }
}

function readSession(): PortalSession | null {
  if (typeof window === "undefined") return null;
  if (window.__WELZEKER_SESSION__) return window.__WELZEKER_SESSION__;

  // Dev fallback: allow URL-param injection (e.g. ?portalDev=1) to simulate portal session.
  const params = new URLSearchParams(window.location.search);
  if (params.get("portalDev") === "1" || import.meta.env.DEV) {
    return {
      userId: "00000000-0000-0000-0000-000000000001",
      displayName: "Dev Gebruiker",
      email: "dev@welzeker.be",
      role: "admin",
    };
  }
  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(() => readSession());

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && typeof e.data === "object" && e.data.type === "welzeker:session" && e.data.session) {
        window.__WELZEKER_SESSION__ = e.data.session as PortalSession;
        setSession(e.data.session as PortalSession);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-[13px] text-text-secondary px-6 py-4 rounded-md border-[0.5px] border-border bg-card">
          Toegang via het WelZeker portaal vereist.
        </div>
      </div>
    );
  }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): PortalSession {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used within SessionProvider");
  return s;
}
