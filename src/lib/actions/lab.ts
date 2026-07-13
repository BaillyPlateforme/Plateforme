"use server";

import { env } from "@/lib/env";

export interface LabEmail {
  from: string;
  subject: string;
  text: string;
}

// Coordonnées forcées : on remplace l'expéditeur et on injecte une signature
// claire, pour que l'extraction (n8n / IA) capture ces coordonnées de test.
export interface ForceContact {
  nom: string;
  email: string;
  tel: string;
}

export type LabMode = "prod" | "dev";

function webhookUrl(mode: LabMode) {
  return mode === "dev" ? env.labWebhookDevUrl() : env.labWebhookUrl();
}

function applyForce(email: LabEmail, force?: ForceContact | null): LabEmail {
  if (!force) return email;
  const sig = `\n\n-- \n${force.nom}\n${force.email}\n${force.tel}`;
  return { from: force.email, subject: email.subject, text: `${email.text}${sig}` };
}

// Envoie un email de test au webhook n8n (Lab bout-en-bout).
export async function sendLabEmail(email: LabEmail, mode: LabMode = "prod", force?: ForceContact | null) {
  const payload = applyForce(email, force);
  try {
    const res = await fetch(webhookUrl(mode), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: payload.from,
        subject: payload.subject,
        text: payload.text,
        textPlain: payload.text,
        receivedAt: "lab",
        // Transmis explicitement au cas où le workflow n8n veut forcer sans ré-extraire.
        force_contact: force ? { client_nom: force.nom, client_email: force.email, client_tel: force.tel } : undefined,
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

export async function sendLabBatch(emails: LabEmail[], mode: LabMode = "prod", force?: ForceContact | null) {
  const results = await Promise.all(emails.map((e) => sendLabEmail(e, mode, force)));
  const ok = results.filter((r) => r.ok).length;
  return { ok, total: emails.length };
}
