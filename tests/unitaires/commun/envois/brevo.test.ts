import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reponseHttp } from "./_outils";
import { brevoConfigure, posterEmail, posterSms, type EmailBrevo } from "@/lib/envois/brevo";

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

const email: EmailBrevo = {
  a: "claire@gmail.com",
  sujet: "Votre devis",
  html: "<p>Bonjour</p>",
  expediteur: { nom: "Bailly Déménagement", email: "no-reply@bailly.fr" },
  bacASable: false,
};

beforeEach(() => {
  vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("envois/brevo — brevoConfigure", () => {
  it("vrai avec une clé, faux sans", () => {
    expect(brevoConfigure()).toBe(true);
    vi.stubEnv("BREVO_API_KEY", "");
    expect(brevoConfigure()).toBe(false);
  });
});

describe("envois/brevo — posterEmail (la charge utile)", () => {
  it("POST /smtp/email avec la clé, le destinataire unique, l'objet et le HTML", async () => {
    simulerFetch(() => reponseHttp(201, { messageId: "<202611151000.1@smtp-relay.mailin.fr>" }));
    const r = await posterEmail(email);
    expect(r).toEqual({ ok: true, id: "<202611151000.1@smtp-relay.mailin.fr>" });
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(appels[0].init.method).toBe("POST");
    expect(appels[0].init.headers["api-key"]).toBe("xkeysib-test");
    expect(appels[0].init.headers["Content-Type"]).toBe("application/json");
    expect(appels[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(corps()).toEqual({
      sender: { name: "Bailly Déménagement", email: "no-reply@bailly.fr" },
      to: [{ email: "claire@gmail.com" }],
      subject: "Votre devis",
      htmlContent: "<p>Bonjour</p>",
    });
  });

  it("n'ajoute le texte, la réponse et les pièces jointes que s'ils sont donnés", async () => {
    simulerFetch(() => reponseHttp(201, { messageId: "m" }));
    await posterEmail({ ...email, texte: "Bonjour", repondreA: "conseiller@bailly.fr", piecesJointes: [{ nom: "devis.pdf", base64: "JVBERi0=" }] });
    expect(corps()).toMatchObject({
      textContent: "Bonjour",
      replyTo: { email: "conseiller@bailly.fr" },
      attachment: [{ name: "devis.pdf", content: "JVBERi0=" }],
    });
    await posterEmail({ ...email, texte: "", repondreA: null, piecesJointes: [] });
    const c = corps(1);
    expect(c).not.toHaveProperty("textContent");
    expect(c).not.toHaveProperty("replyTo");
    expect(c).not.toHaveProperty("attachment");
    expect(c).not.toHaveProperty("headers");
  });

  it("bac à sable : X-Sib-Sandbox: drop dans le corps ET en en-tête HTTP", async () => {
    simulerFetch(() => reponseHttp(201, { messageId: "m" }));
    await posterEmail({ ...email, bacASable: true });
    expect(corps().headers).toEqual({ "X-Sib-Sandbox": "drop" });
    expect(appels[0].init.headers["X-Sib-Sandbox"]).toBe("drop");
    // La clé, elle, reste celle du compte : l'en-tête du bac à sable ne la remplace pas.
    expect(appels[0].init.headers["api-key"]).toBe("xkeysib-test");
  });

  it("hors bac à sable : aucun en-tête X-Sib-Sandbox", async () => {
    simulerFetch(() => reponseHttp(201, { messageId: "m" }));
    await posterEmail(email);
    expect(appels[0].init.headers).not.toHaveProperty("X-Sib-Sandbox");
  });

  it("un objet portant un retour à la ligne reste dans le champ « subject » du JSON, sans créer de destinataire", async () => {
    simulerFetch(() => reponseHttp(201, { messageId: "m" }));
    await posterEmail({ ...email, sujet: "Devis\r\nBcc: pirate@pirate.com", html: "<p>x</p>" });
    const c = corps();
    expect(c.subject).toBe("Devis\r\nBcc: pirate@pirate.com");
    expect(c.to).toEqual([{ email: "claire@gmail.com" }]);
    expect(Object.keys(c).sort()).toEqual(["htmlContent", "sender", "subject", "to"]);
  });

  it("un nom d'expéditeur contenant du HTML part tel quel, comme texte JSON", async () => {
    simulerFetch(() => reponseHttp(201, { messageId: "m" }));
    await posterEmail({ ...email, expediteur: { nom: '<img src=x onerror="alert(1)">', email: "no-reply@bailly.fr" } });
    expect(corps().sender).toEqual({ name: '<img src=x onerror="alert(1)">', email: "no-reply@bailly.fr" });
  });
});

describe("envois/brevo — posterSms (la charge utile)", () => {
  it("POST /transactionalSMS/sms, numéro normalisé, transactionnel, unicode", async () => {
    simulerFetch(() => reponseHttp(201, { reference: "sms-ref-1", messageId: 42 }));
    const r = await posterSms({ a: "06 12 34 56 78", texte: "Vos cartons arrivent demain." });
    expect(r).toEqual({ ok: true, id: "42" });
    expect(appels[0].url).toBe("https://api.brevo.com/v3/transactionalSMS/sms");
    expect(corps()).toEqual({ type: "transactional", unicodeEnabled: true, sender: "Bailly", recipient: "33612345678", content: "Vos cartons arrivent demain." });
  });

  it("l'expéditeur : 11 caractères alphanumériques au plus, « Bailly » à défaut", async () => {
    simulerFetch(() => reponseHttp(201, {}));
    await posterSms({ a: "0612345678", texte: "x", expediteur: "Bailly Déménagement" });
    expect(corps(0).sender).toBe("BaillyDmnag");
    await posterSms({ a: "0612345678", texte: "x", expediteur: "!!! ---" });
    expect(corps(1).sender).toBe("Bailly");
    await posterSms({ a: "0612345678", texte: "x", expediteur: null });
    expect(corps(2).sender).toBe("Bailly");
    await posterSms({ a: "0612345678", texte: "x", expediteur: "Bailly\r\nX" });
    expect(corps(3).sender).toBe("BaillyX");
  });
});

describe("envois/brevo — réponses et pannes", () => {
  it("rend l'identifiant : messageId, sinon messageIds[0], sinon reference", async () => {
    simulerFetch(() => reponseHttp(201, { messageIds: ["<a>", "<b>"] }));
    expect(await posterEmail(email)).toEqual({ ok: true, id: "<a>" });
    simulerFetch(() => reponseHttp(201, { reference: "ref-9" }));
    expect(await posterEmail(email)).toEqual({ ok: true, id: "ref-9" });
    simulerFetch(() => reponseHttp(201, {}));
    expect(await posterEmail(email)).toEqual({ ok: true, id: null });
  });

  it("accepté sans JSON lisible : envoyé, sans identifiant", async () => {
    simulerFetch(() => reponseHttp(201, "<html>ok</html>"));
    expect(await posterEmail(email)).toEqual({ ok: true, id: null });
  });

  it("refusé (4xx) : définitif — rien n'est parti, le message tronqué à 300 caractères", async () => {
    const long = "x".repeat(1000);
    simulerFetch(() => reponseHttp(400, long));
    const r = await posterEmail(email);
    expect(r).toMatchObject({ ok: false, definitif: true });
    if (!r.ok) {
      expect(r.message.startsWith("Brevo 400 : ")).toBe(true);
      expect(r.message.length).toBe("Brevo 400 : ".length + 300);
    }
    for (const statut of [401, 403, 404, 429, 499]) {
      simulerFetch(() => reponseHttp(statut, "{}"));
      expect(await posterSms({ a: "0612345678", texte: "x" }), String(statut)).toMatchObject({ ok: false, definitif: true });
    }
  });

  it("Brevo en 500 (ou tout 5xx) : incertain, jamais définitif", async () => {
    for (const statut of [500, 502, 503, 504]) {
      simulerFetch(() => reponseHttp(statut, "Internal error"));
      expect(await posterEmail(email), String(statut)).toEqual({ ok: false, definitif: false, message: `Brevo ${statut} : Internal error` });
    }
  });

  it("une redirection (3xx) n'est pas tenue pour un envoi réussi", async () => {
    simulerFetch(() => reponseHttp(302, ""));
    expect(await posterEmail(email)).toMatchObject({ ok: false, definitif: false });
  });

  it("réseau coupé : incertain, « Brevo injoignable »", async () => {
    simulerFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await posterEmail(email)).toEqual({ ok: false, definitif: false, message: "Brevo injoignable : fetch failed" });
  });

  it("Brevo qui ne répond pas (délai dépassé) : incertain", async () => {
    simulerFetch(() => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")));
    const r = await posterSms({ a: "0612345678", texte: "x" });
    expect(r).toMatchObject({ ok: false, definitif: false });
    if (!r.ok) expect(r.message).toContain("Brevo injoignable");
  });

  it("le délai d'attente est de 15 secondes", async () => {
    const espion = vi.spyOn(AbortSignal, "timeout");
    simulerFetch(() => reponseHttp(201, {}));
    await posterEmail(email);
    expect(espion).toHaveBeenCalledWith(15_000);
    espion.mockRestore();
  });

  it("un corps de réponse illisible ne fait pas lever", async () => {
    simulerFetch(() => reponseHttp(500, "", { texteEchoue: true }));
    expect(await posterEmail(email)).toEqual({ ok: false, definitif: false, message: "Brevo 500 : " });
  });
});

describe("brevo — checkBrevo (écran des Paramètres)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sans clé : aucun appel, message clair", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const f = simulerFetch(() => reponseHttp(200, {}));
    const { checkBrevo } = await import("@/lib/brevo");
    expect(await checkBrevo()).toEqual({ ok: false, message: "Aucune clé Brevo configurée." });
    expect(f).not.toHaveBeenCalled();
  });

  it("clé valide : GET /account avec la clé, puis l'état gardé une minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
    const f = simulerFetch(() => reponseHttp(200, { email: "contact@bailly.fr" }));
    const { checkBrevo } = await import("@/lib/brevo");
    expect(await checkBrevo()).toEqual({ ok: true, message: "Connexion Brevo active." });
    expect(appels[0].url).toBe("https://api.brevo.com/v3/account");
    expect(appels[0].init.headers["api-key"]).toBe("xkeysib-test");
    expect(appels[0].init.method).toBeUndefined();
    vi.setSystemTime(new Date("2026-11-15T10:00:59.999Z"));
    await checkBrevo();
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-15T10:01:00.000Z"));
    await checkBrevo();
    expect(f).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("clé refusée : le statut et le début de la réponse (200 caractères)", async () => {
    simulerFetch(() => reponseHttp(401, `{"code":"unauthorized","message":"${"k".repeat(400)}"}`));
    const { checkBrevo } = await import("@/lib/brevo");
    const r = await checkBrevo();
    expect(r.ok).toBe(false);
    expect(r.message.startsWith("Brevo 401 : {\"code\":\"unauthorized\"")).toBe(true);
    expect(r.message.length).toBe("Brevo 401 : ".length + 200);
  });

  it("réseau coupé : l'erreur, sans la garder en mémoire (on réessaie au prochain affichage)", async () => {
    const f = simulerFetch(() => Promise.reject(new Error("getaddrinfo ENOTFOUND api.brevo.com")));
    const { checkBrevo } = await import("@/lib/brevo");
    expect(await checkBrevo()).toEqual({ ok: false, message: "getaddrinfo ENOTFOUND api.brevo.com" });
    await checkBrevo();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
