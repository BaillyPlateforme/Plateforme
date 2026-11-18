import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reponseHttp } from "./_outils";
import { adresseRappelTwilio, expediteurTwilio, formulaireTwilio, posterSmsTwilio, twilioConfigure } from "@/lib/envois/twilio";

/*
 * Le transport des SMS par Twilio (envois/twilio.ts), avec un fetch simulé :
 * le format exact de la requête (POST /2010-04-01/Accounts/{SID}/Messages.json,
 * authentification simple, formulaire) et le rangement des réponses. Aucun
 * appel réseau, des accès factices.
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
const formulaire = (i = 0) => Object.fromEntries(new URLSearchParams(String(appels[i].init.body)));

const COMPTE = "ACcompte-factice";
const JETON = "jeton-twilio-factice-pour-les-tests";
const ID = "11111111-1111-4111-8111-111111111111";
const SID = `SM${"0123456789abcdef".repeat(2)}`;
const accepte = () => reponseHttp(201, { sid: SID, status: "queued" });

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", COMPTE);
  vi.stubEnv("TWILIO_AUTH_TOKEN", JETON);
  vi.stubEnv("TWILIO_SMS_EXPEDITEUR", "");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "");
  vi.stubEnv("SUIVI_URL", "https://plateforme.bailly.fr/");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("envois/twilio — twilioConfigure", () => {
  it("il faut le SID ET le jeton", () => {
    expect(twilioConfigure()).toBe(true);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect(twilioConfigure()).toBe(false);
    vi.stubEnv("TWILIO_AUTH_TOKEN", JETON);
    vi.stubEnv("TWILIO_ACCOUNT_SID", " ");
    expect(twilioConfigure()).toBe(false);
  });
});

describe("envois/twilio — la requête", () => {
  it("POST /2010-04-01/Accounts/{SID}/Messages.json, authentification simple SID:jeton, formulaire, 15 secondes", async () => {
    const espion = vi.spyOn(AbortSignal, "timeout");
    simulerFetch(accepte);
    const r = await posterSmsTwilio({ a: "06 12 34 56 78", texte: "Vos cartons arrivent demain.", envoiId: ID });
    expect(r).toEqual({ ok: true, id: SID });
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${COMPTE}/Messages.json`);
    expect(appels[0].init.method).toBe("POST");
    expect(appels[0].init.headers.Authorization).toBe(`Basic ${Buffer.from(`${COMPTE}:${JETON}`).toString("base64")}`);
    expect(appels[0].init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(espion).toHaveBeenCalledWith(15_000);
    espion.mockRestore();
  });

  it("le formulaire exact : numéro au format international, texte, expéditeur, rappel d'état avec la ligne du journal", async () => {
    simulerFetch(accepte);
    await posterSmsTwilio({ a: "06 12 34 56 78", texte: "Vos cartons arrivent demain — 8 h.", expediteur: "Bailly", envoiId: ID });
    expect(formulaire()).toEqual({
      To: "+33612345678",
      Body: "Vos cartons arrivent demain — 8 h.",
      From: "Bailly",
      StatusCallback: `https://plateforme.bailly.fr/api/suivi/twilio?e=${ID}`,
    });
    expect(String(appels[0].init.body)).toBe(formulaireTwilio({ a: "06 12 34 56 78", texte: "Vos cartons arrivent demain — 8 h.", expediteur: "Bailly", envoiId: ID }).toString());
  });

  it("l'expéditeur : celui de l'appelant (réglages), sinon TWILIO_SMS_EXPEDITEUR, sinon « Bailly »", async () => {
    simulerFetch(accepte);
    vi.stubEnv("TWILIO_SMS_EXPEDITEUR", "BaillyDem");
    await posterSmsTwilio({ a: "0612345678", texte: "x", expediteur: "Bailly" });
    expect(formulaire(0).From).toBe("Bailly");
    await posterSmsTwilio({ a: "0612345678", texte: "x", expediteur: null });
    expect(formulaire(1).From).toBe("BaillyDem");
    vi.stubEnv("TWILIO_SMS_EXPEDITEUR", "");
    await posterSmsTwilio({ a: "0612345678", texte: "x" });
    expect(formulaire(2).From).toBe("Bailly");
  });

  it("un numéro d'envoi au format international (pour recevoir les réponses « 1 » et « 2 »)", async () => {
    simulerFetch(accepte);
    vi.stubEnv("TWILIO_SMS_EXPEDITEUR", "+33 7 00 00 00 00");
    await posterSmsTwilio({ a: "0612345678", texte: "x" });
    expect(formulaire().From).toBe("+33700000000");
  });

  it("le service de messagerie part toujours ; sans expéditeur donné, Twilio choisit dans son groupe", async () => {
    simulerFetch(accepte);
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MGservice-factice");
    await posterSmsTwilio({ a: "0612345678", texte: "x" });
    expect(formulaire(0)).toMatchObject({ MessagingServiceSid: "MGservice-factice" });
    expect(formulaire(0)).not.toHaveProperty("From");
    await posterSmsTwilio({ a: "0612345678", texte: "x", expediteur: "Bailly" });
    expect(formulaire(1)).toMatchObject({ MessagingServiceSid: "MGservice-factice", From: "Bailly" });
  });

  it("sans adresse publique en https (développement local), pas de rappel d'état", async () => {
    simulerFetch(accepte);
    vi.stubEnv("SUIVI_URL", "http://localhost:3939");
    await posterSmsTwilio({ a: "0612345678", texte: "x", envoiId: ID });
    expect(formulaire()).not.toHaveProperty("StatusCallback");
    expect(adresseRappelTwilio(ID)).toBeNull();
    vi.stubEnv("SUIVI_URL", "https://plateforme.bailly.fr");
    expect(adresseRappelTwilio(null)).toBeNull();
    expect(adresseRappelTwilio(ID)).toBe(`https://plateforme.bailly.fr/api/suivi/twilio?e=${ID}`);
  });

  it("le SID du compte est échappé dans l'adresse (il ne peut pas en changer le chemin)", async () => {
    simulerFetch(accepte);
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC/../../autre?x=1");
    await posterSmsTwilio({ a: "0612345678", texte: "x" });
    expect(appels[0].url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC%2F..%2F..%2Fautre%3Fx%3D1/Messages.json");
  });
});

describe("envois/twilio — expediteurTwilio", () => {
  const cas: [string | null | undefined, string | null][] = [
    ["Bailly", "Bailly"],
    ["Bailly Déménagement", "BaillyDmnag"],
    ["Bailly\r\nX", "BaillyX"],
    ["!!! ---", null],
    ["12345", null],
    ["", null],
    [null, null],
    [undefined, null],
    ["+33 7 00 00 00 00", "+33700000000"],
    ["07 00 00 00 00", "+33700000000"],
    ["0033700000000", "+33700000000"],
  ];
  for (const [brut, attendu] of cas) it(`${JSON.stringify(brut)} → ${JSON.stringify(attendu)}`, () => expect(expediteurTwilio(brut)).toBe(attendu));
});

describe("envois/twilio — réponses et pannes", () => {
  it("accepté sans « sid » lisible : envoyé, sans identifiant", async () => {
    simulerFetch(() => reponseHttp(201, "pas du json"));
    expect(await posterSmsTwilio({ a: "0612345678", texte: "x" })).toEqual({ ok: true, id: null });
  });

  it("refusé (4xx) : définitif, avec le code et le message de Twilio", async () => {
    simulerFetch(() => reponseHttp(400, { code: 21211, message: "Invalid 'To' Phone Number: +3361234", more_info: "https://www.twilio.com/docs/errors/21211", status: 400 }));
    expect(await posterSmsTwilio({ a: "0612345678", texte: "x" })).toEqual({ ok: false, definitif: true, message: "Twilio 400 : (21211) Invalid 'To' Phone Number: +3361234" });
    simulerFetch(() => reponseHttp(401, { code: 20003, message: "Authenticate" }));
    expect(await posterSmsTwilio({ a: "0612345678", texte: "x" })).toEqual({ ok: false, definitif: true, message: "Twilio 401 : (20003) Authenticate" });
    simulerFetch(() => reponseHttp(429, "trop"));
    expect(await posterSmsTwilio({ a: "0612345678", texte: "x" })).toEqual({ ok: false, definitif: true, message: "Twilio 429 : trop" });
  });

  it("5xx : incertain ; réseau coupé : incertain, « Twilio injoignable »", async () => {
    simulerFetch(() => reponseHttp(503, "Service Unavailable"));
    expect(await posterSmsTwilio({ a: "0612345678", texte: "x" })).toEqual({ ok: false, definitif: false, message: "Twilio 503 : Service Unavailable" });
    simulerFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await posterSmsTwilio({ a: "0612345678", texte: "x" })).toEqual({ ok: false, definitif: false, message: "Twilio injoignable : fetch failed" });
  });

  it("le jeton ne s'écrit jamais dans un message d'erreur", async () => {
    simulerFetch(() => reponseHttp(401, `jeton ${JETON} refusé`));
    const r = await posterSmsTwilio({ a: "0612345678", texte: "x" });
    if (!r.ok) expect(r.message).not.toContain(JETON);
    expect(r.ok).toBe(false);
  });
});
