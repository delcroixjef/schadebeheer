import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatEur } from "@/lib/format";
import { VERZEKERAARS, SCHADE_TYPES, type VerzekeraarKey } from "@/lib/insurers";
import { submitSignature, submitBezwaar } from "@/lib/klant-signing.functions";

export const Route = createFileRoute("/klant/$token")({
  component: KlantPortal,
  head: () => ({ meta: [{ title: "WelZeker — Klantenportaal" }] }),
});

const BTW = 0.21;
const INDIRECT = 0.10;

function KlantPortal() {
  const { token } = Route.useParams();
  const previewRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<null | "sign" | "bezwaar" | "done-sign" | "done-bezwaar">(null);
  const [klantEmail, setKlantEmail] = useState("");
  const signFn = useServerFn(submitSignature);
  const bezwaarFn = useServerFn(submitBezwaar);

  const q = useQuery({
    queryKey: ["klant_token_full", token],
    queryFn: async () => {
      const { data: t } = await supabase.from("klant_tokens").select("*").eq("token", token).maybeSingle();
      if (!t) return { status: "invalid" as const };
      if (t.gebruikt) return { status: "used" as const };
      if (new Date(t.expires_at) < new Date()) return { status: "expired" as const };
      const { data: d } = await supabase.from("dossiers").select("*").eq("id", t.dossier_id).single();
      const { data: lijnen } = await supabase.from("schade_lijnen").select("*").eq("dossier_id", t.dossier_id).order("created_at");
      return { status: "ok" as const, t, dossier: d!, lijnen: lijnen ?? [] };
    },
  });

  const totals = useMemo(() => {
    if (q.data?.status !== "ok") return null;
    const d = q.data.dossier;
    const sub = q.data.lijnen.reduce((s, l) => s + Number(l.subtotaal ?? 0), 0);
    const indirect = d.heeft_indirecte_verliezen ? sub * INDIRECT : 0;
    const btw = (sub + indirect) * BTW;
    const bruto = sub + indirect + btw;
    const vrijstelling = d.heeft_vrijstelling ? Number(d.vrijstelling_bedrag ?? 0) : 0;
    return { sub, indirect, btw, bruto, vrijstelling, netto: Math.max(0, bruto - vrijstelling) };
  }, [q.data]);

  async function buildPdfBase64(): Promise<string> {
    if (!previewRef.current) throw new Error("preview missing");
    const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - 48;
    const ratio = imgW / canvas.width;
    const pageContentH = (pageH - 48) / ratio;
    let sy = 0;
    let first = true;
    while (sy < canvas.height) {
      const sliceH = Math.min(pageContentH, canvas.height - sy);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      slice.getContext("2d")!.drawImage(canvas, 0, sy, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/png"), "PNG", 24, 24, imgW, sliceH * ratio);
      first = false;
      sy += sliceH;
    }
    const dataUrl = pdf.output("datauristring");
    return dataUrl.split(",")[1] ?? "";
  }

  // --- States ---
  if (q.isLoading) return <Shell><p className="text-sm text-text-secondary">Laden…</p></Shell>;
  if (q.data?.status === "invalid" || q.data?.status === "expired" || q.data?.status === "used") {
    return (
      <Shell>
        <h1 className="text-[20px] font-medium mb-2">Deze link is niet meer geldig.</h1>
        <p className="text-[13px] text-text-secondary">
          Neem contact op met uw WelZeker schadebeheerder voor een nieuwe ondertekenlink.
        </p>
      </Shell>
    );
  }
  if (q.data?.status !== "ok" || !totals) return null;

  const { dossier, lijnen } = q.data;
  const verzMeta = dossier.verzekeraar ? VERZEKERAARS[dossier.verzekeraar as VerzekeraarKey] : null;
  const schadeLabel = SCHADE_TYPES.find((s) => s.value === dossier.schade_type)?.label ?? "—";

  if (mode === "done-sign") {
    return (
      <Shell>
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-[#EEF5D6] text-[#3B6D11] flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
          <h1 className="text-[20px] font-medium mb-2">Bedankt.</h1>
          <p className="text-[14px] text-text-secondary">
            Uw regelingsdocument is ondertekend en bewaard. U ontvangt een kopie per e-mail.
          </p>
        </div>
      </Shell>
    );
  }
  if (mode === "done-bezwaar") {
    return (
      <Shell>
        <div className="text-center py-6">
          <h1 className="text-[20px] font-medium mb-2">Bezwaar verzonden.</h1>
          <p className="text-[14px] text-text-secondary">
            Uw schadebeheerder werd op de hoogte gebracht en neemt zo snel mogelijk contact met u op.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Title */}
      <h1 className="text-[24px] font-medium mb-1">Uw schaderegeling</h1>
      <p className="text-[13px] text-text-secondary mb-6">Dossier {dossier.dossiernummer}</p>

      {/* Summary box */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Schadedatum" value={dossier.schade_datum ? formatDate(dossier.schade_datum) : "—"} />
          <Field label="Schadesoort" value={schadeLabel} />
        </div>
        <div className="border-t border-border pt-4 flex items-center justify-between">
          <span className="text-[13px] text-text-secondary">Netto vergoeding</span>
          <span className="text-[28px] font-medium" style={{ color: "#3B6D11" }}>{formatEur(totals.netto)}</span>
        </div>
      </div>

      {/* Full document preview */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div ref={previewRef} className="bg-white text-[#1a1a1a] p-8" style={{ fontFamily: "Inter, sans-serif" }}>
          <div className="flex justify-between items-start mb-6">
            <div>
              <div style={{ color: "#8DB92E", fontSize: 22, fontWeight: 500 }}>WelZeker</div>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7280", marginTop: 4 }}>uw toekomst</div>
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", textAlign: "right" }}>
              <div>Dossier {dossier.dossiernummer}</div>
              <div>{formatDate(new Date())}</div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>OVEREENKOMST TOT MINNELIJKE SCHADEREGELING</div>
            <div style={{ fontSize: 11, fontStyle: "italic", color: "#6b7280", marginTop: 4 }}>Minnelijke regeling — Definitieve Kwijting</div>
          </div>

          <PdfSection title="1. Partijen">
            <p><strong>Tussen:</strong> NV WelZeker, optredend voor rekening van {verzMeta?.name ?? "de verzekeraar"}.</p>
            <p style={{ marginTop: 8 }}><strong>En:</strong> {dossier.klant_naam}{dossier.klant_adres ? `, wonende te ${dossier.klant_adres}` : ""}{dossier.klant_rijksregister ? `, RR ${dossier.klant_rijksregister}` : ""}.</p>
          </PdfSection>

          <PdfSection title="2. Voorwerp">
            <p>Minnelijke afhandeling van het schadegeval dd. {dossier.schade_datum ? formatDate(dossier.schade_datum) : "—"} ({schadeLabel.toLowerCase()}), polisnummer {dossier.polis_nummer ?? "—"}.</p>
            {dossier.schade_omschrijving && <p style={{ marginTop: 8 }}><em>Omschrijving:</em> {dossier.schade_omschrijving}</p>}
          </PdfSection>

          <PdfSection title="3. Schadelijnen">
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "4px 0" }}>Omschrijving</th>
                  <th style={{ textAlign: "right", padding: "4px 0" }}>Hoeveel.</th>
                  <th style={{ textAlign: "right", padding: "4px 0" }}>Eenh.prijs</th>
                  <th style={{ textAlign: "right", padding: "4px 0" }}>Subtotaal</th>
                </tr>
              </thead>
              <tbody>
                {lijnen.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "4px 0" }}>{l.omschrijving}</td>
                    <td style={{ padding: "4px 0", textAlign: "right" }}>{l.hoeveelheid} {l.eenheid ?? ""}</td>
                    <td style={{ padding: "4px 0", textAlign: "right" }}>{formatEur(Number(l.eenheidsprijs_incl_abex))}</td>
                    <td style={{ padding: "4px 0", textAlign: "right" }}>{formatEur(Number(l.subtotaal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfSection>

          <PdfSection title="4. Vergoeding">
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", marginBottom: 12 }}>
              <tbody>
                <PdfRow label="Subtotaal" value={formatEur(totals.sub)} />
                {totals.indirect > 0 && <PdfRow label="Indirecte verliezen (10%)" value={formatEur(totals.indirect)} />}
                <PdfRow label="BTW (21%)" value={formatEur(totals.btw)} />
                <PdfRow label="Bruto vergoeding" value={formatEur(totals.bruto)} bold />
                {totals.vrijstelling > 0 && <PdfRow label="Vrijstelling" value={`− ${formatEur(totals.vrijstelling)}`} />}
              </tbody>
            </table>
            <div style={{ border: "1px solid #8DB92E", borderRadius: 6, padding: "10px 14px", background: "#EEF5D6", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Netto uit te keren</span>
              <span style={{ fontSize: 16, fontWeight: 500, color: "#3B6D11" }}>{formatEur(totals.netto)}</span>
            </div>
          </PdfSection>

          <PdfSection title="5. Definitieve kwijting">
            <p>De Begunstigde verklaart, door ondertekening van huidige overeenkomst en na ontvangst van het bovenvermelde bedrag, volledig en definitief vergoed te zijn voor alle directe en indirecte gevolgen van het schadegeval.</p>
          </PdfSection>
        </div>
      </div>

      {/* Email + actions */}
      <div className="mb-4">
        <label className="text-[12px] text-text-muted block mb-1">Uw e-mailadres (voor ontvangst van de kopie)</label>
        <input
          type="email"
          value={klantEmail}
          onChange={(e) => setKlantEmail(e.target.value)}
          placeholder="naam@voorbeeld.be"
          className="w-full bg-card border border-border rounded-md px-3 py-2 text-[13px]"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setMode("sign")}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-[14px] text-primary-foreground"
          style={{ background: "#8DB92E" }}
        >
          Ik ga akkoord en onderteken digitaal
        </button>
        <button
          onClick={() => setMode("bezwaar")}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-[14px] bg-card border border-border hover:bg-muted"
        >
          Ik heb bezwaar
        </button>
      </div>

      {mode === "sign" && (
        <SignatureModal
          onCancel={() => setMode(null)}
          onConfirm={async (sig) => {
            const pdf = await buildPdfBase64();
            await signFn({ data: { token, signatureDataUrl: sig, pdfBase64: pdf, klantEmail: klantEmail || undefined } });
            setMode("done-sign");
          }}
        />
      )}
      {mode === "bezwaar" && (
        <BezwaarModal
          onCancel={() => setMode(null)}
          onConfirm={async (tekst) => {
            await bezwaarFn({ data: { token, tekst } });
            setMode("done-bezwaar");
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-[680px] mx-auto">
        <div className="mb-8">
          <div style={{ color: "#8DB92E", fontSize: 26, fontWeight: 500 }}>WelZeker</div>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>uw toekomst</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[14px]">{value}</div>
    </div>
  );
}

function PdfSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <h3 style={{ color: "#8DB92E", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #8DB92E", paddingBottom: 4, marginBottom: 8, fontWeight: 500 }}>{title}</h3>
      <div style={{ fontSize: 11, lineHeight: 1.55, color: "#1f2937" }}>{children}</div>
    </section>
  );
}

function PdfRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
      <td style={{ padding: "6px 0", fontWeight: bold ? 500 : 400 }}>{label}</td>
      <td style={{ padding: "6px 0", textAlign: "right", fontWeight: bold ? 500 : 400 }}>{value}</td>
    </tr>
  );
}

function SignatureModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (sig: string) => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")!.scale(ratio, ratio);
    padRef.current = new SignaturePad(canvas, { backgroundColor: "rgba(255,255,255,0)" });
    return () => padRef.current?.off();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl max-w-lg w-full p-6">
        <h2 className="text-[16px] font-medium mb-1">Digitale handtekening</h2>
        <p className="text-[12px] text-text-secondary mb-4">Teken hieronder met uw muis of vinger.</p>
        <div className="border border-border rounded-md bg-white mb-3">
          <canvas ref={canvasRef} className="w-full h-[180px] block" />
        </div>
        {err && <p className="text-[12px] text-red-600 mb-2">{err}</p>}
        <div className="flex justify-between gap-2">
          <button onClick={() => padRef.current?.clear()} className="px-3 py-2 text-[13px] border border-border rounded-md hover:bg-muted">Wis</button>
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={busy} className="px-3 py-2 text-[13px] border border-border rounded-md hover:bg-muted">Annuleren</button>
            <button
              disabled={busy}
              onClick={async () => {
                if (!padRef.current || padRef.current.isEmpty()) { setErr("Plaats eerst uw handtekening."); return; }
                setBusy(true); setErr(null);
                try {
                  await onConfirm(padRef.current.toDataURL("image/png"));
                } catch (e) {
                  setErr(String(e instanceof Error ? e.message : e));
                  setBusy(false);
                }
              }}
              className="px-4 py-2 text-[13px] rounded-md text-primary-foreground"
              style={{ background: "#8DB92E" }}
            >
              {busy ? "Bezig…" : "Bevestig handtekening"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BezwaarModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (t: string) => Promise<void> }) {
  const [tekst, setTekst] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl max-w-lg w-full p-6">
        <h2 className="text-[16px] font-medium mb-1">Bezwaar indienen</h2>
        <p className="text-[12px] text-text-secondary mb-4">Beschrijf kort waarom u niet akkoord gaat. Uw schadebeheerder ontvangt dit bericht per e-mail.</p>
        <textarea
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          rows={6}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] mb-3"
          placeholder="Uw opmerking…"
        />
        {err && <p className="text-[12px] text-red-600 mb-2">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="px-3 py-2 text-[13px] border border-border rounded-md hover:bg-muted">Annuleren</button>
          <button
            disabled={busy || tekst.trim().length < 3}
            onClick={async () => {
              setBusy(true); setErr(null);
              try { await onConfirm(tekst.trim()); }
              catch (e) { setErr(String(e instanceof Error ? e.message : e)); setBusy(false); }
            }}
            className="px-4 py-2 text-[13px] rounded-md text-primary-foreground"
            style={{ background: "#8DB92E" }}
          >
            {busy ? "Versturen…" : "Verstuur bezwaar"}
          </button>
        </div>
      </div>
    </div>
  );
}
