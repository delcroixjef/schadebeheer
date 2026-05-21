import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  IconArrowRight,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconInfoCircle,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, SectionHeading, PrimaryButton } from "@/components/Topbar";
import { useSession } from "@/lib/session";
import { formatEur } from "@/lib/format";
import { formatSupabaseError } from "@/lib/supabase-error";

// ─────────────────────────────────────────────────────────────────────────────
// Types & domain
// ─────────────────────────────────────────────────────────────────────────────

type GlasType = "enkelvoudig" | "dubbel" | "hr_pp" | "gelaagd" | "gehard";

const GLAS_TYPES: { value: GlasType; label: string; lagen: number }[] = [
  { value: "enkelvoudig", label: "Enkelvoudig glas", lagen: 1 },
  { value: "dubbel", label: "Dubbel glas", lagen: 2 },
  { value: "hr_pp", label: "HR++ glas", lagen: 2 },
  { value: "gelaagd", label: "Gelaagd glas", lagen: 2 },
  { value: "gehard", label: "Gehard glas", lagen: 1 },
];

type RuitLabel = "A" | "B" | "C";

type Ruit = {
  label: RuitLabel;
  lengte_m: number;
  breedte_m: number;
  aantal: number;
};

type Extras = {
  transport_stort: boolean;
  autolaadkraan: boolean;
  minikraan_spider: boolean;
  stelling_dagen: number;
  extra_halve_mandagen: number;
  parkeerverbod: boolean;
  parkeerverbod_dagen: number;
  nachtwerk: boolean;
};

type Prijzen = {
  glas_per_m2: number;
  transport_stort: number;
  autolaadkraan: number;
  minikraan_spider: number;
  stelling_per_dag: number;
  halve_mandag: number;
  parkeerverbod_per_dag: number;
  nachtwerk_pct: number;
};

// Default ref prices (€, incl. plaatsing). Auto-overridden by referentieprijzen
// when matching entries exist for the dossier's verzekeraar.
const DEFAULT_GLAS_PRIJS: Record<GlasType, number> = {
  enkelvoudig: 90,
  dubbel: 140,
  hr_pp: 180,
  gelaagd: 220,
  gehard: 260,
};

const DEFAULT_EXTRAS: Prijzen = {
  glas_per_m2: 140,
  transport_stort: 150,
  autolaadkraan: 450,
  minikraan_spider: 750,
  stelling_per_dag: 180,
  halve_mandag: 280,
  parkeerverbod_per_dag: 120,
  nachtwerk_pct: 0.35,
};

const GLAS_DENSITEIT_KG_PER_M2_PER_MM = 2.5; // glas ≈ 2500 kg/m³

// Mankrachtindicatie thresholds (Baloise GLAS Fenêtre logic)
function mankrachtIndicatie(gewichtKg: number): { tekst: string; aanbevolen: "geen" | "autolaadkraan" | "minikraan_spider" } {
  if (gewichtKg < 40) return { tekst: "1 persoon — handmatig", aanbevolen: "geen" };
  if (gewichtKg < 80) return { tekst: "2 personen — handmatig", aanbevolen: "geen" };
  if (gewichtKg < 150) return { tekst: "3 personen + autolaadkraan aanbevolen", aanbevolen: "autolaadkraan" };
  return { tekst: "Minikraan / spider verplicht", aanbevolen: "minikraan_spider" };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function GlasbraakCalculator({ dossierId }: { dossierId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const session = useSession();

  const dossierQ = useQuery({
    queryKey: ["dossier", dossierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dossiers")
        .select("*")
        .eq("id", dossierId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const verzekeraar = (dossierQ.data?.verzekeraar as string | null) ?? "baloise";

  // Try to fetch referentieprijzen relevant for glass for this verzekeraar.
  const refPrijzenQ = useQuery({
    queryKey: ["refprijzen-glas", verzekeraar],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referentieprijzen")
        .select("omschrijving, basisprijs, eenheid, code")
        .eq("verzekeraar", verzekeraar)
        .or("omschrijving.ilike.%glas%,code.ilike.%glas%");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ───── State ─────
  const [ruiten, setRuiten] = useState<Ruit[]>([
    { label: "A", lengte_m: 1.2, breedte_m: 1.0, aantal: 1 },
  ]);
  const [glasType, setGlasType] = useState<GlasType>("dubbel");
  const [glasdikteMm, setGlasdikteMm] = useState<number>(4);
  const [extras, setExtras] = useState<Extras>({
    transport_stort: false,
    autolaadkraan: false,
    minikraan_spider: false,
    stelling_dagen: 0,
    extra_halve_mandagen: 0,
    parkeerverbod: false,
    parkeerverbod_dagen: 0,
    nachtwerk: false,
  });
  const [prijzen, setPrijzen] = useState<Prijzen>({
    ...DEFAULT_EXTRAS,
    glas_per_m2: DEFAULT_GLAS_PRIJS.dubbel,
  });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // When glasType changes, default the m² price from preset (user can override)
  useEffect(() => {
    setPrijzen((p) => ({ ...p, glas_per_m2: DEFAULT_GLAS_PRIJS[glasType] }));
  }, [glasType]);

  // Try to auto-fill glas m²-prijs from referentieprijzen (heuristic match)
  useEffect(() => {
    if (!refPrijzenQ.data || refPrijzenQ.data.length === 0) return;
    const needle =
      glasType === "hr_pp" ? "hr" :
      glasType === "enkelvoudig" ? "enkel" :
      glasType === "dubbel" ? "dubbel" :
      glasType === "gelaagd" ? "gelaagd" : "gehard";
    const match = refPrijzenQ.data.find(
      (r) => String(r.omschrijving ?? "").toLowerCase().includes(needle) && Number(r.basisprijs) > 0,
    );
    if (match) setPrijzen((p) => ({ ...p, glas_per_m2: Number(match.basisprijs) }));
  }, [refPrijzenQ.data, glasType]);

  const lagen = GLAS_TYPES.find((g) => g.value === glasType)?.lagen ?? 1;

  // ───── Berekeningen per paneel ─────
  const berekeningPerRuit = useMemo(
    () =>
      ruiten.map((r) => {
        const oppervlakte = round2(r.lengte_m * r.breedte_m);
        const gewicht_per_paneel = round2(
          oppervlakte * glasdikteMm * lagen * GLAS_DENSITEIT_KG_PER_M2_PER_MM,
        );
        const total_m2 = round2(oppervlakte * r.aantal);
        const indicatie = mankrachtIndicatie(gewicht_per_paneel);
        return { ...r, oppervlakte, gewicht_per_paneel, total_m2, indicatie };
      }),
    [ruiten, glasdikteMm, lagen],
  );

  const totalM2 = round2(berekeningPerRuit.reduce((s, r) => s + r.total_m2, 0));
  const glasKost = round2(totalM2 * prijzen.glas_per_m2);

  const extraLines = useMemo(() => {
    const lines: { omschrijving: string; eenheid: string; hoeveelheid: number; ep: number; subtotaal: number }[] = [];
    if (extras.transport_stort)
      lines.push({ omschrijving: "Transport en stort", eenheid: "stuk", hoeveelheid: 1, ep: prijzen.transport_stort, subtotaal: prijzen.transport_stort });
    if (extras.autolaadkraan)
      lines.push({ omschrijving: "Autolaadkraan", eenheid: "stuk", hoeveelheid: 1, ep: prijzen.autolaadkraan, subtotaal: prijzen.autolaadkraan });
    if (extras.minikraan_spider)
      lines.push({ omschrijving: "Minikraan / spider", eenheid: "stuk", hoeveelheid: 1, ep: prijzen.minikraan_spider, subtotaal: prijzen.minikraan_spider });
    if (extras.stelling_dagen > 0)
      lines.push({ omschrijving: "Stelling", eenheid: "dag", hoeveelheid: extras.stelling_dagen, ep: prijzen.stelling_per_dag, subtotaal: round2(extras.stelling_dagen * prijzen.stelling_per_dag) });
    if (extras.extra_halve_mandagen > 0)
      lines.push({ omschrijving: "Extra mankracht", eenheid: "halve mandag", hoeveelheid: extras.extra_halve_mandagen, ep: prijzen.halve_mandag, subtotaal: round2(extras.extra_halve_mandagen * prijzen.halve_mandag) });
    if (extras.parkeerverbod && extras.parkeerverbod_dagen > 0)
      lines.push({ omschrijving: "Parkeerverbod", eenheid: "dag", hoeveelheid: extras.parkeerverbod_dagen, ep: prijzen.parkeerverbod_per_dag, subtotaal: round2(extras.parkeerverbod_dagen * prijzen.parkeerverbod_per_dag) });
    if (extras.nachtwerk) {
      const ntw = round2(glasKost * prijzen.nachtwerk_pct);
      lines.push({ omschrijving: `Nachtwerktoeslag (${Math.round(prijzen.nachtwerk_pct * 100)}%)`, eenheid: "forfait", hoeveelheid: 1, ep: ntw, subtotaal: ntw });
    }
    return lines;
  }, [extras, prijzen, glasKost]);

  const extraKost = round2(extraLines.reduce((s, l) => s + l.subtotaal, 0));
  const totaal = round2(glasKost + extraKost);

  // ───── Validatie ─────
  const validRuiten = berekeningPerRuit.filter((r) => r.lengte_m > 0 && r.breedte_m > 0 && r.aantal > 0);
  const canSave = validRuiten.length > 0 && prijzen.glas_per_m2 > 0;

  // ───── Mutaties ─────
  const saveMutation = useMutation({
    mutationFn: async (opts: { goNext: boolean }) => {
      setErrorBanner(null);

      // 1. Vervang bestaande schade_lijnen
      const { error: delErr } = await supabase.from("schade_lijnen").delete().eq("dossier_id", dossierId);
      if (delErr) throw delErr;

      // 2. Bouw nieuwe schade_lijnen vanuit glasberekening
      const ruitLijnen = berekeningPerRuit
        .filter((r) => r.total_m2 > 0)
        .map((r) => ({
          dossier_id: dossierId,
          omschrijving: `Glas ${r.label} — ${r.lengte_m}m × ${r.breedte_m}m × ${r.aantal} (${GLAS_TYPES.find((g) => g.value === glasType)?.label}, ${glasdikteMm}mm/laag)`,
          eenheid: "m²",
          hoeveelheid: r.total_m2,
          eenheidsprijs_excl_abex: prijzen.glas_per_m2,
          eenheidsprijs_incl_abex: prijzen.glas_per_m2,
          subtotaal: round2(r.total_m2 * prijzen.glas_per_m2),
        }));

      const extraLijnen = extraLines.map((l) => ({
        dossier_id: dossierId,
        omschrijving: l.omschrijving,
        eenheid: l.eenheid,
        hoeveelheid: l.hoeveelheid,
        eenheidsprijs_excl_abex: l.ep,
        eenheidsprijs_incl_abex: l.ep,
        subtotaal: l.subtotaal,
      }));

      const allLijnen = [...ruitLijnen, ...extraLijnen];
      if (allLijnen.length > 0) {
        const { error: insErr } = await supabase.from("schade_lijnen").insert(allLijnen);
        if (insErr) throw insErr;
      }

      // 3. Dossier status update
      const { error: dosErr } = await supabase
        .from("dossiers")
        .update({ status: opts.goNext ? "berekening" : (dossierQ.data?.status ?? "concept") })
        .eq("id", dossierId);
      if (dosErr) throw dosErr;

      // 4. Audit-log: bewaar alle invoerparameters voor traceability
      const { error: audErr } = await supabase.from("audit_log").insert({
        actie: "glasbraak_berekening",
        dossier_id: dossierId,
        uitgevoerd_door: session.userId,
        detail_json: {
          door: session.displayName,
          ruiten,
          glas_type: glasType,
          glasdikte_mm_per_laag: glasdikteMm,
          aantal_lagen: lagen,
          berekening_per_ruit: berekeningPerRuit.map((r) => ({
            label: r.label,
            oppervlakte_m2: r.oppervlakte,
            gewicht_per_paneel_kg: r.gewicht_per_paneel,
            mankracht: r.indicatie.tekst,
          })),
          extras,
          prijzen,
          totaal_m2: totalM2,
          glaskost: glasKost,
          extra_kost: extraKost,
          totaal,
          aantal_lijnen: allLijnen.length,
        },
      });
      if (audErr) throw audErr;

      return opts;
    },
    onSuccess: ({ goNext }) => {
      qc.invalidateQueries({ queryKey: ["schade_lijnen", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossier", dossierId] });
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      if (goNext) void navigate({ to: "/nieuwe-schade", search: { step: 3, id: dossierId } });
    },
    onError: (e) => setErrorBanner(formatSupabaseError(e)),
  });

  // ───── Ruit helpers ─────
  const addRuit = () => {
    const usedLabels = new Set(ruiten.map((r) => r.label));
    const next = (["A", "B", "C"] as RuitLabel[]).find((l) => !usedLabels.has(l));
    if (!next) return;
    setRuiten((rs) => [...rs, { label: next, lengte_m: 1, breedte_m: 1, aantal: 1 }]);
  };
  const removeRuit = (label: RuitLabel) =>
    setRuiten((rs) => (rs.length > 1 ? rs.filter((r) => r.label !== label) : rs));
  const updateRuit = (label: RuitLabel, patch: Partial<Ruit>) =>
    setRuiten((rs) => rs.map((r) => (r.label === label ? { ...r, ...patch } : r)));

  // ───── Mankracht aanbevelingen ─────
  const zwaarsteRuit = berekeningPerRuit.reduce((max, r) =>
    r.gewicht_per_paneel > (max?.gewicht_per_paneel ?? 0) ? r : max,
    berekeningPerRuit[0],
  );

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4">
      <div className="flex flex-col gap-4">
        {/* Glas-type / dikte */}
        <Card>
          <SectionHeading>Glasbraak — type & dikte</SectionHeading>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Type glas" required>
              <select
                className={inputCls}
                value={glasType}
                onChange={(e) => setGlasType(e.target.value as GlasType)}
              >
                {GLAS_TYPES.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Glasdikte per laag (mm)" required>
              <input
                type="number"
                step="0.5"
                min="2"
                max="20"
                className={inputCls}
                value={glasdikteMm}
                onChange={(e) => setGlasdikteMm(Math.max(0, Number(e.target.value)))}
              />
            </Field>
            <Field label="Aantal lagen (spouw uitgesloten)">
              <input className={inputCls} value={lagen} readOnly />
            </Field>
          </div>
        </Card>

        {/* Ruiten */}
        <Card>
          <SectionHeading>Ruiten</SectionHeading>
          <div className="grid grid-cols-[40px_1fr_1fr_80px_1fr_1fr_32px] gap-2 px-2 py-1.5 text-[11px] text-text-secondary uppercase tracking-[0.5px] bg-secondary rounded-md mb-1">
            <span>Ruit</span>
            <span>Lengte (m)</span>
            <span>Breedte (m)</span>
            <span>Aantal</span>
            <span>Opp. / paneel</span>
            <span>Gewicht / paneel</span>
            <span />
          </div>
          {berekeningPerRuit.map((r) => (
            <div
              key={r.label}
              className="grid grid-cols-[40px_1fr_1fr_80px_1fr_1fr_32px] gap-2 items-center px-2 py-1.5 border-b-[0.5px] border-border"
            >
              <div className="text-[13px] font-medium">{r.label}</div>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={r.lengte_m}
                onChange={(e) => updateRuit(r.label, { lengte_m: Number(e.target.value) })}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={r.breedte_m}
                onChange={(e) => updateRuit(r.label, { breedte_m: Number(e.target.value) })}
              />
              <input
                type="number"
                step="1"
                min="1"
                className={inputCls}
                value={r.aantal}
                onChange={(e) => updateRuit(r.label, { aantal: Math.max(1, Number(e.target.value)) })}
              />
              <div className="text-[13px] tabular-nums">{r.oppervlakte.toFixed(2)} m²</div>
              <div className="text-[13px] tabular-nums">
                {r.gewicht_per_paneel.toFixed(1)} kg
                <div className="text-[11px] text-text-muted">{r.indicatie.tekst}</div>
              </div>
              <button
                type="button"
                onClick={() => removeRuit(r.label)}
                className="text-text-muted hover:text-status-red-fg disabled:opacity-30"
                disabled={ruiten.length <= 1}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
          {ruiten.length < 3 && (
            <button
              type="button"
              onClick={addRuit}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed text-[13px] text-primary-dark hover:bg-primary-light/40 border-primary/40"
            >
              <IconPlus size={14} />
              Ruit toevoegen ({(["A", "B", "C"] as RuitLabel[]).find((l) => !ruiten.find((r) => r.label === l))})
            </button>
          )}

          {zwaarsteRuit && zwaarsteRuit.indicatie.aanbevolen !== "geen" && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-status-amber-bg text-status-amber-fg text-[12px]">
              <IconInfoCircle size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                Zwaarste paneel = {zwaarsteRuit.gewicht_per_paneel.toFixed(1)} kg ({zwaarsteRuit.label}).
                {" "}Aanbevolen hulpmiddel:{" "}
                <strong>
                  {zwaarsteRuit.indicatie.aanbevolen === "autolaadkraan" ? "autolaadkraan" : "minikraan / spider"}
                </strong>.
              </div>
            </div>
          )}
        </Card>

        {/* Eenheidsprijzen */}
        <Card>
          <SectionHeading>Eenheidsprijzen (incl. plaatsing)</SectionHeading>
          <div className="grid grid-cols-2 gap-3">
            <PriceField
              label={`Glas ${GLAS_TYPES.find((g) => g.value === glasType)?.label} — € / m²`}
              value={prijzen.glas_per_m2}
              onChange={(v) => setPrijzen((p) => ({ ...p, glas_per_m2: v }))}
              hint={
                refPrijzenQ.data && refPrijzenQ.data.length > 0
                  ? "Voorgesteld vanuit referentieprijzen — kan overschreven worden."
                  : "Default. Geen referentieprijs gevonden voor deze verzekeraar."
              }
            />
            <PriceField label="Transport / stort — €" value={prijzen.transport_stort} onChange={(v) => setPrijzen((p) => ({ ...p, transport_stort: v }))} />
            <PriceField label="Autolaadkraan — €" value={prijzen.autolaadkraan} onChange={(v) => setPrijzen((p) => ({ ...p, autolaadkraan: v }))} />
            <PriceField label="Minikraan / spider — €" value={prijzen.minikraan_spider} onChange={(v) => setPrijzen((p) => ({ ...p, minikraan_spider: v }))} />
            <PriceField label="Stelling — € / dag" value={prijzen.stelling_per_dag} onChange={(v) => setPrijzen((p) => ({ ...p, stelling_per_dag: v }))} />
            <PriceField label="Extra mankracht — € / halve mandag" value={prijzen.halve_mandag} onChange={(v) => setPrijzen((p) => ({ ...p, halve_mandag: v }))} />
            <PriceField label="Parkeerverbod — € / dag" value={prijzen.parkeerverbod_per_dag} onChange={(v) => setPrijzen((p) => ({ ...p, parkeerverbod_per_dag: v }))} />
            <PriceField
              label="Nachtwerktoeslag — % van glaskost"
              value={prijzen.nachtwerk_pct * 100}
              onChange={(v) => setPrijzen((p) => ({ ...p, nachtwerk_pct: Math.max(0, v / 100) }))}
            />
          </div>
        </Card>

        {/* Extra posten */}
        <Card>
          <SectionHeading>Extra posten</SectionHeading>
          <div className="flex flex-col">
            <CheckRow label="Transport / stort" checked={extras.transport_stort} onChange={(v) => setExtras((x) => ({ ...x, transport_stort: v }))} />
            <CheckRow label="Autolaadkraan" checked={extras.autolaadkraan} onChange={(v) => setExtras((x) => ({ ...x, autolaadkraan: v }))} />
            <CheckRow label="Minikraan / spider" checked={extras.minikraan_spider} onChange={(v) => setExtras((x) => ({ ...x, minikraan_spider: v }))} />
            <NumberRow label="Stelling (aantal dagen)" value={extras.stelling_dagen} min={0} onChange={(v) => setExtras((x) => ({ ...x, stelling_dagen: v }))} />
            <NumberRow label="Extra mankracht (halve mandagen)" value={extras.extra_halve_mandagen} min={0} step={0.5} onChange={(v) => setExtras((x) => ({ ...x, extra_halve_mandagen: v }))} />
            <CheckRow
              label="Parkeerverbod aanvragen"
              checked={extras.parkeerverbod}
              onChange={(v) => setExtras((x) => ({ ...x, parkeerverbod: v, parkeerverbod_dagen: v ? Math.max(1, x.parkeerverbod_dagen) : 0 }))}
              right={
                extras.parkeerverbod ? (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={`${inputCls} w-24`}
                    value={extras.parkeerverbod_dagen}
                    onChange={(e) => setExtras((x) => ({ ...x, parkeerverbod_dagen: Math.max(0, Number(e.target.value)) }))}
                    placeholder="dagen"
                  />
                ) : null
              }
            />
            <CheckRow label="Nachtwerktoeslag" checked={extras.nachtwerk} onChange={(v) => setExtras((x) => ({ ...x, nachtwerk: v }))} />
          </div>
        </Card>

        {errorBanner && (
          <div className="rounded-md border-[0.5px] border-status-red-fg/40 bg-status-red-bg text-status-red-fg px-3 py-2 text-[12px] flex items-start gap-2">
            <IconAlertTriangle size={14} className="mt-0.5" />
            <span>{errorBanner}</span>
          </div>
        )}
      </div>

      {/* Samenvatting */}
      <div className="flex flex-col gap-3">
        <Card>
          <SectionHeading>Samenvatting</SectionHeading>
          <SumRow label={`Totale glasoppervlakte`} value={`${totalM2.toFixed(2)} m²`} />
          <SumRow label={`Kostprijs glas incl. plaatsing`} value={formatEur(glasKost)} />
          {extraLines.map((l) => (
            <SumRow key={l.omschrijving} label={l.omschrijving} value={formatEur(l.subtotaal)} muted />
          ))}
          <SumRow label="Subtotaal extras" value={formatEur(extraKost)} />
          <div className="mt-3 rounded-md bg-status-green-bg text-status-green-fg px-3 py-2 flex justify-between items-center">
            <span className="text-[12px] font-medium">Totaal glasbraak</span>
            <span className="text-[16px] font-medium">{formatEur(totaal)}</span>
          </div>
          <div className="mt-2 text-[11px] text-text-muted">
            Bij opslaan wordt dit omgezet naar {validRuiten.length + extraLines.length} schadelijn(en) op het dossier.
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          <PrimaryButton
            onClick={() => saveMutation.mutate({ goNext: true })}
            disabled={!canSave || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Bezig…" : "Bewaren & volgende stap"}
            <IconArrowRight size={14} />
          </PrimaryButton>
          <button
            type="button"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ goNext: false })}
            className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[13px] border-[0.5px] border-border bg-card hover:bg-secondary disabled:opacity-50"
          >
            <IconDeviceFloppy size={14} />
            Bewaren als concept
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI helpers (kept local so we don't leak presentation outside)
// ─────────────────────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-2.5 py-1.5 text-[13px] bg-card border-[0.5px] border-border rounded-md focus:outline-none focus:border-primary";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-text-secondary mb-1">
        {label}
        {required && <span className="text-status-red-fg ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function PriceField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-text-secondary mb-1">{label}</span>
      <input
        type="number"
        step="0.01"
        min="0"
        className={inputCls}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
      />
      {hint && <span className="block text-[11px] text-text-muted mt-1">{hint}</span>}
    </label>
  );
}

function CheckRow({ label, checked, onChange, right }: { label: string; checked: boolean; onChange: (v: boolean) => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b-[0.5px] border-border last:border-0">
      <label className="flex items-center gap-2 text-[13px] cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-border"
        />
        {label}
      </label>
      {right}
    </div>
  );
}

function NumberRow({ label, value, onChange, min, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b-[0.5px] border-border">
      <span className="text-[13px]">{label}</span>
      <input
        type="number"
        min={min}
        step={step ?? 1}
        className={`${inputCls} w-28`}
        value={value}
        onChange={(e) => onChange(Math.max(min ?? 0, Number(e.target.value)))}
      />
    </div>
  );
}

function SumRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 text-[13px]">
      <span className={muted ? "text-text-muted" : "text-text-secondary"}>{label}</span>
      <span className={`font-medium tabular-nums ${muted ? "text-text-secondary" : ""}`}>{value}</span>
    </div>
  );
}
