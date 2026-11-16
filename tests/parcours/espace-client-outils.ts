/*
 * Les outils communs aux parcours de l'espace client (espace-client-*.spec.ts).
 *
 * Un client de test naît comme un vrai : son dossier est posé dans le CRM
 * (le client, le trajet, la période, le volume, le commercial — en base, car
 * la saisie complète d'un dossier du CRM n'est pas l'objet de ces parcours),
 * puis c'est l'ÉCRAN de l'équipe qui ouvre son espace : « Ouvrir l'espace »
 * dans Espace client › Ouvrir un espace, ou le bouton de la fiche du dossier
 * pour un déménagement maritime (le pays s'y choisit). Le serveur crée alors
 * le client de l'espace, son compte de connexion, et émet un premier lien.
 *
 * Son adresse vient de emailUnique("client") (batterie.…@example.com) : la
 * base le marque d'office `demo = true` (adresse fictive, voir
 * ec_ouvrir_espace_crm), et c'est ce marquage qui rend son lien d'accès
 * lisible dans le journal de l'espace (ec_notifications) — acces.ts ne garde
 * le lien que pour un client fictif. Le nettoyage final de la batterie efface
 * tout ce qui porte ce préfixe (crm.clients et ec_clients, en cascade).
 *
 * La référence de ses dossiers est en BD-7777-… : la contrainte de la base
 * exige « BD-AAAA-NNNN », et une année fictive ne dérange pas la numérotation
 * du CRM (qui suit l'année en cours).
 */
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { EXT, INT, contexteEn, emailUnique, ipNeuve, pageEnErreur } from "../outils/banc";
import { baseRecette } from "../outils/comptes.mjs";

type Db = Awaited<ReturnType<typeof baseRecette>>;

/**
 * Le délai des gestes qui passent par le serveur et la base (ouverture d'un espace, émission d'un lien) :
 * plusieurs passages tournent en même temps sur ce poste, et la base de recette répond alors lentement.
 */
export const LENT = 90_000;

/** Une connexion à la base de recette, fermée après usage. */
export async function avecBase<T>(f: (db: Db) => Promise<T>): Promise<T> {
  const db = await baseRecette();
  try {
    return await f(db);
  } finally {
    await db.end();
  }
}

export const lignes = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T[]> => avecBase(async (db) => (await db.query(sql, p)).rows as T[]);
export const ligne = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T | null> => (await lignes<T>(sql, p))[0] ?? null;

export interface ClientTest {
  email: string;
  prenom: string;
  nom: string;
  crmClientId: number;
  crmDossierId: number;
  reference: string;
  ecClientId: string;
  ecDossierId: string;
  villeArrivee: string;
}

let compteurRef = 0;
/** BD-7777-<horloge><processus><compteur> : unique d'un worker à l'autre. */
function referenceUnique() {
  compteurRef += 1;
  return `BD-7777-${String(Date.now()).slice(-8)}${String(process.pid % 100).padStart(2, "0")}${compteurRef}`;
}

/** Le commercial du dossier, présenté au client comme son conseiller : un commercial existant du CRM. */
async function unCommercial(db: Db): Promise<number> {
  const r = await db.query("select id from crm.utilisateurs where role = 'commercial' order by id limit 1");
  if (!r.rows[0]) throw new Error("Aucun commercial dans le CRM de recette.");
  return r.rows[0].id;
}

/**
 * Le dossier du CRM d'un client de test, prêt à ouvrir son espace (tous les
 * préalables remplis). `maritime` : un déménagement maritime vers le Canada,
 * dont l'espace montre le conteneur et les pièces du pays.
 */
async function poserDossierCrm(o: { email: string; prenom: string; nom: string; maritime?: boolean; avecDevis?: boolean }) {
  return avecBase(async (db) => {
    const commercial = await unCommercial(db);
    const reference = referenceUnique();
    const client = (
      await db.query(
        "insert into crm.clients(type, civilite, prenom, nom, email, telephone, notes) values ('particulier', 'Madame', $1, $2, $3, '06 00 00 00 00', 'Client de la batterie de tests') returning id",
        [o.prenom, o.nom, o.email],
      )
    ).rows[0].id as number;
    const dossier = (
      await db.query(
        `insert into crm.dossiers(ref, client_id, commercial_id, statut, mois_ca, volume, type_demenagement, observations)
         values ($1, $2, $3, 'devis', date_trunc('month', now() + interval '2 months')::date, 24, $4, 'Dossier de la batterie de tests') returning id`,
        [reference, client, commercial, o.maritime ? "maritime" : "national"],
      )
    ).rows[0].id as number;
    const arrivee = o.maritime ? { adresse: "1200 rue Sherbrooke Ouest, Montréal, Canada", cp: "H3A 1H6", ville: "Montréal", pays: "Canada" } : { adresse: "5 place Bellecour, 69002 Lyon", cp: "69002", ville: "Lyon", pays: "France" };
    await db.query(
      `insert into crm.etapes_trajet(dossier_id, ordre, genre, adresse, code_postal, ville, pays, etage, ascenseur)
       values ($1, 1, 'depart', '12 rue de Rivoli, 75004 Paris', '75004', 'Paris', 'France', '2', true),
              ($1, 2, 'arrivee', $2, $3, $4, $5, 'RDC', false)`,
      [dossier, arrivee.adresse, arrivee.cp, arrivee.ville, arrivee.pays],
    );
    if (o.avecDevis) {
      // Un devis envoyé, recopié d'un devis du jeu de démonstration (lu, jamais modifié) : la page « Devis » a de quoi s'afficher.
      const modele = await db.query("select id from crm.devis where statut = 'envoye' and jsonb_array_length(coalesce(lignes, '[]'::jsonb)) > 0 order by id limit 1");
      if (modele.rows[0]) {
        await db.query(
          `insert into crm.devis(dossier_id, numero, formule, lignes, montant, statut, envoye_le, validite, prestations, titre, conditions, montant_ht, montant_tva, arrhes_pct, date_devis, commercial_id)
           select $1, $2, formule, lignes, montant, 'envoye', now(), current_date + 30, prestations, titre, conditions, montant_ht, montant_tva, arrhes_pct, current_date, $3
             from crm.devis where id = $4`,
          [dossier, `DV-${reference.slice(3)}`, commercial, modele.rows[0].id],
        );
      }
    }
    return { crmClientId: client, crmDossierId: dossier, reference, villeArrivee: arrivee.ville };
  });
}

let compteurClient = 0;

/**
 * Un client de test et son espace, ouvert par l'écran de l'équipe. Rend le
 * client, une fois son espace lisible en base.
 */
export async function creerClientEspace(browser: Browser, options: { maritime?: boolean; avecDevis?: boolean } = {}): Promise<ClientTest> {
  compteurClient += 1;
  const email = emailUnique("client");
  const prenom = "Batterie";
  const nom = `Testeuse${String.fromCharCode(65 + (compteurClient % 26))}`;
  const crm = await poserDossierCrm({ email, prenom, nom, ...options });

  const ctx = await contexteEn(browser, "equipe");
  const page = await ctx.newPage();
  try {
    if (options.maritime) {
      // La fiche du dossier du CRM : le pays de destination s'y choisit (proposé d'après l'adresse d'arrivée).
      await page.goto(`${INT}/dossiers/${crm.crmDossierId}#espace-client`);
      const carte = page.locator("#espace-client");
      await expect(carte.getByLabel("Pays de destination")).toHaveValue("CA");
      await carte.getByRole("button", { name: /Ouvrir l'espace client/ }).click();
    } else {
      // Espace client › Ouvrir un espace : la ligne du dossier, bouton « Ouvrir l'espace ».
      await page.goto(`${INT}/dashboard/espace-client/nouveau?q=${encodeURIComponent(email)}`);
      const rangee = page.getByRole("row").filter({ hasText: email });
      await expect(rangee).toHaveCount(1);
      await expect(rangee.getByText("Prêt")).toBeVisible();
      await rangee.getByRole("button", { name: "Ouvrir l'espace" }).click();
    }
    await page.waitForURL(new RegExp(`/dossiers/${crm.crmDossierId}\\?espace=ouvert`), { timeout: LENT });
  } finally {
    await ctx.close();
  }

  let ec: { client_id: string; id: string; demo: boolean } | null = null;
  await expect
    .poll(
      async () => {
        ec = await ligne("select d.client_id, d.id, c.demo from public.ec_dossiers d join public.ec_clients c on c.id = d.client_id where d.crm_dossier_id = $1", [crm.crmDossierId]);
        return !!ec;
      },
      { timeout: LENT, message: "l'espace du client de test, en base" },
    )
    .toBe(true);
  const e = ec as unknown as { client_id: string; id: string; demo: boolean };
  // Une adresse @example.com : la base l'a marqué fictif d'office (c'est ce qui rend son lien lisible au journal).
  expect(e.demo, "le client de test doit être marqué fictif").toBe(true);
  return { email, prenom, nom, ...crm, ecClientId: e.client_id, ecDossierId: e.id };
}

/** Les identifiants des liens d'accès déjà journalisés pour cette adresse. */
export async function liensJournalises(email: string): Promise<string[]> {
  return (await lignes<{ id: string }>("select id from public.ec_notifications where modele = 'acces' and destinataire = $1", [email])).map((r) => r.id);
}

/**
 * Le lien d'accès journalisé APRÈS `avant` (identifiants déjà vus) : lisible
 * parce que le client de test est fictif (acces.ts, estClientDemo).
 */
export async function nouveauLien(email: string, avant: string[]): Promise<string> {
  let lien: string | null = null;
  await expect
    .poll(
      async () => {
        const r = await ligne<{ lien: string | null }>(
          "select payload->>'lien' as lien from public.ec_notifications where modele = 'acces' and destinataire = $1 and not (id::text = any($2)) order by sent_at desc limit 1",
          [email, avant],
        );
        lien = r?.lien ?? null;
        return lien;
      },
      { timeout: LENT, message: `lien d'accès journalisé pour ${email}` },
    )
    .toMatch(/\/espace-client\/acces\?token_hash=/);
  return lien!;
}

/** Un contexte de navigateur « client » : sa propre adresse IP (X-Real-IP), donc ses propres compteurs de limites. */
export async function contexteClient(browser: Browser, extra: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: { "x-real-ip": ipNeuve() }, ...extra });
}

/** Demande un lien par l'écran de connexion ; rend le lien journalisé. */
export async function demanderLienParEcran(page: Page, email: string): Promise<string> {
  const avant = await liensJournalises(email);
  await page.goto(`${EXT}/espace-client/connexion`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
  await expect(page.getByRole("heading", { name: "C'est envoyé." })).toBeVisible({ timeout: LENT });
  return nouveauLien(email, avant);
}

/** Ouvre un lien d'accès et clique « Accéder à mon espace » : la session du client s'ouvre. */
export async function entrerParLien(page: Page, lien: string, reference: string) {
  await page.goto(lien);
  await page.getByRole("button", { name: /Accéder à mon espace/ }).click();
  await page.waitForURL(new RegExp(`/espace-client/${reference}(\\?|$)`), { timeout: LENT });
  await expect(page.getByText(`Dossier : ${reference}`, { exact: true })).toBeVisible();
}

/** Un client connecté de bout en bout (écran de connexion, lien, « Accéder ») ; rend son contexte. */
export async function connecterClient(browser: Browser, c: ClientTest): Promise<BrowserContext> {
  const ctx = await contexteClient(browser);
  const page = await ctx.newPage();
  const lien = await demanderLienParEcran(page, c.email);
  await entrerParLien(page, lien, c.reference);
  await page.close();
  return ctx;
}

/*
 * Les pages d'erreur. `pageEnErreur` (outils/banc.ts) cherche aussi le motif
 * /\b500\b.*erreur/ dans TOUT le texte de la page : un faux positif sur une
 * page saine qui parle de « 1 500 € » puis, plus bas, des « erreurs à
 * éviter » (le tutoriel de la déclaration de valeurs). Son verdict est donc
 * revu ici : on ne retient une erreur que si un motif sans ambiguïté la
 * confirme — les mêmes motifs, avec un « 500 » collé à l'erreur.
 */
const MOTIFS_SURS = [
  /Application error/i,
  /Internal Server Error/i,
  /This page could not be found/i,
  /Une erreur est survenue/i,
  /Unhandled Runtime Error/i,
  /Something went wrong/i,
  /\b500\b\s*[|:·–-]?\s*(?:Internal|erreur)/i,
];

/** `pageEnErreur` du banc, débarrassé du faux positif « 500 … erreur » (voir plus haut). */
export async function pageEnErreurSure(page: Page): Promise<string | null> {
  const verdict = await pageEnErreur(page);
  if (!verdict) return null;
  const texte = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  return MOTIFS_SURS.some((m) => m.test(texte)) ? verdict : null;
}

/**
 * Ce qu'une page de l'espace client ne doit jamais montrer quand elle doit
 * marcher : la frontière d'erreur de l'espace (« Votre espace ne répond
 * pas ») ou sa page introuvable, en plus des pages d'erreur de Next.
 */
export async function pageEspaceEnErreur(page: Page): Promise<string | null> {
  const generale = await pageEnErreurSure(page);
  if (generale) return generale;
  const texte = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const m = [/Votre espace ne répond pas/, /Cette page n.existe pas/, /Momentanément indisponible/].find((x) => x.test(texte));
  return m ? texte.slice(0, 200) : null;
}

/** Les pièces déposées dans le seau pour les dossiers d'un client de test (pour les retirer après coup). */
export async function cheminsDeposes(ecDossierIds: string[]): Promise<string[]> {
  if (!ecDossierIds.length) return [];
  const r = await lignes<{ chemin: string }>(
    `select chemin from public.ec_documents where dossier_id = any($1::uuid[]) and source = 'client'
     union select piece_chemin from public.ec_messages where dossier_id = any($1::uuid[]) and piece_chemin is not null`,
    [ecDossierIds],
  );
  return r.map((x) => x.chemin).filter(Boolean);
}
