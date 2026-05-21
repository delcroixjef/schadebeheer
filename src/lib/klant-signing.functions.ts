import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY niet geconfigureerd" };
  try {
    const body: Record<string, unknown> = {
      from: "WelZeker Schadebeheer <noreply@welzeker.be>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachmentBase64 && opts.attachmentFilename) {
      body.attachments = [{ filename: opts.attachmentFilename, content: opts.attachmentBase64 }];
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { sent: false, error: `Resend ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: String(e) };
  }
}

export const submitSignature = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      token: z.string().min(10).max(200),
      signatureDataUrl: z.string().min(50),
      pdfBase64: z.string().min(50),
      klantEmail: z.string().email().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: tokenRow, error: tErr } = await sb
      .from("klant_tokens")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (tErr || !tokenRow) throw new Error("Token niet gevonden");
    if (tokenRow.gebruikt) throw new Error("Deze link werd al gebruikt");
    if (new Date(tokenRow.expires_at) < new Date()) throw new Error("Deze link is verlopen");

    const path = `${tokenRow.dossier_id}/${tokenRow.id}.pdf`;
    const pdfBytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await sb.storage
      .from("ondertekende-documenten")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`Upload fout: ${upErr.message}`);

    const now = new Date().toISOString();
    await sb.from("klant_tokens").update({
      gebruikt: true,
      ondertekend_op: now,
      handtekening_data: data.signatureDataUrl,
    }).eq("id", tokenRow.id);

    await sb.from("dossiers").update({
      status: "akkoord",
      ondertekend_op: now,
      ondertekend_pdf_path: path,
    }).eq("id", tokenRow.dossier_id);

    await sb.from("audit_log").insert({
      dossier_id: tokenRow.dossier_id,
      actie: "klant_ondertekend",
      detail_json: { token: data.token, path },
    });

    let emailResult: { sent: boolean; error?: string } = { sent: false };
    if (data.klantEmail) {
      const { data: pub } = sb.storage.from("ondertekende-documenten").getPublicUrl(path);
      emailResult = await sendResendEmail({
        to: data.klantEmail,
        subject: "Uw ondertekende schaderegeling — WelZeker",
        html: `<p>Beste,</p><p>Bedankt voor uw digitale ondertekening. Uw regelingsdocument is hieronder bijgevoegd en blijft eveneens beschikbaar via deze <a href="${pub.publicUrl}">link</a>.</p><p>Met vriendelijke groet,<br/>WelZeker Schadebeheer</p>`,
        attachmentBase64: data.pdfBase64,
        attachmentFilename: "regeling-ondertekend.pdf",
      });
    }

    return { ok: true, path, email: emailResult };
  });

export const submitBezwaar = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      token: z.string().min(10).max(200),
      tekst: z.string().min(3).max(5000),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: tokenRow, error: tErr } = await sb
      .from("klant_tokens")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (tErr || !tokenRow) throw new Error("Token niet gevonden");
    if (new Date(tokenRow.expires_at) < new Date()) throw new Error("Deze link is verlopen");

    const now = new Date().toISOString();
    await sb.from("klant_tokens").update({ bezwaar_tekst: data.tekst }).eq("id", tokenRow.id);
    await sb.from("dossiers").update({
      bezwaar_tekst: data.tekst,
      bezwaar_op: now,
      status: "in_behandeling",
    }).eq("id", tokenRow.dossier_id);
    await sb.from("audit_log").insert({
      dossier_id: tokenRow.dossier_id,
      actie: "klant_bezwaar",
      detail_json: { token: data.token, tekst: data.tekst },
    });

    const { data: dossier } = await sb
      .from("dossiers")
      .select("dossiernummer, klant_naam, beheerder_id")
      .eq("id", tokenRow.dossier_id)
      .maybeSingle();

    let emailResult: { sent: boolean; error?: string } = { sent: false };
    // Without beheerder email lookup wired up, we just log. If RESEND set, send to a generic mailbox.
    if (process.env.RESEND_API_KEY) {
      emailResult = await sendResendEmail({
        to: process.env.WELZEKER_BEHEER_EMAIL || "schade@welzeker.be",
        subject: `Bezwaar klant — dossier ${dossier?.dossiernummer ?? ""}`,
        html: `<p>De klant <strong>${dossier?.klant_naam ?? ""}</strong> heeft een bezwaar ingediend voor dossier <strong>${dossier?.dossiernummer ?? ""}</strong>.</p><blockquote>${data.tekst.replace(/</g, "&lt;")}</blockquote>`,
      });
    }

    return { ok: true, email: emailResult };
  });
