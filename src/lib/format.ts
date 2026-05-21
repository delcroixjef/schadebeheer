export function formatEur(value: number): string {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatEurK(value: number): string {
  if (value >= 1000) {
    return `€ ${(value / 1000).toFixed(1).replace(".", ",")}K`;
  }
  return formatEur(value);
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
