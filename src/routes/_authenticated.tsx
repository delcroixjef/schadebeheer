import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { AbexBanner } from "@/components/AbexBanner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="flex h-screen min-h-[600px] bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-4">
          <AbexBanner />
        </div>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
