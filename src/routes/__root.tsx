import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-[64px] font-medium text-foreground">404</h1>
        <h2 className="mt-2 text-[18px] font-medium text-foreground">Pagina niet gevonden</h2>
        <p className="mt-2 text-[13px] text-text-secondary">
          Deze pagina bestaat niet of is verplaatst.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary-dark transition-colors"
        >
          Naar dashboard
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-[18px] font-medium text-foreground">Er ging iets mis</h1>
        <p className="mt-2 text-[13px] text-text-secondary">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary-dark transition-colors"
        >
          Opnieuw proberen
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WelZeker Schadebeheer" },
      { name: "description", content: "Schaderegelingstool voor WelZeker" },
      { property: "og:title", content: "WelZeker Schadebeheer" },
      { name: "twitter:title", content: "WelZeker Schadebeheer" },
      { property: "og:description", content: "Schaderegelingstool voor WelZeker" },
      { name: "twitter:description", content: "Schaderegelingstool voor WelZeker" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Lp14ndNt3GVcNh5m1tWJipsFZyt2/social-images/social-1779393403461-Logo_WelZeker.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Lp14ndNt3GVcNh5m1tWJipsFZyt2/social-images/social-1779393403461-Logo_WelZeker.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInvalidator />
      <Outlet />
    </QueryClientProvider>
  );
}

function AuthInvalidator() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}
