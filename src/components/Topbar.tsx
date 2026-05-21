import type { ReactNode } from "react";

export function Topbar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-[18px] font-medium text-foreground">{title}</h1>
        {subtitle && <div className="text-[13px] text-text-secondary mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-4 py-2 text-[13px] font-medium hover:bg-primary-dark transition-colors"
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-card border-[0.5px] border-border rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[14px] font-medium text-primary pb-2 mb-4 border-b border-primary-light">
      {children}
    </h2>
  );
}
