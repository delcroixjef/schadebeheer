export type VerzekeraarKey = "baloise" | "axa" | "vivium" | "ag_insurance";

export const VERZEKERAARS: Record<VerzekeraarKey, { name: string; color: "blue" | "red" | "amber" | "green"; maxAuthority: number }> = {
  baloise: { name: "Baloise", color: "blue", maxAuthority: 10000 },
  axa: { name: "AXA", color: "red", maxAuthority: 3500 },
  vivium: { name: "Vivium", color: "amber", maxAuthority: 2500 },
  ag_insurance: { name: "AG Insurance", color: "green", maxAuthority: 4000 },
};

export const VERZEKERAAR_KEYS: VerzekeraarKey[] = ["baloise", "axa", "vivium", "ag_insurance"];

export const SCHADE_TYPES = [
  { value: "waterschade", label: "Waterschade" },
  { value: "brandschade", label: "Brandschade" },
  { value: "glasbraak", label: "Glasbraak" },
  { value: "stormschade", label: "Stormschade" },
  { value: "tuinafsluiting", label: "Tuinafsluiting" },
  { value: "andere", label: "Andere" },
] as const;

export const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  berekening: "Berekening",
  bestekanalyse: "Bestekanalyse",
  akkoord: "Akkoord",
  afgerond: "Afgerond",
  doorgestuurd_verzekeraar: "Doorgestuurd",
};
