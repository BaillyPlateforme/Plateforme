import "server-only";
import { adressePublique, DUREE_LIEN_MIN } from "./config";
import { lireDonnees, maintenant, modifierDonnees } from "./depot";
import { conseillerDe, dossiersDuClient, signatureDe, snapshotDe } from "./lectures";
import { notifier } from "./notifier";
import { calculerFrise } from "./progression";
import { empreinte, jetonAleatoire } from "./signature";
import { periode, salutation } from "./format";
import type { Client, Notification } from "./types";

/*
 * Le lien d'accès, sans mot de passe.
 *
 * Un jeton aléatoire de 256 bits, valable 15 minutes, utilisable une seule
 * fois. On n'en garde que l'empreinte. Ouvrir le lien ne le consomme pas : la
 * page d'arrivée demande un clic (« Accéder à mon espace »), et c'est ce clic
 * qui ouvre la session. Sans cela, les messageries qui inspectent les liens
 * d'un e-mail avant qu'on l'ouvre — c'est le cas d'Outlook — brûleraient le
 * lien à la place du client.
 */

export type RaisonRefus = "inconnu" | "expire" | "utilise";

/** Envoie un lien d'accès au client de cette adresse. Rien, sans bruit, si l'adresse est inconnue. */
export async function envoyerLienAcces(email: string, options: { reference?: string | null } = {}): Promise<Notification | null> {
  const d = await lireDonnees();
  const client = d.clients.find((c) => c.email.toLowerCase() === email.trim().toLowerCase());
  if (!client) return null;
  return envoyerLienAuClient(client, options);
}

export async function envoyerLienAuClient(client: Client, options: { reference?: string | null } = {}): Promise<Notification> {
  const jeton = jetonAleatoire();
  const expire = new Date(Date.now() + DUREE_LIEN_MIN * 60_000).toISOString();
  const reference = options.reference ?? null;
  await modifierDonnees((m) => {
    const t = maintenant();
    m.jetons_acces = m.jetons_acces.filter((j) => j.expire_at > t && !j.utilise_at);
    m.jetons_acces.push({ empreinte: empreinte(jeton), client_id: client.id, reference, expire_at: expire, utilise_at: null });
  });

  const d = await lireDonnees();
  const dossiers = dossiersDuClient(d, client.id);
  const courant = (reference && dossiers.find((x) => x.reference === reference)) || dossiers.find((x) => x.statut !== "termine") || dossiers[0];
  const snap = courant ? snapshotDe(d, courant.id) : null;
  const aFaire = snap
    ? calculerFrise(snap)
        .filter((e) => e.statut === "a_faire")
        .slice(0, 2)
        .map((e) => e.titre.toLowerCase())
    : [];

  const base = await adressePublique();
  return notifier.envoyer({
    dossier_id: courant?.id ?? null,
    canal: "email",
    modele: "acces",
    destinataire: client.email,
    payload: {
      lien: `${base}/espace-client/acces?jeton=${jeton}`,
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
  });
}

/** Ce que dit un jeton, sans le consommer : pour la page d'arrivée. */
export async function lireJeton(jeton: string): Promise<{ ok: true; client: Client } | { ok: false; raison: RaisonRefus }> {
  if (!jeton) return { ok: false, raison: "inconnu" };
  const d = await lireDonnees();
  const j = d.jetons_acces.find((x) => x.empreinte === empreinte(jeton));
  if (!j) return { ok: false, raison: "inconnu" };
  if (j.utilise_at) return { ok: false, raison: "utilise" };
  if (j.expire_at < maintenant()) return { ok: false, raison: "expire" };
  const client = d.clients.find((c) => c.id === j.client_id);
  return client ? { ok: true, client } : { ok: false, raison: "inconnu" };
}

/** Consomme un jeton : une seule fois, avant son expiration. */
export async function consommerJeton(
  jeton: string,
): Promise<{ ok: true; client: Client; reference: string | null } | { ok: false; raison: RaisonRefus }> {
  if (!jeton) return { ok: false, raison: "inconnu" };
  const e = empreinte(jeton);
  return modifierDonnees((m) => {
    const j = m.jetons_acces.find((x) => x.empreinte === e);
    if (!j) return { ok: false as const, raison: "inconnu" as const };
    if (j.utilise_at) return { ok: false as const, raison: "utilise" as const };
    if (j.expire_at < maintenant()) return { ok: false as const, raison: "expire" as const };
    const client = m.clients.find((c) => c.id === j.client_id);
    if (!client) return { ok: false as const, raison: "inconnu" as const };
    j.utilise_at = maintenant();
    return { ok: true as const, client: { ...client }, reference: j.reference };
  });
}
