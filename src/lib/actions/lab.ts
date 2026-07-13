"use server";

import { env } from "@/lib/env";

export interface LabEmail {
  from: string;
  subject: string;
  text: string;
}

export type LabMode = "prod" | "dev";

function webhookUrl(mode: LabMode) {
  return mode === "dev" ? env.labWebhookDevUrl() : env.labWebhookUrl();
}

// Envoie un email de test au webhook n8n (Lab bout-en-bout).
export async function sendLabEmail(email: LabEmail, mode: LabMode = "prod") {
  try {
    const res = await fetch(webhookUrl(mode), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: email.from,
        subject: email.subject,
        text: email.text,
        textPlain: email.text,
        receivedAt: "lab",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (/not registered for POST/i.test(body)) {
        return { ok: false, message: "Le node Webhook n8n est en GET — passez-le en méthode POST." };
      }
      if (mode === "dev" && /not registered/i.test(body)) {
        return { ok: false, message: "Webhook de test inactif — cliquez « Execute workflow » dans n8n, puis renvoyez." };
      }
      return { ok: false, message: `Webhook n8n : HTTP ${res.status} ${body.slice(0, 120)}` };
    }
    return { ok: true, message: "Envoyé au webhook ✓" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur d'appel du webhook" };
  }
}

export async function sendLabBatch(emails: LabEmail[], mode: LabMode = "prod") {
  const results = await Promise.all(emails.map((e) => sendLabEmail(e, mode)));
  const ok = results.filter((r) => r.ok).length;
  return { ok, total: emails.length };
}
