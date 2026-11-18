import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reponseHttp } from "./_outils";
import { corpsSendgrid, posterEmailSendgrid, sendgridConfigure, type EmailSendgrid } from "@/lib/envois/sendgrid";

/*
 * Le transport des e-mails par Twilio SendGrid (envois/sendgrid.ts), avec un
 * fetch simulé : le format exact de la requête (POST /v3/mail/send) et le
 * rangement des réponses. Aucun appel réseau, une clé factice.
 */

type Appel = { url: string; init: RequestInit & { headers: Record<string, string> } };
let appels: Appel[];

function simulerFetch(rep: () => Response | Promise<Response>) {
  appels = [];
  const f = vi.fn(async (url: string, init: Appel["init"]) => {
    appels.push({ url, init });
    return rep();
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const corps = (i = 0) => JSON.parse(String(appels[i].init.body));

const CLE = "cle-sendgrid-factice-pour-les-tests";
const ID = "11111111-1111-4111-8111-111111111111";
const email: EmailSendgrid = {
  a: "claire@gmail.com",
  sujet: "Votre devis",
  html: "<p>Bonjour</p>",
  expediteur: { nom: "Bailly Déménagement", email: "contact@bailly.fr" },
  bacASable: false,
  envoiId: ID,
};
const accepte = () => reponseHttp(202, "", { entetes: { "X-Message-Id": "W86EgYT6SQKk0lRflfLRsA" } });

beforeEach(() => {
  vi.stubEnv("SENDGRID_API_KEY", CLE);
  vi.stubEnv("SENDGRID_REGION", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("envois/sendgrid — sendgridConfigure", () => {
  it("vrai avec une clé, faux sans (ou avec des espaces seulement)", () => {
    expect(sendgridConfigure()).toBe(true);
    vi.stubEnv("SENDGRID_API_KEY", "   ");
    expect(sendgridConfigure()).toBe(false);
    vi.stubEnv("SENDGRID_API_KEY", "");
    expect(sendgridConfigure()).toBe(false);
  });
});

describe("envois/sendgrid — la requête", () => {
  it("POST https://api.sendgrid.com/v3/mail/send, la clé en Bearer, du JSON, un délai de 15 secondes", async () => {
    const espion = vi.spyOn(AbortSignal, "timeout");
    simulerFetch(accepte);
    const r = await posterEmailSendgrid(email);
    expect(r).toEqual({ ok: true, id: "W86EgYT6SQKk0lRflfLRsA" });
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(appels[0].init.method).toBe("POST");
    expect(appels[0].init.headers.Authorization).toBe(`Bearer ${CLE}`);
    expect(appels[0].init.headers["Content-Type"]).toBe("application/json");
    expect(appels[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(espion).toHaveBeenCalledWith(15_000);
    espion.mockRestore();
  });

  it("le corps exact : un destinataire, la ligne du journal en custom_args, le HTML, le suivi de SendGrid coupé", async () => {
    simulerFetch(accepte);
    await posterEmailSendgrid(email);
    expect(corps()).toEqual({
      personalizations: [{ to: [{ email: "claire@gmail.com" }], custom_args: { envoi_id: ID } }],
      from: { email: "contact@bailly.fr", name: "Bailly Déménagement" },
      subject: "Votre devis",
      content: [{ type: "text/html", value: "<p>Bonjour</p>" }],
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
        subscription_tracking: { enable: false },
      },
    });
  });

  it("le texte brut passe AVANT le HTML ; « répondre à » et pièces jointes (avec leur type) seulement s'ils sont donnés", async () => {
    simulerFetch(accepte);
    await posterEmailSendgrid({
      ...email,
      texte: "Bonjour",
      repondreA: "conseiller@bailly.fr",
      piecesJointes: [
        { nom: "devis.pdf", base64: "JVBERi0=" },
        { nom: "plan.PNG", base64: "iVBO" },
        { nom: "sans-extension", base64: "AA==" },
      ],
    });
    const c = corps();
    expect(c.content).toEqual([
      { type: "text/plain", value: "Bonjour" },
      { type: "text/html", value: "<p>Bonjour</p>" },
    ]);
    expect(c.reply_to).toEqual({ email: "conseiller@bailly.fr" });
    expect(c.attachments).toEqual([
      { content: "JVBERi0=", filename: "devis.pdf", disposition: "attachment", type: "application/pdf" },
      { content: "iVBO", filename: "plan.PNG", disposition: "attachment", type: "image/png" },
      { content: "AA==", filename: "sans-extension", disposition: "attachment" },
    ]);
    await posterEmailSendgrid({ ...email, texte: "", repondreA: null, piecesJointes: [], envoiId: null });
    const d = corps(1);
    expect(d).not.toHaveProperty("reply_to");
    expect(d).not.toHaveProperty("attachments");
    expect(d).not.toHaveProperty("mail_settings");
    expect(d.content).toHaveLength(1);
    expect(d.personalizations).toEqual([{ to: [{ email: "claire@gmail.com" }] }]);
  });

  it("bac à sable : mail_settings.sandbox_mode activé ; SendGrid répond 200 sans identifiant", async () => {
    simulerFetch(() => reponseHttp(200, ""));
    const r = await posterEmailSendgrid({ ...email, bacASable: true });
    expect(corps().mail_settings).toEqual({ sandbox_mode: { enable: true } });
    expect(r).toEqual({ ok: true, id: null });
  });

  it("le nom de l'expéditeur tient sur une ligne, sans « ; » ni « , » (séparateurs d'adresses) ; vide, il est omis", async () => {
    simulerFetch(accepte);
    await posterEmailSendgrid({ ...email, expediteur: { nom: "Bailly,\r\nDéménagement; Paris", email: "contact@bailly.fr" } });
    expect(corps().from).toEqual({ email: "contact@bailly.fr", name: "Bailly Déménagement Paris" });
    await posterEmailSendgrid({ ...email, expediteur: { nom: " ; ", email: "contact@bailly.fr" } });
    expect(corps(1).from).toEqual({ email: "contact@bailly.fr" });
  });

  it("un objet portant un retour à la ligne reste dans « subject », sans créer de destinataire", async () => {
    simulerFetch(accepte);
    await posterEmailSendgrid({ ...email, sujet: "Devis\r\nBcc: pirate@pirate.com" });
    const c = corps();
    expect(c.subject).toBe("Devis\r\nBcc: pirate@pirate.com");
    expect(c.personalizations[0].to).toEqual([{ email: "claire@gmail.com" }]);
    expect(c.personalizations[0]).not.toHaveProperty("bcc");
  });

  it("SENDGRID_REGION=eu : l'API européenne", async () => {
    vi.stubEnv("SENDGRID_REGION", "EU");
    simulerFetch(accepte);
    await posterEmailSendgrid(email);
    expect(appels[0].url).toBe("https://api.eu.sendgrid.com/v3/mail/send");
  });

  it("corpsSendgrid est ce qui part, mot pour mot", async () => {
    simulerFetch(accepte);
    await posterEmailSendgrid(email);
    expect(corps()).toEqual(JSON.parse(JSON.stringify(corpsSendgrid(email))));
  });
});

describe("envois/sendgrid — réponses et pannes", () => {
  it("accepté sans en-tête X-Message-Id : envoyé, sans identifiant", async () => {
    simulerFetch(() => reponseHttp(202, ""));
    expect(await posterEmailSendgrid(email)).toEqual({ ok: true, id: null });
  });

  it("refusé (4xx) : définitif, l'erreur de SendGrid tronquée à 300 caractères", async () => {
    simulerFetch(() => reponseHttp(400, { errors: [{ message: "The from address does not match a verified Sender Identity.", field: "from" }] }));
    const r = await posterEmailSendgrid(email);
    expect(r).toMatchObject({ ok: false, definitif: true });
    if (!r.ok) expect(r.message).toBe('SendGrid 400 : {"errors":[{"message":"The from address does not match a verified Sender Identity.","field":"from"}]}');
    simulerFetch(() => reponseHttp(413, "x".repeat(1000)));
    const long = await posterEmailSendgrid(email);
    if (!long.ok) expect(long.message.length).toBe("SendGrid 413 : ".length + 300);
    for (const statut of [401, 403, 429]) {
      simulerFetch(() => reponseHttp(statut, "{}"));
      expect(await posterEmailSendgrid(email), String(statut)).toMatchObject({ ok: false, definitif: true });
    }
  });

  it("5xx ou redirection : incertain, jamais définitif", async () => {
    for (const statut of [500, 502, 503, 302]) {
      simulerFetch(() => reponseHttp(statut, "oups"));
      expect(await posterEmailSendgrid(email), String(statut)).toMatchObject({ ok: false, definitif: false });
    }
  });

  it("réseau coupé ou délai dépassé : incertain, « SendGrid injoignable »", async () => {
    simulerFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await posterEmailSendgrid(email)).toEqual({ ok: false, definitif: false, message: "SendGrid injoignable : fetch failed" });
    simulerFetch(() => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")));
    expect(await posterEmailSendgrid(email)).toMatchObject({ ok: false, definitif: false });
  });

  it("la clé ne s'écrit jamais dans un message d'erreur, même si SendGrid la renvoyait", async () => {
    simulerFetch(() => reponseHttp(401, `clé refusée : ${CLE}`));
    const r = await posterEmailSendgrid(email);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain(CLE);
      expect(r.message).toContain("•••");
    }
  });

  it("un corps de réponse illisible ne fait pas lever", async () => {
    simulerFetch(() => reponseHttp(500, "", { texteEchoue: true }));
    expect(await posterEmailSendgrid(email)).toEqual({ ok: false, definitif: false, message: "SendGrid 500 : " });
  });
});
