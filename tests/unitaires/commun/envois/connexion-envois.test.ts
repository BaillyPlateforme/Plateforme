import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reponseHttp } from "./_outils";

/*
 * Le test de connexion des Paramètres du CRM (lib/connexion-envois.ts) : il
 * parle au fournisseur en vigueur — SendGrid et Twilio, ou Brevo avant la
 * bascule —, par une lecture sans effet, et n'affiche jamais une clé. Le
 * fetch est simulé, les accès factices.
 */

type Appel = { url: string; init: RequestInit & { headers: Record<string, string> } };
let appels: Appel[];

function simulerFetch(rep: (url: string) => Response | Promise<Response>) {
  appels = [];
  const f = vi.fn(async (url: string, init: Appel["init"]) => {
    appels.push({ url, init });
    return rep(url);
  });
  vi.stubGlobal("fetch", f);
  return f;
}

const CLE = "cle-sendgrid-factice-connexion";
const JETON = "jeton-twilio-factice-connexion";

beforeEach(() => {
  vi.resetModules();
  (globalThis as { __connexionEnvois?: unknown }).__connexionEnvois = undefined;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function twilio() {
  vi.stubEnv("SENDGRID_API_KEY", CLE);
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACfactice");
  vi.stubEnv("TWILIO_AUTH_TOKEN", JETON);
}

describe("connexion-envois — le fournisseur en vigueur", () => {
  it("avant la bascule : Brevo, un seul appel pour les deux canaux", async () => {
    vi.stubEnv("BREVO_API_KEY", "cle-brevo-factice");
    simulerFetch(() => reponseHttp(200, {}));
    const { verifierConnexionEnvois } = await import("@/lib/connexion-envois");
    const c = await verifierConnexionEnvois();
    expect(c).toMatchObject({ ok: true, titre: "Connexion Brevo (e-mails et SMS)", message: "Connexion Brevo active." });
    expect(appels.map((a) => a.url)).toEqual(["https://api.brevo.com/v3/account"]);
  });

  it("après la bascule : SendGrid (GET /v3/scopes, droit d'envoi) et Twilio (GET du compte), chacun avec ses accès", async () => {
    twilio();
    simulerFetch((url) => (url.includes("sendgrid") ? reponseHttp(200, { scopes: ["mail.send", "user.profile.read"] }) : reponseHttp(200, { sid: "ACfactice", status: "active" })));
    const { verifierConnexionEnvois } = await import("@/lib/connexion-envois");
    const c = await verifierConnexionEnvois();
    expect(c.ok).toBe(true);
    expect(c.titre).toBe("Connexion Twilio : SendGrid (e-mails) et Twilio (SMS)");
    expect(c.canaux).toEqual([
      { canal: "email", fournisseur: "sendgrid", ok: true, message: "Connexion SendGrid active (clé autorisée à envoyer)." },
      { canal: "sms", fournisseur: "twilio", ok: true, message: "Connexion Twilio active (expéditeur des Paramètres)." },
    ]);
    const sg = appels.find((a) => a.url.includes("sendgrid"))!;
    expect(sg.url).toBe("https://api.sendgrid.com/v3/scopes");
    expect(sg.init.headers.Authorization).toBe(`Bearer ${CLE}`);
    expect(sg.init.method).toBeUndefined();
    const tw = appels.find((a) => a.url.includes("twilio"))!;
    expect(tw.url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACfactice.json");
    expect(tw.init.headers.Authorization).toBe(`Basic ${Buffer.from(`ACfactice:${JETON}`).toString("base64")}`);
    // Jamais une clé dans ce que l'écran reçoit.
    expect(JSON.stringify(c)).not.toContain(CLE);
    expect(JSON.stringify(c)).not.toContain(JETON);
  });

  it("une clé SendGrid sans droit d'envoi, un compte Twilio suspendu : non connecté, et pourquoi", async () => {
    twilio();
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MGfactice");
    simulerFetch((url) => (url.includes("sendgrid") ? reponseHttp(200, { scopes: ["stats.read"] }) : reponseHttp(200, { status: "suspended" })));
    const { verifierConnexionEnvois } = await import("@/lib/connexion-envois");
    const c = await verifierConnexionEnvois();
    expect(c.ok).toBe(false);
    expect(c.canaux.map((x) => x.message)).toEqual([
      "La clé SendGrid est valide mais n'a pas le droit d'envoyer (autorisation « Mail Send »).",
      "Compte Twilio suspendu : les SMS ne partiront pas.",
    ]);
  });

  it("accès refusés : le statut et l'erreur du fournisseur, expurgée de la clé", async () => {
    twilio();
    simulerFetch((url) => (url.includes("sendgrid") ? reponseHttp(401, `{"errors":[{"message":"bad key ${CLE}"}]}`) : reponseHttp(401, { code: 20003, message: "Authenticate" })));
    const { verifierConnexionEnvois } = await import("@/lib/connexion-envois");
    const c = await verifierConnexionEnvois();
    expect(c.ok).toBe(false);
    expect(c.canaux[0].message.startsWith("SendGrid 401 : ")).toBe(true);
    expect(c.canaux[0].message).not.toContain(CLE);
    expect(c.canaux[1].message).toBe('Twilio 401 : {"code":20003,"message":"Authenticate"}');
  });

  it("ENVOI_FOURNISSEUR=twilio sans accès : aucun appel, le nom des variables qui manquent", async () => {
    vi.stubEnv("ENVOI_FOURNISSEUR", "twilio");
    const f = simulerFetch(() => reponseHttp(200, {}));
    const { verifierConnexionEnvois } = await import("@/lib/connexion-envois");
    const c = await verifierConnexionEnvois();
    expect(f).not.toHaveBeenCalled();
    expect(c.canaux.map((x) => x.message)).toEqual(["Aucune clé SendGrid configurée (SENDGRID_API_KEY).", "Accès Twilio incomplets (TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN)."]);
  });

  it("la réponse est gardée une minute ; une panne réseau ne l'est pas", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T10:00:00Z"));
    twilio();
    const f = simulerFetch((url) => (url.includes("sendgrid") ? reponseHttp(200, { scopes: ["mail.send"] }) : Promise.reject(new Error("getaddrinfo ENOTFOUND api.twilio.com"))));
    const { verifierConnexionEnvois } = await import("@/lib/connexion-envois");
    const c = await verifierConnexionEnvois();
    expect(c.canaux[1]).toMatchObject({ ok: false, message: "getaddrinfo ENOTFOUND api.twilio.com" });
    await verifierConnexionEnvois();
    // SendGrid gardé (1 appel), Twilio réessayé (2 appels).
    expect(f.mock.calls.filter((c) => String(c[0]).includes("sendgrid"))).toHaveLength(1);
    expect(f.mock.calls.filter((c) => String(c[0]).includes("twilio"))).toHaveLength(2);
    vi.setSystemTime(new Date("2026-11-18T10:01:00.001Z"));
    await verifierConnexionEnvois();
    expect(f.mock.calls.filter((c) => String(c[0]).includes("sendgrid"))).toHaveLength(2);
    vi.useRealTimers();
  });
});
