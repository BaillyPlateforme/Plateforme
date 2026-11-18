/*
 * Les en-têtes de sécurité, les contournements connus du proxy, les routes
 * à secret et les liens de suivi. En lecture seule (@lecture) sauf mention :
 * ces tests tournent aussi contre la recette et la production déployées.
 */
import { C, EXT, INT, LOCAL, SECRETS, expect, ipNeuve, requeteEn, test } from "../outils/banc";

const ANCETRES_PERMIS = ["'self'", "https://www.demenagements-bailly.com", "https://demenagements-bailly.com", new URL(INT).origin];

test.describe("en-têtes de sécurité @lecture", () => {
  for (const chemin of ["/", "/demande", "/espace-client/connexion", "/rh/connexion", "/pro"]) {
    test(`app publique ${chemin}`, async () => {
      const r = await (await requeteEn(null)).get(EXT + chemin);
      expect(r.status(), chemin).toBeLessThan(400);
      const h = r.headers();
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      const csp = h["content-security-policy"] ?? "";
      const ancetres = csp.match(/frame-ancestors ([^;]+)/)?.[1].trim().split(/\s+/) ?? [];
      expect(ancetres.length, "frame-ancestors présent").toBeGreaterThan(0);
      expect(ancetres).not.toContain("*");
      for (const a of ancetres) expect(ANCETRES_PERMIS, `ancêtre non prévu : ${a}`).toContain(a);
    });
  }

  for (const chemin of ["/login", "/terrain/connexion"]) {
    test(`app de l'équipe ${chemin}`, async () => {
      const r = await (await requeteEn(null)).get(INT + chemin);
      expect(r.status()).toBe(200);
      const h = r.headers();
      expect(h["content-security-policy"]).toMatch(/frame-ancestors 'self'/);
      expect(h["x-frame-options"]).toBe("SAMEORIGIN");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
    });
  }

  test("une redirection de l'équipe garde ses en-têtes", async () => {
    const r = await (await requeteEn(null)).get(INT + "/dossiers");
    expect(r.status()).toBe(307);
    expect(r.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  });

  test("le suivi des clics garde son « no-referrer » (la règle générale ne l'écrase pas)", async () => {
    const r = await (await requeteEn(null)).get(EXT + "/t/c/jeton-invalide");
    expect(r.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("aucune page ne révèle le framework du serveur", async () => {
    // poweredByHeader: false dans les deux next.config (Next ajoutait « X-Powered-By: Next.js »).
    for (const u of [EXT + "/", INT + "/login"]) expect((await (await requeteEn(null)).get(u)).headers()["x-powered-by"], u).toBeUndefined();
  });
});

test.describe("le proxy de l'équipe ne se contourne pas @lecture", () => {
  const variantes = [
    "/api/data/espace-client/apercu/x.png",
    "/api/data/espace-client/apercu/x.PNG",
    "/api/data/espace-client/apercu/x%2Epng",
    "/api/data/espace-client/apercu/x.png/",
    "/API/data/espace-client/apercu/x.png",
    "/api/data/espace-client/apercu/x.woff2",
    "/api/data/espace-client/apercu?x=.png",
    "/api/data/clients/x.svg",
    "/api/data/clients;.png",
    "/api/data/clients%00.png",
    "/api/data/clients/..%2F..%2Ffonts/x.woff",
    "/fonts/../api/data/clients",
    "/_next/static/../../api/data/clients",
    "/api/data/clients?__nextDataReq=1",
    "/login/../api/data/clients",
    "/signature/../api/data/clients",
  ];
  for (const v of variantes) {
    test(`sans session, ${v} ne livre rien`, async () => {
      const r = await (await requeteEn(null)).get(INT + v);
      const corps = await r.text();
      const livre = r.status() >= 200 && r.status() < 300 && /^\s*[[{]/.test(corps) && corps.length > 20;
      expect(livre, `${r.status()} ${corps.slice(0, 80)}`).toBe(false);
    });
  }

  for (const v of ["/clients/12.png", "/dossiers/1.jpg", "/dashboard/x.svg", "/tablette/1.ico"]) {
    test(`une page de l'équipe déguisée en image (${v}) mène à la connexion`, async () => {
      const r = await (await requeteEn(null)).get(INT + v);
      expect([307, 308]).toContain(r.status());
      expect(r.headers()["location"]).toMatch(/\/login/);
    });
  }

  test("les vrais fichiers publics restent servis sans session", async () => {
    const req = await requeteEn(null);
    for (const f of ["/favicon.ico"]) expect((await req.get(INT + f)).status(), f).toBe(200);
  });

  test("un en-tête forgé ne fait pas passer pour un appel interne de Next", async () => {
    const req = await requeteEn(null);
    for (const entetes of [{ "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" }, { "x-middleware-subrequest": "src/proxy:src/proxy:src/proxy:src/proxy:src/proxy" }, { "x-nextjs-data": "1" }]) {
      const r = await req.get(INT + "/api/data/clients", { headers: entetes });
      expect(r.status(), JSON.stringify(entetes)).toBe(401);
    }
  });
});

// La redirection après connexion (paramètre « redirect ») se teste dans un vrai navigateur : parcours/connexions.spec.ts.

test.describe("routes à secret de l'app publique", () => {
  test("sans secret, elles sont fermées (404 si le secret n'est pas réglé, 401 sinon) @lecture", async () => {
    const req = await requeteEn(null);
    for (const [m, chemin] of [["POST", "/api/emails-entrants"], ["GET", "/api/diagnostic"], ["POST", "/api/suivi/brevo"]] as const) {
      const r = await req.fetch(EXT + chemin, { method: m, data: m === "POST" ? {} : undefined });
      expect([401, 404], `${m} ${chemin}`).toContain(r.status());
      const faux = await req.fetch(EXT + chemin, { method: m, data: m === "POST" ? {} : undefined, headers: { authorization: "Bearer faux" } });
      expect([401, 404], `${m} ${chemin} (faux)`).toContain(faux.status());
      const basic = await req.fetch(EXT + chemin, { method: m, data: m === "POST" ? {} : undefined, headers: { authorization: `Basic ${Buffer.from("n8n:faux").toString("base64")}` } });
      expect([401, 404], `${m} ${chemin} (Basic faux)`).toContain(basic.status());
    }
  });

  // Les webhooks de Twilio (bascule du 18/11/2026) : SendGrid (ECDSA) et le rappel d'état des SMS (HMAC du jeton).
  // Non réglés : 404 ; réglés : 401 sans signature, 403 avec une fausse. Jamais 2xx sans la vraie signature.
  test("les webhooks signés de Twilio refusent une requête sans signature ou mal signée @lecture", async () => {
    const req = await requeteEn(null);
    const sendgrid = [{ event: "delivered", sg_event_id: "batterie", sg_message_id: "batterie.filter.0" }];
    const sans = await req.post(EXT + "/api/suivi/sendgrid", { data: sendgrid });
    expect([401, 404], "SendGrid sans signature").toContain(sans.status());
    const fausse = await req.post(EXT + "/api/suivi/sendgrid", {
      data: sendgrid,
      headers: { "X-Twilio-Email-Event-Webhook-Signature": Buffer.from("fausse").toString("base64"), "X-Twilio-Email-Event-Webhook-Timestamp": String(Math.floor(Date.now() / 1000)) },
    });
    expect([403, 404], "SendGrid mal signé").toContain(fausse.status());

    const formulaire = { AccountSid: "ACbatterie", MessageSid: "SMbatterie", MessageStatus: "delivered" };
    const sansT = await req.post(EXT + "/api/suivi/twilio", { form: formulaire });
    expect([401, 404], "Twilio sans signature").toContain(sansT.status());
    const fausseT = await req.post(EXT + "/api/suivi/twilio", { form: formulaire, headers: { "X-Twilio-Signature": "AAAAAAAAAAAAAAAAAAAAAAAAAAA=" } });
    expect([403, 404], "Twilio mal signé").toContain(fausseT.status());
  });

  test("avec le secret, le diagnostic répond et lit l'adresse IP transmise", async () => {
    test.skip(!LOCAL || !SECRETS);
    const ip = ipNeuve();
    const r = await (await requeteEn(null)).get(EXT + "/api/diagnostic", { headers: { authorization: `Bearer ${SECRETS!.diagnostic}`, "x-real-ip": ip } });
    expect(r.status()).toBe(200);
    expect((await r.json()).adresse?.retenue).toBe(ip);
  });

  test("avec le secret, le suivi Brevo accepte un événement vide ou inconnu sans planter", async () => {
    test.skip(!LOCAL || !SECRETS);
    const req = await requeteEn(null);
    for (const corps of [[], {}, { event: "inconnu", email: "batterie.brevo@example.com" }, [{ event: "delivered", "message-id": "<faux@batterie>" }]]) {
      const r = await req.post(EXT + "/api/suivi/brevo", { data: corps, headers: { authorization: `Bearer ${SECRETS!.brevo}` } });
      expect(r.status(), JSON.stringify(corps)).toBeLessThan(500);
    }
  });

  test("avec le secret (Bearer ou Basic), n8n dépose un e-mail entrant qui devient une demande", async () => {
    test.skip(!C.ecritures || !SECRETS);
    const req = await requeteEn(null);
    const email = `batterie.entrant.${Date.now()}@example.com`;
    const corps = { expediteur: email, client_nom: "Batterie Entrant", client_email: email, ville_depart: "Paris", ville_arrivee: "Nantes", volume_m3: 15, sujet: "Demande de devis", corps: "Bonjour, je déménage." };
    const r = await req.post(EXT + "/api/emails-entrants", { data: corps, headers: { authorization: `Bearer ${SECRETS!.emails}` } });
    expect(r.status()).toBe(201);
    const basic = await req.post(EXT + "/api/emails-entrants", { data: { ...corps, client_email: email.replace("@", "+b@") }, headers: { authorization: `Basic ${Buffer.from(`n8n:${SECRETS!.emails}`).toString("base64")}` } });
    expect(basic.status()).toBe(201);
    const illisible = await req.post(EXT + "/api/emails-entrants", { data: Buffer.from("{x"), headers: { authorization: `Bearer ${SECRETS!.emails}`, "content-type": "application/json" } });
    expect(illisible.status()).toBe(400);
  });

  test("les tâches et les réponses SMS de l'équipe refusent un faux secret, acceptent le bon sans planter", async () => {
    test.skip(!LOCAL || !SECRETS);
    const req = await requeteEn(null);
    const sms = await req.post(INT + "/api/sms/reponses", { data: {}, headers: { authorization: `Bearer ${SECRETS!.sms}` } });
    expect(sms.status()).toBeLessThan(500);
    expect([401, 404]).toContain((await req.post(INT + "/api/sms/reponses", { data: {}, headers: { authorization: `Bearer ${SECRETS!.sms}x` } })).status());
  });
});

test.describe("liens de suivi des e-mails @lecture", () => {
  test("un lien de clic faux renvoie vers le site, jamais ailleurs", async () => {
    const req = await requeteEn(null);
    for (const jeton of ["faux", "x".repeat(500), "..%2F..%2Fevil", "aHR0cHM6Ly9ldmlsLmV4YW1wbGU"]) {
      const r = await req.get(`${EXT}/t/c/${jeton}`);
      expect(r.status(), jeton).toBe(302);
      const vers = new URL(r.headers()["location"], EXT);
      expect(vers.hostname, jeton).not.toMatch(/evil/);
    }
    const ouvert = await req.get(`${EXT}/t/c/faux?u=https://evil.example&url=https://evil.example`);
    expect(new URL(ouvert.headers()["location"], EXT).hostname).not.toMatch(/evil/);
  });

  test("le pixel d'ouverture et le battement de page ne plantent pas sur un jeton faux", async () => {
    const req = await requeteEn(null);
    expect((await req.get(`${EXT}/t/o/faux`)).status()).toBeLessThan(500);
    expect((await req.post(`${EXT}/t/p`, { data: { jeton: "faux" } })).status()).toBeLessThan(500);
    expect((await req.post(`${EXT}/t/p`, { data: Buffer.from("pas du json") })).status()).toBeLessThan(500);
  });
});

test.describe("photos du formulaire (Gemini) : les refus ne consomment rien @lecture", () => {
  test("sans photo, avec un faux fichier, avec trop de photos : refus lisibles", async () => {
    const req = await requeteEn(null);
    const ip = LOCAL ? { "x-real-ip": ipNeuve() } : {};
    expect((await req.post(EXT + "/api/analyze-volume", { data: {}, headers: ip })).status()).toBe(422);
    expect((await req.post(EXT + "/api/analyze-volume", { data: { paths: ["../../etc/passwd"] }, headers: ip })).status()).toBe(422);
    const faux = await req.post(EXT + "/api/analyze-volume", { multipart: { photos: { name: "salon.jpg", mimeType: "image/jpeg", buffer: Buffer.from("du texte, pas une photo") } }, headers: ip });
    expect(faux.status()).toBe(422);
    expect((await faux.json()).error).toMatch(/photo/i);
    const vide = await req.post(EXT + "/api/analyze-volume", { multipart: { autre: "x" }, headers: ip });
    expect(vide.status()).toBe(422);
  });
});
