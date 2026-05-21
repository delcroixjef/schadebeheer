const styles: Record<string, string> = {
  blue: "bg-status-blue-bg text-status-blue-fg",
  red: "bg-status-red-bg text-status-red-fg",
  amber: "bg-status-amber-bg text-status-amber-fg",
  green: "bg-status-green-bg text-status-green-fg",
};

export function InsurerBadge({ name, color }: { name: string; color: string }) {
  const cls = styles[color] ?? styles.blue;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {name}
    </span>
  );
}

const statusMap: Record<string, { dot: string; label: string }> = {
  afgerond: { dot: "bg-status-green-dot", label: "Afgerond" },
  in_behandeling: { dot: "bg-status-blue-dot", label: "In behandeling" },
  berekening: { dot: "bg-status-blue-dot", label: "Berekening" },
  bestek_review: { dot: "bg-status-blue-dot", label: "Bestek review" },
  actie_vereist: { dot: "bg-status-amber-dot", label: "Actie vereist" },
};

export function StatusBadge({ status, label }: { status: string; label?: string | null }) {
  const cfg = statusMap[status] ?? { dot: "bg-status-blue-dot", label: status };
  return (
    <span className="inline-flex items-center text-[12px] text-foreground">
      <span className={`w-[7px] h-[7px] rounded-full mr-1.5 ${cfg.dot}`} />
      {label ?? cfg.label}
    </span>
  );
}
