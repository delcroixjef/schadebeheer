import { Link, useRouterState } from "@tanstack/react-router";
import {
  IconLayoutDashboard,
  IconFolderOpen,
  IconPlus,
  IconCalculator,
  IconFileCheck,
  IconFileText,
  IconUpload,
  IconChartBar,
  IconSettings,
  IconLogout,
} from "@tabler/icons-react";
import type { ComponentType } from "react";


type NavItem = { to: string; label: string; icon: ComponentType<{ size?: number }> };
type NavSection = { label: string; items: NavItem[] };

const sections: NavSection[] = [
  {
    label: "Beheer",
    items: [
      { to: "/", label: "Dashboard", icon: IconLayoutDashboard },
      { to: "/dossiers", label: "Dossiers", icon: IconFolderOpen },
      { to: "/nieuwe-schade", label: "Nieuwe schade", icon: IconPlus },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/schadeberekening", label: "Schadeberekening", icon: IconCalculator },
      { to: "/bestekanalyse", label: "Bestekanalyse", icon: IconFileCheck },
      { to: "/regelingsdocumenten", label: "Regelingsdoc.", icon: IconFileText },
    ],
  },
  {
    label: "Instellingen",
    items: [
      { to: "/excel-import", label: "Excel import", icon: IconUpload },
      { to: "/auditrapport", label: "Auditrapport", icon: IconChartBar },
      { to: "/instellingen", label: "Instellingen", icon: IconSettings },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const displayName = "Dev Gebruiker";

  return (
    <aside className="w-[220px] flex-shrink-0 bg-card border-r-[0.5px] border-border flex flex-col">
      <div className="px-4 pt-5 pb-4 border-b-[0.5px] border-border">
        <div className="text-[20px] font-medium tracking-[-0.5px] text-primary">WelZeker</div>
        <div className="text-[11px] text-text-muted mt-0.5">Schadebeheer</div>
      </div>

      <div className="flex-1 overflow-auto pb-3">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="px-2 pt-3 pb-1 mx-2 text-[10px] font-medium text-text-muted uppercase tracking-[0.8px]">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2.5 px-3 py-2 mx-2 my-px rounded-md text-[13px] transition-colors ${
                    active
                      ? "bg-primary-light text-primary-dark"
                      : "text-text-secondary hover:bg-secondary"
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t-[0.5px] border-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-foreground truncate">{displayName}</div>
          <div className="text-[11px] text-text-muted">Schadebeheerder</div>
        </div>
        <button
          onClick={() => void signOut()}
          className="text-text-muted hover:text-foreground transition-colors"
          title="Afmelden"
          aria-label="Afmelden"
        >
          <IconLogout size={16} />
        </button>
      </div>
    </aside>
  );
}
