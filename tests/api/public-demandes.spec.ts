/*
 * L'API publique du formulaire : créer, valider, limiter, modifier une
 * demande ; le rappel, l'estimation, le devis. Ces tests ÉCRIVENT (des
 * demandes fictives en batterie.…@example.com, effacées au nettoyage) : ils ne
 * tournent que sur les serveurs locaux branchés sur la recette.
 */
import { C, EXT, SECRETS, emailUnique, expect, ipNeuve, requeteEn, test } from "../outils/banc";
import { baseRecette } from "../outils/comptes.mjs";
import { demandeValable } from "../outils/donnees";

test.skip(!C.ecritures, "écrit des demandes : seulement sur les serveurs locaux (recette)");

const poster = async (corps: unknown, { ip = ipNeuve(), entetes = {} as Record<string, string> } = {}) => {
  const r = await requeteEn(null);
  return r.post(EXT + "/api/requests", { data: corps as object, headers: { "x-real-ip": ip, ...entetes } });
};

async function ligne<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T | undefined> {
  const db = await baseRecette();
  try {
    return (await db.query(sql, params)).rows[0] as T | undefined;
  } finally {
    await db.end();
  }
}

test.describe("créer une demande", () => {
  test("une demande valable est enregistrée, puis chiffrée, sans qu'aucun message ne parte", async () => {
    const email = emailUnique();
    const r = await poster(demandeValable({}, email));
    expect(r.status()).toBe(201);
    const { id, modification } = await r.json();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof modification).toBe("string");

    const d = await ligne<{ client_email: string; depart_ville: string; arrivee_ville: string; volume_m3: number; source: string }>(
      "select client_email, depart_ville, arrivee_ville, volume_m3, source from public.requests where id = $1",
      [id],
    );
    expect(d).toMatchObject({ client_email: email, depart_ville: "Paris", arrivee_ville: "Lyon", source: "form" });
    expect(Number(d!.volume_m3)).toBe(20);

    // La suite (chiffrage, devis, messages) part après la réponse : on la laisse finir.
    await expect
      .poll(async () => (await ligne<{ n: number }>("select count(*)::int n from public.request_events where request_id = $1", [id]))?.n ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(1);
    // Rien n'est parti : les envois vers cette adresse sont journalisés, jamais « envoyés ».
    const partis = await ligne<{ n: number }>("select count(*)::int n from public.envois where lower(destinataire) = $1 and statut in ('envoye','delivre','ouvert','clique')", [email]);
    expect(partis?.n).toBe(0);
  });

  test("les noms légitimes sont acceptés", async () => {
    for (const nom of ["Jean-Pierre O'Neil", "Müller & Fils", "Société Générale (SG)", "M. et Mme Dupont", "Saint-Étienne / Lyon", "3+2 Logistique", "Anne–Marie — Lefèvre", "Ngô Thị Hương", "Zoë Ñúñez"]) {
      const r = await poster(demandeValable({ client: { nom, email: emailUnique() } }));
      expect(r.status(), nom).toBe(201);
    }
  });
});

test.describe("validation : les entrées fausses ou hostiles sont refusées proprement", () => {
  const cas: [string, (d: ReturnType<typeof demandeValable>) => unknown][] = [
    ["nom vide", (d) => ({ ...d, client: { ...d.client, nom: "  " } })],
    ["nom avec une adresse web", (d) => ({ ...d, client: { ...d.client, nom: "Gagnez sur bailly-promo.fr" } })],
    ["nom avec un lien http", (d) => ({ ...d, client: { ...d.client, nom: "http://evil" } })],
    ["nom de 81 caractères", (d) => ({ ...d, client: { ...d.client, nom: "A".repeat(81) } })],
    ["nom avec une balise", (d) => ({ ...d, client: { ...d.client, nom: "<img src=x onerror=alert(1)>" } })],
    ["nom avec un retour à la ligne", (d) => ({ ...d, client: { ...d.client, nom: "Jean\nBcc: x@example.com" } })],
    ["e-mail invalide", (d) => ({ ...d, client: { ...d.client, email: "pas-un-email" } })],
    ["e-mail de 255 caractères", (d) => ({ ...d, client: { ...d.client, email: `${"a".repeat(243)}@example.com` } })],
    ["téléphone de 31 caractères", (d) => ({ ...d, client: { ...d.client, tel: "0".repeat(31) } })],
    ["formule inconnue", (d) => ({ ...d, formule: "gratuite" })],
    ["méthode de volume inconnue", (d) => ({ ...d, volume: { method: "magie", volume_m3: 10 } })],
    ["volume négatif", (d) => ({ ...d, volume: { method: "explicit", volume_m3: -5 } })],
    ["distance négative", (d) => ({ ...d, distance_km: -1 })],
    ["étage négatif", (d) => ({ ...d, depart: { ...d.depart, etage: -1 } })],
    ["étage décimal", (d) => ({ ...d, depart: { ...d.depart, etage: 2.5 } })],
    ["liste d'objets vide", (d) => ({ ...d, volume: { method: "list", items: [] } })],
    ["client absent", (d) => ({ ...d, client: undefined })],
    ["corps qui n'est pas un objet (tableau)", () => []],
    ["corps nul", () => null],
  ];
  for (const [nom, fabriquer] of cas) {
    test(`${nom} → 422`, async () => {
      const r = await poster(fabriquer(demandeValable()));
      expect(r.status()).toBe(422);
      const j = await r.json();
      expect(typeof j.error).toBe("string");
    });
  }

  test("un JSON illisible → 400", async () => {
    const r = await (await requeteEn(null)).post(EXT + "/api/requests", { data: Buffer.from("{pas du json"), headers: { "content-type": "application/json", "x-real-ip": ipNeuve() } });
    expect(r.status()).toBe(400);
  });

  test("le message d'erreur est lisible par le visiteur (pas « Validation échouée »)", async () => {
    const r = await poster(demandeValable({ client: { nom: "Promo sur bailly-promo.fr", email: emailUnique() } }));
    expect((await r.json()).error).toMatch(/adresse web/);
  });

  test("une date souhaitée qui n'est pas une date est refusée, sans erreur du serveur", async () => {
    // Avant le 16/11/2026 : 500, et le message brut de Postgres renvoyé au visiteur.
    for (const date_souhaitee of ["demain matin, vers 10 h", "2026-02-30", "2026-13-01", "31/12/2026"]) {
      const r = await poster(demandeValable({ date_souhaitee }));
      expect(r.status(), date_souhaitee).toBe(422);
      expect((await r.json()).error, date_souhaitee).toMatch(/date souhaitée/);
    }
    expect((await poster(demandeValable({ date_souhaitee: "" }))).status(), "date vide = pas de date").toBe(201);
  });

  test("un commentaire démesuré (1 Mo) est refusé", async () => {
    // Les champs libres sont bornés (schemas.ts), et le corps entier plafonné à 300 ko (requete-json.ts).
    const r = await poster(demandeValable({ commentaire: "x".repeat(1_000_000) }));
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test("un champ libre au-delà de sa longueur (commentaire de 6 000 caractères) est refusé", async () => {
    expect((await poster(demandeValable({ commentaire: "x".repeat(6000) }))).status()).toBe(422);
    expect((await poster(demandeValable({ commentaire: "x".repeat(4000) }))).status()).toBe(201);
  });

  test("un espace insécable dans le nom est accepté comme un espace", async () => {
    expect((await poster(demandeValable({ client: { nom: "Jean\u00a0Dupont", email: emailUnique() } }))).status()).toBe(201);
  });

  // La ville et la période sont reprises dans les e-mails et le PDF que Bailly envoie à l'adresse saisie (« Paris → Lyon »,
  // modèles {{ville_depart}} / {{ville_arrivee}}, « Période ») : comme le nom, elles ne doivent pas pouvoir porter un lien.
  for (const [champ, fabriquer] of [
    ["la ville de départ", (d: ReturnType<typeof demandeValable>) => ({ ...d, depart: { ...d.depart, ville: "Colis bloqué, payez sur colis-relais.example" } })],
    ["la ville d'arrivée", (d: ReturnType<typeof demandeValable>) => ({ ...d, arrivee: { ...d.arrivee, ville: "https://evil.example/paiement" } })],
    ["la période", (d: ReturnType<typeof demandeValable>) => ({ ...d, date_souhaitee: undefined, flexibilite: "Réglez sur www.evil.example" })],
  ] as const) {
    test(`${champ} ne peut pas porter une adresse web (elle part dans l'e-mail au client)`, async () => {
      const r = await poster(fabriquer(demandeValable()));
      expect(r.status()).toBe(422);
    });
  }
});

test.describe("source « email » : réservée à la machine qui porte le secret", () => {
  test("un visiteur qui se déclare « email » reste « form »", async () => {
    const r = await poster(demandeValable(), { entetes: { "x-request-source": "email" } });
    expect(r.status()).toBe(201);
    const d = await ligne<{ source: string }>("select source from public.requests where id = $1", [(await r.json()).id]);
    expect(d?.source).toBe("form");
  });

  test("avec le secret, la demande est bien « email »", async () => {
    test.skip(!SECRETS);
    const r = await poster(demandeValable(), { entetes: { "x-request-source": "email", authorization: `Bearer ${SECRETS!.emails}` } });
    expect(r.status()).toBe(201);
    const d = await ligne<{ source: string }>("select source from public.requests where id = $1", [(await r.json()).id]);
    expect(d?.source).toBe("email");
  });
});

test.describe("limites de débit", () => {
  test("depuis une même adresse IP, la troisième demande de la minute est refusée, avec un délai", async () => {
    const ip = ipNeuve();
    expect((await poster(demandeValable(), { ip })).status()).toBe(201);
    expect((await poster(demandeValable(), { ip })).status()).toBe(201);
    const r = await poster(demandeValable(), { ip });
    expect(r.status()).toBe(429);
    expect(Number(r.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await r.json()).error).toMatch(/Réessayez/);
  });

  test("une même adresse e-mail est plafonnée à 5 demandes par jour, alias +étiquette compris, depuis des IP différentes", async () => {
    const email = emailUnique("plafond");
    const [local, domaine] = email.split("@");
    for (let i = 0; i < 5; i++) expect((await poster(demandeValable({}, i % 2 ? `${local}+essai${i}@${domaine}` : email))).status(), `demande ${i + 1}`).toBe(201);
    const r = await poster(demandeValable({}, `${local}+encore@${domaine}`));
    expect(r.status()).toBe(429);
  });

  test("huit demandes lancées EN MÊME TEMPS depuis une IP : exactement deux passent (réservation atomique)", async () => {
    const ip = ipNeuve();
    const statuts = (await Promise.all(Array.from({ length: 8 }, () => poster(demandeValable(), { ip })))).map((r) => r.status());
    expect(statuts.filter((s) => s === 201)).toHaveLength(2);
    expect(statuts.filter((s) => s === 429)).toHaveLength(6);
  });

  test("un refus ne consomme pas de place : la demande invalide ne compte pas", async () => {
    const ip = ipNeuve();
    for (let i = 0; i < 3; i++) expect((await poster({ client: {} }, { ip })).status()).toBe(422);
    expect((await poster(demandeValable(), { ip })).status()).toBe(201);
  });
});

test.describe("modifier sa demande (jeton de modification)", () => {
  test("seul le jeton remis à la création permet de modifier, et seulement cette demande", async () => {
    const a = await (await poster(demandeValable())).json();
    const b = await (await poster(demandeValable())).json();
    const req = await requeteEn(null);
    const modifiee = demandeValable({ arrivee: { adresse: "2 quai du Port", code_postal: "13002", ville: "Marseille", etage: 1, ascenseur: true } });

    const sansJeton = await req.put(`${EXT}/api/requests/${a.id}`, { data: modifiee, headers: { "x-real-ip": ipNeuve() } });
    expect(sansJeton.status()).toBeGreaterThanOrEqual(400);
    const mauvais = await req.put(`${EXT}/api/requests/${a.id}`, { data: modifiee, headers: { "x-jeton-modification": "faux", "x-real-ip": ipNeuve() } });
    expect(mauvais.status()).toBeGreaterThanOrEqual(400);
    const croise = await req.put(`${EXT}/api/requests/${a.id}`, { data: modifiee, headers: { "x-jeton-modification": b.modification, "x-real-ip": ipNeuve() } });
    expect(croise.status()).toBeGreaterThanOrEqual(400);
    expect((await ligne<{ v: string }>("select arrivee_ville v from public.requests where id = $1", [a.id]))?.v).toBe("Lyon");

    const bon = await req.put(`${EXT}/api/requests/${a.id}`, { data: modifiee, headers: { "x-jeton-modification": a.modification, "x-real-ip": ipNeuve() } });
    expect(bon.status()).toBeLessThan(300);
    expect((await ligne<{ v: string }>("select arrivee_ville v from public.requests where id = $1", [a.id]))?.v).toBe("Marseille");
  });

  test("une demande inconnue → refus propre, pas une erreur du serveur", async () => {
    const r = await (await requeteEn(null)).put(`${EXT}/api/requests/00000000-0000-4000-8000-000000000000`, { data: demandeValable(), headers: { "x-jeton-modification": "x", "x-real-ip": ipNeuve() } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });
});

test.describe("rappel, estimation et devis d'une demande", () => {
  test("le rappel : JSON illisible 400, demande absente 422, inconnue 404, puis une seule fois", async () => {
    const req = await requeteEn(null);
    const ip = ipNeuve();
    expect((await req.post(EXT + "/api/rappels", { data: Buffer.from("{x"), headers: { "content-type": "application/json", "x-real-ip": ip } })).status()).toBe(400);
    expect((await req.post(EXT + "/api/rappels", { data: {}, headers: { "x-real-ip": ip } })).status()).toBe(422);
    expect((await req.post(EXT + "/api/rappels", { data: { request_id: "00000000-0000-4000-8000-000000000000" }, headers: { "x-real-ip": ipNeuve() } })).status()).toBe(404);
    const { id } = await (await poster(demandeValable())).json();
    const premier = await req.post(EXT + "/api/rappels", { data: { request_id: id, creneau: "matin" }, headers: { "x-real-ip": ipNeuve() } });
    expect(premier.status()).toBe(201);
    const second = await req.post(EXT + "/api/rappels", { data: { request_id: id, creneau: "matin" }, headers: { "x-real-ip": ipNeuve() } });
    expect(second.status()).toBe(200);
  });

  test("le devis d'une demande inconnue, ou d'un identifiant farfelu, donne 404", async () => {
    const req = await requeteEn(null);
    for (const id of ["00000000-0000-4000-8000-000000000000", "pas-un-uuid", "' or 1=1 --"]) {
      expect((await req.get(`${EXT}/api/requests/${encodeURIComponent(id)}/devis`)).status(), id).toBe(404);
      expect((await req.get(`${EXT}/api/devis/${encodeURIComponent(id)}/pdf`)).status(), id).toBe(404);
    }
  });

  test("l'estimation publique reste finie et positive, quelles que soient les entrées", async () => {
    const req = await requeteEn(null);
    for (const corps of [{ volume_m3: 20, distance_km: 465 }, { volume_m3: -50, distance_km: -10 }, { volume_m3: "abc", distance_km: null }, { volume_m3: 1e12, distance_km: 1e12 }, {}]) {
      const r = await req.post(EXT + "/api/estimate", { data: corps });
      expect(r.status(), JSON.stringify(corps)).toBe(200);
      const texte = await r.text();
      expect(texte, JSON.stringify(corps)).not.toMatch(/NaN|Infinity|null,"total"/);
      const nombres = [...texte.matchAll(/"(?:total|ttc|ht|prix)[a-z_]*":(-?[\d.e+]+)/gi)].map((m) => Number(m[1]));
      for (const n of nombres) expect(n, JSON.stringify(corps)).toBeGreaterThanOrEqual(0);
    }
  });
});
