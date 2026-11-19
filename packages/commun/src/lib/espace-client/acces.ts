import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { adresseFictive, adressePublique, DUREE_LIEN_MIN, estDemo } from "./config";
import { assurerCompte, jetonDeConnexion } from "./comptes";
import { avecDelai, depot, maintenant } from "./depot";
import { conseillerDe, dossiersDuClient, signatureDe, snapshotDe } from "./lectures";
import { notifier } from "./notifier";
import { calculerFrise } from "./progression";
import { empreinte, jetonAleatoire } from "./signature";
import { enMinuscules, periode, salutation } from "./format";
import { suiteValide } from "./suite";
import type { Client, LienAcces, Notification } from "./types";

/*
 * Le lien d'accès, sans mot de passe.
 *
 * En base, le jeton est celui d'un lien magique de Supabase Auth : le serveur
 * le demande par `auth.admin.generateLink` (Supabase n'envoie rien), et
 * l'envoie lui-même par le circuit d'e-mail de l'espace client vers
 * /espace-client/acces?token_hash=…. Supabase le rend inutilisable une fois
 * servi, ou dès qu'un lien plus récent est émis pour le même compte ; le
 * registre ec_liens_acces, qui n'en garde que l'empreinte, le limite en plus
 * à 15 minutes et permet de dire, sans le consommer, s'il a déjà servi.
 *
 * Ouvrir le lien ne le consomme pas : la page d'arrivée demande un clic
 * (« Accéder à mon espace »), et c'est ce clic qui ouvre la session. Sans
 * cela, les messageries qui inspectent les liens d'un e-mail avant qu'on
 * l'ouvre — c'est le cas d'Outlook — brûleraient le lien à la place du
 * client.
 *
 * En démonstration, le jeton est un aléa de 256 bits, et le registre vit en
 * mémoire.
 */

export type RaisonRefus = "inconnu" | "expire" | "utilise";

/**
 * Un client du jeu de démonstration : marqué « demo » ET à une adresse
 * fictive (@example.com). Lui seul peut s'ouvrir sans boîte mail (raccourcis
 * de la page de connexion, boîte de réception de démonstration) : c'est ce
 * double critère qui garantit qu'aucun vrai client n'est concerné.
 */
export const estClientDemo = (c: Pick<Client, "demo" | "email">) => c.demo && adresseFictive(c.email);

/** Le jeton d'un lien : base64url, ou hexadécimal pour Supabase. */
const FORME_JETON = /^[A-Za-z0-9_-]{20,200}$/;

// --- Le registre des liens ------------------------------------------------------------------------

type Coffre = typeof globalThis & { __ecLiens?: LienAcces[] };
const coffre = globalThis as Coffre;
const liensDemo = () => (coffre.__ecLiens ??= []);

async function enregistrerLien(lien: LienAcces) {
  if (estDemo()) {
    const t = maintenant();
    coffre.__ecLiens = liensDemo().filter((l) => l.expire_at > t && !l.utilise_at);
    liensDemo().push(lien);
    return;
  }
  const { error } = await avecDelai(createServiceClient().from("ec_liens_acces").insert(lien));
  if (error) throw new Error(`Émission du lien impossible : ${error.message}`);
}

async function trouverLien(e: string): Promise<LienAcces | null> {
  if (estDemo()) return liensDemo().find((l) => l.empreinte === e) ?? null;
  const { data, error } = await avecDelai(createServiceClient().from("ec_liens_acces").select("*").eq("empreinte", e).maybeSingle());
  if (error) throw new Error(`Lecture du lien impossible : ${error.message}`);
  return (data as LienAcces | null) ?? null;
}

/** Marque le lien utilisé, en une seule requête : un lien ne sert qu'une fois, même cliqué deux fois de suite. */
async function marquerUtilise(e: string): Promise<LienAcces | null> {
  const t = maintenant();
  if (estDemo()) {
    const l = liensDemo().find((x) => x.empreinte === e && !x.utilise_at && x.expire_at > t);
    if (!l) return null;
    l.utilise_at = t;
    return { ...l };
  }
  const { data, error } = await avecDelai(
    createServiceClient().from("ec_liens_acces").update({ utilise_at: t }).eq("empreinte", e).is("utilise_at", null).gt("expire_at", t).select("*"),
  );
  if (error) throw new Error(`Lecture du lien impossible : ${error.message}`);
  return ((data ?? [])[0] as LienAcces | undefined) ?? null;
}

/** Coupe les liens encore valables d'un client : avec « Couper les sessions ». */
export async function annulerLiens(clientId: string) {
  if (estDemo()) {
    coffre.__ecLiens = liensDemo().filter((l) => l.client_id !== clientId);
    return;
  }
  await avecDelai(createServiceClient().from("ec_liens_acces").update({ utilise_at: maintenant() }).eq("client_id", clientId).is("utilise_at", null));
}

// --- Émettre un lien ------------------------------------------------------------------------------------

export async function clientParEmail(email: string): Promise<Client | null> {
  const adresse = email.trim().toLowerCase();
  if (!adresse) return null;
  if (estDemo()) return (await depot().lire()).clients.find((c) => c.email === adresse) ?? null;
  const { data, error } = await avecDelai(createServiceClient().from("ec_clients").select("*").eq("email", adresse).maybeSingle());
  if (error) throw new Error(`Lecture des clients impossible : ${error.message}`);
  return (data as Client | null) ?? null;
}

/** Envoie un lien d'accès au client de cette adresse. Rien, sans bruit, si l'adresse est inconnue. */
export async function envoyerLienAcces(email: string, options: { reference?: string | null; suite?: string | null } = {}): Promise<Notification | null> {
  const client = await clientParEmail(email);
  if (!client) return null;
  return envoyerLienAuClient(client, options);
}

export async function envoyerLienAuClient(client: Client, options: { reference?: string | null; suite?: string | null } = {}): Promise<Notification> {
  // Le jeton : celui de Supabase Auth en base, un aléa en démonstration.
  let jeton: string;
  let compte: string | null = null;
  if (estDemo()) jeton = jetonAleatoire();
  else {
    compte = await assurerCompte(client);
    jeton = await jetonDeConnexion(client.email, compte);
    // Supabase vient d'invalider les liens précédents de ce compte : le registre les clôt aussi. Sans cela, la page
    // d'arrivée accueillait un lien remplacé comme valable (« Accéder à mon espace ») et seul le clic le refusait ;
    // elle répond désormais d'emblée « Ce lien a déjà servi… un lien plus récent remplace le précédent ».
    await annulerLiens(client.id);
  }
  const reference = options.reference ?? null;
  await enregistrerLien({
    empreinte: empreinte(jeton),
    client_id: client.id,
    auth_user_id: compte,
    reference,
    expire_at: new Date(Date.now() + DUREE_LIEN_MIN * 60_000).toISOString(),
    utilise_at: null,
  });

  const d = await depot().lireDuClient(client.id);
  const dossiers = dossiersDuClient(d, client.id);
  const courant = (reference && dossiers.find((x) => x.reference === reference)) || dossiers.find((x) => x.statut !== "termine") || dossiers[0];
  const snap = courant ? snapshotDe(d, courant.id) : null;
  const aFaire = snap
    ? calculerFrise(snap)
        .filter((e) => e.statut === "a_faire")
        .slice(0, 2)
        .map((e) => enMinuscules(e.titre))
    : [];

  const base = await adressePublique();
  return notifier.envoyer(
    {
      dossier_id: courant?.id ?? null,
      canal: "email",
      modele: "acces",
      destinataire: client.email,
      payload: {
        // La page visée avant la connexion (suite.ts), contrôlée encore à l'arrivée.
        lien: `${base}/espace-client/acces?token_hash=${encodeURIComponent(jeton)}${suiteValide(options.suite) ? `&suite=${encodeURIComponent(options.suite!)}` : ""}`,
        salutation: salutation(client),
        email: client.email,
        reference: courant?.reference ?? "",
        depart: courant?.ville_depart ?? "",
        arrivee: courant?.ville_arrivee ?? "",
        trajet: courant ? `${courant.ville_depart} → ${courant.ville_arrivee}` : "",
        periode: courant ? periode(courant.periode_debut, courant.periode_fin) : "",
        photo: courant?.photo ?? "",
        aFaire: aFaire.join(" et "),
        duree: DUREE_LIEN_MIN,
        signature: signatureDe(conseillerDe(d, client.conseiller_id)),
      },
    },
    // Le lien d'un vrai client ouvre son espace : il part dans l'e-mail, mais le
    // journal ne le garde pas. Celui d'un client fictif reste lisible, pour la
    // boîte de réception de démonstration.
    { confidentiel: estClientDemo(client) ? {} : { lien: `${base}/espace-client/connexion` } },
  );
}

// --- Lire et consommer un lien ------------------------------------------------------------------------

const clientDuLien = (l: LienAcces): Promise<Client | null> => depot().trouver("clients", l.client_id);

/** Ce que dit un lien, sans le consommer : pour la page d'arrivée. */
export async function lireLien(jeton: string): Promise<{ ok: true; client: Client } | { ok: false; raison: RaisonRefus }> {
  if (!FORME_JETON.test(jeton)) return { ok: false, raison: "inconnu" };
  const l = await trouverLien(empreinte(jeton));
  if (!l) return { ok: false, raison: "inconnu" };
  if (l.utilise_at) return { ok: false, raison: "utilise" };
  if (l.expire_at < maintenant()) return { ok: false, raison: "expire" };
  const client = await clientDuLien(l);
  return client ? { ok: true, client } : { ok: false, raison: "inconnu" };
}

/** Consomme un lien : une seule fois, avant son expiration. */
export async function consommerLien(
  jeton: string,
): Promise<{ ok: true; client: Client; lien: LienAcces } | { ok: false; raison: RaisonRefus }> {
  if (!FORME_JETON.test(jeton)) return { ok: false, raison: "inconnu" };
  const e = empreinte(jeton);
  const l = await marquerUtilise(e);
  if (!l) {
    const deja = await trouverLien(e);
    return { ok: false, raison: !deja ? "inconnu" : deja.utilise_at ? "utilise" : "expire" };
  }
  const client = await clientDuLien(l);
  // En base, le lien doit viser le compte Auth du client, et lui seul.
  if (!client || (!estDemo() && (!l.auth_user_id || l.auth_user_id !== client.auth_user_id))) return { ok: false, raison: "inconnu" };
  return { ok: true, client, lien: l };
}
