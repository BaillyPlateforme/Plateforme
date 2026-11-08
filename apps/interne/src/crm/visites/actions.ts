"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, q1, transaction } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { projeterEspace } from "@/crm/lib/espace";
import { espacesDesDossiersCrm } from "@/lib/espace-client/crm";
import { notifierCreneauxProposes } from "@/lib/espace-client/visite";
import { duree, instantParis, m3, momentVisite, PLAFONDS } from "@/lib/visite/regles";
import { conflit, occupation } from "./creneaux";
import { chargerSaisie, ouvrirVisite } from "./donnees";
import { contenuDe, empreinteDe, genererDocument } from "./compte-rendu";
import { retirerFichiers } from "@/terrain/lib/photos";

/*
 * Les actions de la visite technique. Comme toutes celles du CRM, chacune
 * commence par vérifier la session et l'appartenance à l'équipe
 * (currentUser) : une action serveur répond depuis n'importe quelle adresse
 * de l'app.
 *
 * Proposer des créneaux tient la place dans le planning du commercial ;
 * réserver (le commercial pour le client, ou le client depuis son espace)
 * passe par la fonction de la base ec_poser_visite_crm, sous le même verrou
 * que la proposition : deux réservations ne prennent jamais la même heure.
 */

const s = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const n = (f: FormData, k: string) => {
  const v = s(f, k);
  return v == null ? null : Number(v);
};

/** Rafraîchit le CRM, la fiche du dossier et la tablette. */
function rafraichir(dossierId?: number) {
  revalidatePath("/(interne)", "layout");
  revalidatePath("/(tablette)", "layout");
  if (dossierId) revalidatePath(`/dossiers/${dossierId}`);
}

function versFiche(id: number, etat: string, message?: string): never {
  redirect(`/dossiers/${id}?visite=${etat}${message ? `&vm=${encodeURIComponent(message)}` : ""}#visite`);
}

const MIN_CRENEAUX = 2;
const MAX_CRENEAUX = 5;

const ISSUES: Record<string, string> = {
  pris: "Ce créneau n'est plus libre dans le planning du commercial : choisissez-en un autre.",
  passe: "Ce créneau est déjà passé.",
  ferme: "Cette proposition est close.",
  inconnu: "Réservation impossible : dossier ou commercial introuvable.",
};

/**
 * Le formulaire « Visite technique » de la fiche : proposer 2 à 5 créneaux
 * au client (`intent=proposer`, il faut un espace client), ou réserver
 * directement l'un d'eux pour lui (`intent=reserver`).
 */
export async function proposerOuReserver(dossierId: number, f: FormData) {
  const u = await currentUser();
  const intent = s(f, "intent") === "reserver" ? "reserver" : "proposer";
  const commercial = n(f, "commercial_id");
  const type = s(f, "type") === "visio" ? "visio" : "phys";
  const dureeMin = Math.round(n(f, "duree_min") ?? 60);
  if (!commercial || !(await q1("select 1 from utilisateurs where id = $1", [commercial]))) versFiche(dossierId, "erreur", "Choisissez le commercial qui fera la visite.");
  if (!(dureeMin >= 30 && dureeMin <= 240)) versFiche(dossierId, "erreur", "Durée de visite inattendue.");

  // Les créneaux cochés, et celui saisi à la main.
  const debuts = new Set<string>();
  for (const v of f.getAll("creneau")) {
    const d = new Date(String(v));
    if (!Number.isNaN(d.getTime())) debuts.add(d.toISOString());
  }
  const autreJour = s(f, "autre_jour");
  const autreHeure = s(f, "autre_heure");
  if (autreJour && autreHeure) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(autreJour) || !/^\d{2}:\d{2}$/.test(autreHeure)) versFiche(dossierId, "erreur", "Date ou heure illisible.");
    debuts.add(instantParis(autreJour, autreHeure).toISOString());
  }
  const liste = [...debuts].sort();
  if (liste.some((d) => new Date(d).getTime() <= Date.now())) versFiche(dossierId, "erreur", "Un créneau choisi est déjà passé.");

  if (intent === "reserver") {
    if (liste.length !== 1) versFiche(dossierId, "erreur", "Pour réserver directement, cochez un seul créneau.");
    const r = await q1<{ r: { issue: string } }>("select public.ec_poser_visite_crm($1, $2, $3, $4, $5, null, 'crm', $6) as r", [
      dossierId, commercial, type, liste[0], dureeMin, u.id,
    ]);
    const issue = r?.r.issue ?? "inconnu";
    if (issue !== "reserve") versFiche(dossierId, "erreur", ISSUES[issue] ?? ISSUES.inconnu);
    await projeterEspace(dossierId);
    rafraichir(dossierId);
    versFiche(dossierId, "reserve");
  }

  // Proposer : il faut un espace client, où le client choisira.
  const espace = (await espacesDesDossiersCrm([dossierId])).get(dossierId);
  if (!espace) versFiche(dossierId, "erreur", "Ce dossier n'a pas d'espace client : réservez directement un créneau pour le client.");
  if (liste.length < MIN_CRENEAUX || liste.length > MAX_CRENEAUX) versFiche(dossierId, "erreur", `Proposez de ${MIN_CRENEAUX} à ${MAX_CRENEAUX} créneaux.`);

  const issue = await transaction(async (db) => {
    const [dos] = await db.query<{ id: number }>("select id from dossiers where id = $1 for update", [dossierId]);
    if (!dos) return { erreur: "Dossier introuvable." };
    // Le même verrou que la réservation : le planning du commercial ne bouge pas pendant qu'on propose.
    await db.query("select pg_advisory_xact_lock(hashtext('bailly.crm.planning'), $1)", [commercial]);
    const premier = new Date(liste[0]);
    const dernier = new Date(new Date(liste[liste.length - 1]).getTime() + dureeMin * 60_000);
    const plages = await occupation(commercial!, premier, dernier, dossierId, db);
    for (const d of liste) {
      const c = conflit(plages, new Date(d), dureeMin);
      if (c) return { erreur: `Le ${momentVisite(d)}, le commercial n'est pas libre (${c.libelle}).` };
    }
    // Chevauchement entre deux créneaux de la même proposition.
    for (let i = 1; i < liste.length; i++) {
      if (new Date(liste[i]).getTime() < new Date(liste[i - 1]).getTime() + dureeMin * 60_000) return { erreur: "Deux créneaux proposés se chevauchent." };
    }
    // L'ancienne proposition, s'il y en a une, est remplacée : ses créneaux se libèrent.
    await db.query(
      `update creneaux_visite c set statut = 'libere' from propositions_visite p
        where p.id = c.proposition_id and p.dossier_id = $1 and p.statut = 'ouverte' and c.statut = 'propose'`,
      [dossierId],
    );
    await db.query("update propositions_visite set statut = 'retiree', close_le = now() where dossier_id = $1 and statut = 'ouverte'", [dossierId]);
    const [p] = await db.query<{ id: number }>(
      "insert into propositions_visite (dossier_id, commercial_id, type, duree_min, propose_par) values ($1, $2, $3, $4, $5) returning id",
      [dossierId, commercial, type, dureeMin, u.id],
    );
    for (const d of liste) await db.query("insert into creneaux_visite (proposition_id, debut) values ($1, $2)", [p.id, d]);
    await db.query("update dossiers set statut = 'visite' where id = $1 and statut = 'prospect'", [dossierId]);
    await db.query("update dossiers set maj_le = now() where id = $1", [dossierId]);
    await db.query("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [
      dossierId, u.id, `${liste.length} créneaux de visite proposés au client (${type === "visio" ? "visio" : "sur place"}, ${duree(dureeMin)})`,
    ]);
    return { erreur: null };
  });
  if (issue.erreur) versFiche(dossierId, "erreur", issue.erreur);

  await projeterEspace(dossierId);
  const statut = await notifierCreneauxProposes(dossierId, liste.map((d) => `${momentVisite(d)} (${duree(dureeMin)})`));
  rafraichir(dossierId);
  versFiche(dossierId, "propose", statut === "envoyee" ? "Le client a reçu un e-mail." : statut === "journalisee" ? "E-mail au client journalisé (envoi réel désactivé)." : undefined);
}

/** Retire la proposition ouverte : ses créneaux se libèrent dans le planning. */
export async function retirerProposition(dossierId: number) {
  const u = await currentUser();
  const r = await transaction(async (db) => {
    await db.query(
      `update creneaux_visite c set statut = 'libere' from propositions_visite p
        where p.id = c.proposition_id and p.dossier_id = $1 and p.statut = 'ouverte' and c.statut = 'propose'`,
      [dossierId],
    );
    const lignes = await db.query("update propositions_visite set statut = 'retiree', close_le = now() where dossier_id = $1 and statut = 'ouverte' returning id", [dossierId]);
    if (lignes.length) await db.query("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, 'Proposition de créneaux de visite retirée')", [dossierId, u.id]);
    return lignes.length;
  });
  if (r) await projeterEspace(dossierId);
  rafraichir(dossierId);
  if (r) {
    const libelle = "Proposition de créneaux de visite retirée";
    await journaliser({ action: "proposition_visite.retire", libelle, objet: { type: "proposition_visite" }, dossierId, details: { propositions: r }, activite: libelle });
  }
  versFiche(dossierId, "retire");
}

/** Ouvre la visite sur la tablette (depuis un rendez-vous, ou sans), et y emmène. */
export async function commencerVisite(dossierId: number, rendezVousId: number | null) {
  const u = await currentUser();
  const { id, nouvelle } = await ouvrirVisite(dossierId, rendezVousId, u.id);
  if (nouvelle) await projeterEspace(dossierId);
  rafraichir(dossierId);
  redirect(`/tablette/${id}`);
}

export type IssueSignature = { ok: true } | { ok: false; erreur: string; relire?: boolean };

/**
 * La signature du compte-rendu, sur la tablette, par le client. Le serveur
 * refige le contenu sous verrou, en recalcule l'empreinte et la compare à
 * celle que le client a eue sous les yeux : si la saisie a bougé entre-temps
 * (une autre tablette, une opération en retard), rien n'est signé et le
 * récapitulatif se recharge. L'heure qui fait foi est celle du serveur.
 */
export async function signerCompteRendu(visiteId: number, entree: { signataire: string; signature: string; empreinte: string }): Promise<IssueSignature> {
  const u = await currentUser();
  const signataire = String(entree?.signataire ?? "").replace(/\s+/g, " ").trim();
  const image = String(entree?.signature ?? "");
  if (signataire.length < 2 || signataire.length > PLAFONDS.signataire) return { ok: false, erreur: "Indiquez le nom et le prénom de la personne qui signe." };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(image);
  const octets = m ? Buffer.from(m[1], "base64") : null;
  if (!octets || octets.length < 200 || octets.length > 400_000 || octets.subarray(1, 4).toString("ascii") !== "PNG") {
    return { ok: false, erreur: "La signature est illisible : signez de nouveau dans le cadre." };
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
  const agent = (h.get("user-agent") ?? "inconnu").slice(0, 400);

  const r = await transaction(async (db) => {
    const [v] = await db.query<{ dossier_id: number; statut: string; rendez_vous_id: number | null }>(
      "select dossier_id, statut, rendez_vous_id from visites where id = $1 for update",
      [visiteId],
    );
    if (!v) return { ok: false as const, erreur: "Visite introuvable." };
    if (v.statut === "signee") return { ok: false as const, erreur: "Ce compte-rendu est déjà signé." };
    const saisie = await chargerSaisie(visiteId);
    if (!saisie) return { ok: false as const, erreur: "Visite introuvable." };
    const contenu = contenuDe(saisie);
    const empreinte = empreinteDe(contenu);
    if (empreinte !== entree.empreinte) {
      return { ok: false as const, relire: true, erreur: "Le compte-rendu a changé depuis son affichage : relisez-le avant de signer." };
    }
    if (contenu.pieces.length === 0) return { ok: false as const, erreur: "Le compte-rendu est vide : relevez au moins une pièce." };
    await db.query(
      `update visites set statut = 'signee', contenu = $2, empreinte = $3, signataire = $4, signature = $5, signe_le = now(),
              signe_ip = $6, signe_agent = $7, maj_le = now() where id = $1`,
      [visiteId, JSON.stringify(contenu), empreinte, signataire, image, ip, agent],
    );
    if (v.rendez_vous_id) await db.query("update rendez_vous set termine = true where id = $1", [v.rendez_vous_id]);
    await db.query("update dossiers set statut = 'visite' where id = $1 and statut = 'prospect'", [v.dossier_id]);
    await db.query("update dossiers set maj_le = now() where id = $1", [v.dossier_id]);
    await db.query("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [
      v.dossier_id, u.id, `Compte-rendu de visite signé par ${signataire} · ${m3(contenu.volume)} · empreinte ${empreinte.slice(0, 12)}`,
    ]);
    return { ok: true as const, dossierId: v.dossier_id };
  });
  if (!r.ok) return r;

  // Le PDF, puis la projection : il rejoint les documents du client. Un échec ici
  // ne défait pas la signature ; la fiche du dossier propose de le reproduire.
  try {
    await genererDocument(visiteId);
  } catch (e) {
    console.error(`BaillyCRM : compte-rendu de la visite ${visiteId} non produit`, e instanceof Error ? e.message : e);
  }
  await projeterEspace(r.dossierId);
  rafraichir(r.dossierId);
  return { ok: true };
}

/** Produit de nouveau le PDF d'un compte-rendu signé dont le dépôt avait échoué. */
export async function regenererDocument(visiteId: number) {
  await currentUser();
  const v = await q1<{ dossier_id: number }>("select dossier_id from visites where id = $1", [visiteId]);
  if (!v) return;
  try {
    await genererDocument(visiteId);
  } catch (e) {
    versFiche(v.dossier_id, "erreur", e instanceof Error ? e.message : "Le compte-rendu n'a pas pu être produit.");
  }
  await projeterEspace(v.dossier_id);
  rafraichir(v.dossier_id);
  versFiche(v.dossier_id, "document");
}

/** Abandonne une visite en cours (saisie commencée par erreur) : l'inventaire du dossier reste tel quel. */
export async function abandonnerVisite(visiteId: number) {
  const u = await currentUser();
  const photos = await q<{ chemin: string; chemin_vignette: string | null }>(
    "select p.chemin, p.chemin_vignette from visite_photos p join visites v on v.id = p.visite_id where v.id = $1 and v.statut = 'en_cours'",
    [visiteId],
  );
  const v = await q1<{ dossier_id: number; commencee_le: Date | null }>("delete from visites where id = $1 and statut = 'en_cours' returning dossier_id, commencee_le", [visiteId]);
  if (!v) return;
  await retirerFichiers(photos.flatMap((p) => [p.chemin, p.chemin_vignette])).catch(() => undefined);
  await q("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, 'Visite technique abandonnée (saisie conservée dans l''inventaire)')", [v.dossier_id, u.id]);
  await projeterEspace(v.dossier_id);
  rafraichir(v.dossier_id);
  const libelle = "Visite technique abandonnée (saisie conservée dans l'inventaire)";
  await journaliser({
    action: "visite.supprime", libelle, objet: { type: "visite", id: visiteId }, dossierId: v.dossier_id,
    details: { commencee_le: v.commencee_le ? new Date(v.commencee_le).toISOString() : null, photos: photos.length }, activite: libelle,
  });
  versFiche(v.dossier_id, "abandon");
}
