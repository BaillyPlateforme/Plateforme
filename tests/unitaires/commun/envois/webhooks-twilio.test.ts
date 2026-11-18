import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Les deux webhooks de Twilio (app externe), avec leurs signatures vérifiées :
 *   - l'Event Webhook signé de SendGrid (api/suivi/sendgrid) : ECDSA P-256,
 *     une paire de clés tirée ici pour le test ;
 *   - le rappel d'état des SMS (api/suivi/twilio) : HMAC-SHA1 du jeton du
 *     compte, un jeton tiré ici, et l'adresse exacte derrière le proxy.
 * Requête non signée → 401, mal signée → 403, et rien n'est écrit. L'écriture
 * en base (lib/suivi-envois) est simulée.
 */

const m = vi.hoisted(() => ({ noter: vi.fn(), adresse: "https://plateforme.bailly.fr" as string | null }));
vi.mock("@/lib/suivi-envois", () => ({ noterEvenementsFournisseur: m.noter, adresseSuivi: () => m.adresse }));

import { POST as postSendgrid } from "@/app/api/suivi/sendgrid/route";
import { POST as postTwilio } from "@/app/api/suivi/twilio/route";
import { adressesCandidates, clePubliqueSendgrid, signatureSendgridValide, signatureTwilio, signatureTwilioValide } from "@/lib/suivi-envois/signatures";

const ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  m.noter.mockReset().mockImplementation(async (_s: string, evenements: unknown[]) => evenements.length);
  m.adresse = "https://plateforme.bailly.fr";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ─────────────── SendGrid ─────────────── */

const paire = () => generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const { publicKey, privateKey } = paire();
const CLE_PUBLIQUE = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const signerSendgrid = (horodatage: string, corps: string, cle = privateKey) => sign("sha256", Buffer.from(horodatage + corps, "utf8"), cle).toString("base64");

function requeteSendgrid(corps: string, entetes: Record<string, string> = {}) {
  return new Request("http://10.0.0.7:8080/api/suivi/sendgrid", { method: "POST", body: corps, headers: { "content-type": "application/json", ...entetes } });
}
function signee(corps: string, horodatage = "1763460000") {
  return requeteSendgrid(corps, { "X-Twilio-Email-Event-Webhook-Signature": signerSendgrid(horodatage, corps), "X-Twilio-Email-Event-Webhook-Timestamp": horodatage });
}

const EVENEMENTS = [
  { email: "claire@gmail.com", timestamp: 1763460000, event: "processed", sg_event_id: "ev-0", sg_message_id: "W86EgYT6SQKk0lRflfLRsA.filterdrecv-1-2-3.0", envoi_id: ID },
  { email: "claire@gmail.com", timestamp: 1763460001, event: "delivered", sg_event_id: "ev-1", sg_message_id: "W86EgYT6SQKk0lRflfLRsA.filterdrecv-1-2-3.0", envoi_id: ID, response: "250 OK" },
  { email: "x@gmail.com", timestamp: 1763460002, event: "bounce", type: "blocked", reason: "550 5.7.1 bloqué", sg_event_id: "ev-2", sg_message_id: "AAAA.filter.0" },
  { email: "y@gmail.com", timestamp: 1763460003, event: "dropped", reason: "Bounced Address", sg_event_id: "ev-3", sg_message_id: "BBBB.filter.0" },
  { email: "z@gmail.com", timestamp: 1763460004, event: "spamreport", sg_event_id: "ev-4", sg_message_id: "CCCC.filter.0" },
  { email: "z@gmail.com", timestamp: 1763460005, event: "group_unsubscribe", sg_event_id: "ev-5", sg_message_id: "CCCC.filter.0" },
  { email: "z@gmail.com", timestamp: 1763460006, event: "open", sg_event_id: "ev-6", sg_message_id: "CCCC.filter.0" },
  { email: "z@gmail.com", timestamp: 1763460007, event: "click", url: "https://x.fr", sg_event_id: "ev-7", sg_message_id: "CCCC.filter.0" },
  { email: "z@gmail.com", timestamp: 1763460008, event: "deferred", sg_event_id: "ev-8", sg_message_id: "CCCC.filter.0" },
  { email: "z@gmail.com", timestamp: 1763460009, event: "delivered", sg_event_id: "ev-9" },
];

describe("webhook SendGrid — la signature", () => {
  beforeEach(() => vi.stubEnv("SENDGRID_WEBHOOK_CLE_PUBLIQUE", CLE_PUBLIQUE));

  it("sans clé publique réglée, la route n'existe pas (404) et ne lit rien", async () => {
    vi.stubEnv("SENDGRID_WEBHOOK_CLE_PUBLIQUE", "");
    const r = await postSendgrid(signee("[]"));
    expect(r.status).toBe(404);
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("sans les en-têtes de signature (ou un seul des deux) : 401, rien n'est écrit", async () => {
    const corps = JSON.stringify(EVENEMENTS);
    expect((await postSendgrid(requeteSendgrid(corps))).status).toBe(401);
    expect((await postSendgrid(requeteSendgrid(corps, { "X-Twilio-Email-Event-Webhook-Signature": signerSendgrid("1", corps) }))).status).toBe(401);
    expect((await postSendgrid(requeteSendgrid(corps, { "X-Twilio-Email-Event-Webhook-Timestamp": "1" }))).status).toBe(401);
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("mal signé : 403, rien n'est écrit — autre clé, corps retouché, horodatage changé, signature illisible", async () => {
    const corps = JSON.stringify(EVENEMENTS);
    const ts = "1763460000";
    const autre = paire().privateKey;
    const cas: Record<string, string>[] = [
      { "X-Twilio-Email-Event-Webhook-Signature": signerSendgrid(ts, corps, autre), "X-Twilio-Email-Event-Webhook-Timestamp": ts },
      { "X-Twilio-Email-Event-Webhook-Signature": signerSendgrid(ts, corps.replace("delivered", "spamreport")), "X-Twilio-Email-Event-Webhook-Timestamp": ts },
      { "X-Twilio-Email-Event-Webhook-Signature": signerSendgrid(ts, corps), "X-Twilio-Email-Event-Webhook-Timestamp": "1763460001" },
      { "X-Twilio-Email-Event-Webhook-Signature": "pas-une-signature", "X-Twilio-Email-Event-Webhook-Timestamp": ts },
    ];
    for (const entetes of cas) expect((await postSendgrid(requeteSendgrid(corps, entetes))).status).toBe(403);
    // Une clé publique réglée mais illisible ne laisse rien passer.
    vi.stubEnv("SENDGRID_WEBHOOK_CLE_PUBLIQUE", "pas-une-cle");
    expect((await postSendgrid(signee(corps))).status).toBe(403);
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("le corps BRUT fait foi, accents et espaces compris ; la clé au format PEM est acceptée aussi", async () => {
    const corps = `[ {"event":"bounce","reason":"boîte pleine — réessayer","sg_event_id":"é1","sg_message_id":"Z.f.0"} ]`;
    expect((await postSendgrid(signee(corps))).status).toBe(200);
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
    vi.stubEnv("SENDGRID_WEBHOOK_CLE_PUBLIQUE", pem.replace(/\n/g, "\\n"));
    expect((await postSendgrid(signee(corps))).status).toBe(200);
    expect(clePubliqueSendgrid(pem)).not.toBeNull();
    expect(signatureSendgridValide(CLE_PUBLIQUE, "", corps, signerSendgrid("", corps))).toBe(false);
  });

  it("un corps trop gros est refusé avant toute lecture (413)", async () => {
    const r = await postSendgrid(requeteSendgrid("[]", { "content-length": "3000000", "X-Twilio-Email-Event-Webhook-Signature": "x", "X-Twilio-Email-Event-Webhook-Timestamp": "1" }));
    expect(r.status).toBe(413);
  });
});

describe("webhook SendGrid — les événements retenus", () => {
  beforeEach(() => vi.stubEnv("SENDGRID_WEBHOOK_CLE_PUBLIQUE", CLE_PUBLIQUE));

  it("délivré, rebond, abandon, plainte, désinscription ; ni ouverture, ni clic, ni étape", async () => {
    const r = await postSendgrid(signee(JSON.stringify(EVENEMENTS)));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ recus: 10, inscrits: 5 });
    expect(m.noter).toHaveBeenCalledTimes(1);
    const [source, evenements] = m.noter.mock.calls[0];
    expect(source).toBe("sendgrid");
    expect(evenements).toEqual([
      {
        type: "delivre",
        envoiId: ID,
        messageIds: ["W86EgYT6SQKk0lRflfLRsA", "W86EgYT6SQKk0lRflfLRsA.filterdrecv-1-2-3", "W86EgYT6SQKk0lRflfLRsA.filterdrecv-1-2-3.0"],
        genre: "delivered",
        raison: null,
        quand: "2025-11-18T10:00:01.000Z",
        cle: "sendgrid:ev-1",
      },
      { type: "rebond", envoiId: null, messageIds: ["AAAA", "AAAA.filter", "AAAA.filter.0"], genre: "blocked", raison: "550 5.7.1 bloqué", quand: "2025-11-18T10:00:02.000Z", cle: "sendgrid:ev-2" },
      { type: "rebond", envoiId: null, messageIds: ["BBBB", "BBBB.filter", "BBBB.filter.0"], genre: "dropped", raison: "Bounced Address", quand: "2025-11-18T10:00:03.000Z", cle: "sendgrid:ev-3" },
      { type: "plainte", envoiId: null, messageIds: ["CCCC", "CCCC.filter", "CCCC.filter.0"], genre: "spamreport", raison: null, quand: "2025-11-18T10:00:04.000Z", cle: "sendgrid:ev-4" },
      { type: "desinscription", envoiId: null, messageIds: ["CCCC", "CCCC.filter", "CCCC.filter.0"], genre: "group_unsubscribe", raison: null, quand: "2025-11-18T10:00:05.000Z", cle: "sendgrid:ev-5" },
    ]);
  });

  it("un événement seul (objet) se lit aussi ; sans sg_event_id, la clé se compose", async () => {
    await postSendgrid(signee(JSON.stringify({ event: "delivered", timestamp: 5, sg_message_id: "Q.f.0" })));
    expect(m.noter.mock.calls[0][1][0].cle).toBe("sendgrid:delivered:5:Q.f.0");
  });

  it("rien à retenir : aucune écriture, 200", async () => {
    const r = await postSendgrid(signee(JSON.stringify([{ event: "open" }, { event: "inconnu", sg_message_id: "x" }])));
    expect(r.status).toBe(200);
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("bien signé mais illisible : 400 ; base indisponible : 503 (SendGrid réessaie)", async () => {
    expect((await postSendgrid(signee("{pas du json"))).status).toBe(400);
    m.noter.mockRejectedValue(new Error("Suivi indisponible (base)."));
    expect((await postSendgrid(signee(JSON.stringify(EVENEMENTS)))).status).toBe(503);
  });
});

/* ─────────────── Twilio ─────────────── */

const JETON = randomBytes(16).toString("hex");
const SID = `SM${"0123456789abcdef".repeat(2)}`;
const COMPTE = "ACcompte-factice";
const PUBLIQUE = `https://plateforme.bailly.fr/api/suivi/twilio?e=${ID}`;

function rappel(params: Record<string, string>, o: { signeePour?: string; jeton?: string; vue?: string; entetes?: Record<string, string>; signature?: string | null } = {}) {
  const corps = new URLSearchParams(params).toString();
  const signature = o.signature === undefined ? signatureTwilio(o.jeton ?? JETON, o.signeePour ?? PUBLIQUE, Object.entries(params)) : o.signature;
  // Derrière le proxy de Railway, le serveur se voit appelé en http, sur son adresse interne.
  return new Request(o.vue ?? `http://10.0.0.7:8080/api/suivi/twilio?e=${ID}`, {
    method: "POST",
    body: corps,
    headers: { "content-type": "application/x-www-form-urlencoded", ...(signature ? { "X-Twilio-Signature": signature } : {}), ...(o.entetes ?? {}) },
  });
}
const livre = { AccountSid: COMPTE, MessageSid: SID, SmsSid: SID, MessageStatus: "delivered", SmsStatus: "delivered", To: "+33612345678", From: "Bailly", ApiVersion: "2010-04-01" };

describe("rappel Twilio — la signature", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", JETON);
    vi.stubEnv("TWILIO_ACCOUNT_SID", COMPTE);
  });

  it("l'algorithme de Twilio, sur l'exemple de sa documentation", () => {
    // L'exemple public de la documentation de Twilio (« Validating signatures from Twilio »), jeton 12345.
    const params: [string, string][] = [
      ["CallSid", "CA1234567890ABCDE"],
      ["Caller", "+12349013030"],
      ["Digits", "1234"],
      ["From", "+12349013030"],
      ["To", "+18005551212"],
    ];
    expect(signatureTwilio("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    // L'ordre d'arrivée des paramètres n'y change rien : ils sont triés.
    expect(signatureTwilio("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", [...params].reverse())).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });

  it("sans jeton réglé, la route n'existe pas (404)", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect((await postTwilio(rappel(livre))).status).toBe(404);
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("sans signature : 401, rien n'est écrit", async () => {
    expect((await postTwilio(rappel(livre, { signature: null }))).status).toBe(401);
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("mal signée : 403, rien n'est écrit — autre jeton, paramètre retouché, autre adresse, signature quelconque", async () => {
    const cas = [
      rappel(livre, { jeton: "un-autre-jeton" }),
      rappel(livre, { signeePour: `https://plateforme.bailly.fr/api/suivi/twilio?e=${ID.replace("1", "9")}` }),
      rappel(livre, { signeePour: "https://ailleurs.example/api/suivi/twilio" }),
      rappel(livre, { signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAA=" }),
    ];
    for (const req of cas) expect((await postTwilio(req)).status).toBe(403);
    // Un statut retouché après la signature.
    const vrai = rappel(livre);
    const truque = new Request(vrai.url, { method: "POST", body: new URLSearchParams({ ...livre, MessageStatus: "failed" }).toString(), headers: vrai.headers });
    expect((await postTwilio(truque)).status).toBe(403);
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("derrière le proxy : l'adresse publique réglée fait foi, même si le serveur se voit en http sur une adresse interne", async () => {
    expect((await postTwilio(rappel(livre))).status).toBe(200);
  });

  it("sans adresse publique réglée : celle des en-têtes du proxy (X-Forwarded-Proto, X-Forwarded-Host)", async () => {
    m.adresse = null;
    const req = rappel(livre, {
      signeePour: `https://bailly-plateforme.up.railway.app/api/suivi/twilio?e=${ID}`,
      entetes: { "x-forwarded-proto": "https", "x-forwarded-host": "bailly-plateforme.up.railway.app" },
    });
    expect((await postTwilio(req)).status).toBe(200);
    // Un port par défaut explicite dans l'adresse signée est accepté aussi.
    m.adresse = "https://plateforme.bailly.fr";
    expect((await postTwilio(rappel(livre, { signeePour: `https://plateforme.bailly.fr:443/api/suivi/twilio?e=${ID}` }))).status).toBe(200);
  });

  it("adressesCandidates : l'adresse réglée d'abord, puis les en-têtes du proxy, puis celle du serveur", () => {
    const req = new Request("http://10.0.0.7:8080/api/suivi/twilio?e=1", { headers: { "x-forwarded-proto": "https, http", "x-forwarded-host": "a.example, b.example" } });
    expect(adressesCandidates(req, "https://plateforme.bailly.fr/")).toEqual([
      "https://plateforme.bailly.fr/api/suivi/twilio?e=1",
      "https://a.example/api/suivi/twilio?e=1",
      "http://10.0.0.7:8080/api/suivi/twilio?e=1",
    ]);
    expect(signatureTwilioValide("", ["https://x"], [], "x")).toBe(false);
  });
});

describe("rappel Twilio — les états retenus", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", JETON);
    vi.stubEnv("TWILIO_ACCOUNT_SID", COMPTE);
  });

  it("délivré : rattaché à la ligne du journal donnée dans l'adresse, et à l'identifiant du message", async () => {
    const r = await postTwilio(rappel(livre));
    expect(await r.json()).toEqual({ inscrits: 1 });
    expect(m.noter).toHaveBeenCalledWith("twilio", [
      { type: "delivre", envoiId: ID, messageIds: [SID], genre: "delivered", raison: null, quand: null, cle: `twilio:delivered:${SID}` },
    ]);
  });

  it("non délivré ou en échec : un rebond, avec le code d'erreur de Twilio", async () => {
    await postTwilio(rappel({ ...livre, MessageStatus: "undelivered", SmsStatus: "undelivered", ErrorCode: "30003" }));
    await postTwilio(rappel({ ...livre, MessageStatus: "failed", ErrorCode: "30007", ErrorMessage: "Filtré par l'opérateur" }));
    expect(m.noter.mock.calls[0][1][0]).toMatchObject({ type: "rebond", genre: "undelivered", raison: "Erreur Twilio 30003", cle: `twilio:undelivered:${SID}` });
    expect(m.noter.mock.calls[1][1][0]).toMatchObject({ type: "rebond", genre: "failed", raison: "Erreur Twilio 30007 : Filtré par l'opérateur" });
  });

  it("les étapes (en file, envoyé à l'opérateur…) ne s'inscrivent pas", async () => {
    for (const statut of ["accepted", "queued", "sending", "sent", "inconnu"]) {
      const r = await postTwilio(rappel({ ...livre, MessageStatus: statut, SmsStatus: statut }));
      expect(r.status, statut).toBe(200);
    }
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("un autre compte (sous-compte signé du même jeton) : ignoré", async () => {
    const r = await postTwilio(rappel({ ...livre, AccountSid: "ACautre" }));
    expect(await r.json()).toEqual({ inscrits: 0 });
    expect(m.noter).not.toHaveBeenCalled();
  });

  it("un rappel réglé sur le service de messagerie, sans « e » : rattaché par l'identifiant du message", async () => {
    const adresse = "https://plateforme.bailly.fr/api/suivi/twilio";
    await postTwilio(rappel(livre, { signeePour: adresse, vue: "http://10.0.0.7:8080/api/suivi/twilio" }));
    expect(m.noter.mock.calls[0][1][0]).toMatchObject({ envoiId: null, messageIds: [SID] });
    // Un « e » qui n'est pas un identifiant de ligne est ignoré.
    const bizarre = `${adresse}?e=pas-un-uuid`;
    await postTwilio(rappel(livre, { signeePour: bizarre, vue: "http://10.0.0.7:8080/api/suivi/twilio?e=pas-un-uuid" }));
    expect(m.noter.mock.calls[1][1][0]).toMatchObject({ envoiId: null });
  });

  it("base indisponible : 503", async () => {
    m.noter.mockRejectedValue(new Error("Suivi indisponible (base)."));
    expect((await postTwilio(rappel(livre))).status).toBe(503);
  });
});
