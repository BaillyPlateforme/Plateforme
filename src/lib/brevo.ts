import "server-only";
import { env } from "@/lib/env";

const BREVO = "https://api.brevo.com/v3";

function headers() {
  return {
    "api-key": env.brevoApiKey(),
    "Content-Type": "application/json",
    accept: "application/json",
  };
}

// Format international pour Brevo SMS : 0612… → 33612…
function normalizePhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  else if (p.startsWith("0")) p = "33" + p.slice(1);
  return p;
}

export async function sendBrevoEmail(input: {
  to: string;
  subject: string;
  html: string;
  senderName?: string | null;
  senderEmail?: string | null;
}) {
  if (!env.brevoApiKey()) throw new Error("Clé Brevo absente");
  const res = await fetch(`${BREVO}/smtp/email`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      sender: {
        name: input.senderName || "Bailly Déménagement",
        email: input.senderEmail || "no-reply@bailly.fr",
      },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
    }),
  });
  if (!res.ok) throw new Error(`Brevo email ${res.status} : ${await res.text()}`);
}

export async function sendBrevoSms(input: { to: string; content: string; sender?: string | null }) {
  if (!env.brevoApiKey()) throw new Error("Clé Brevo absente");
  const res = await fetch(`${BREVO}/transactionalSMS/sms`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "transactional",
      unicodeEnabled: true,
      sender: (input.sender || "Bailly").replace(/[^a-zA-Z0-9]/g, "").slice(0, 11) || "Bailly",
      recipient: normalizePhone(input.to),
      content: input.content,
    }),
  });
  if (!res.ok) throw new Error(`Brevo SMS ${res.status} : ${await res.text()}`);
}

// Vérifie la validité de la clé (compte).
export async function checkBrevo(): Promise<{ ok: boolean; message: string }> {
  if (!env.brevoApiKey()) return { ok: false, message: "Aucune clé Brevo configurée." };
  try {
    const res = await fetch(`${BREVO}/account`, { headers: headers() });
    if (res.ok) return { ok: true, message: "Connexion Brevo active." };
    const body = await res.text();
    return { ok: false, message: `Brevo ${res.status} : ${body.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur" };
  }
}
