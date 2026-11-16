"use server";
import { revalidatePath } from "next/cache";
import { q, q1, transaction, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { anneeParis } from "@/crm/lib/format";
import { projeterEspace } from "@/crm/lib/espace";
import { entrepriseValide } from "@/crm/clients/entreprises";
import { conflit, occupation } from "@/crm/visites/creneaux";
import { estVisite } from "@/crm/visites/cycle";
import { instantParis, momentVisite } from "@/lib/visite/regles";

/*
 * Les actions de la fiche du dossier façon Créagidem (src/crm/fiche). Elles
 * complètent celles d'actions.ts et d'actions2.ts, qui restent branchées
 * telles quelles sur la fiche : celles-ci couvrent ce que la fiche ajoute —
 * l'identité du client, les adresses et le suivi en fenêtres séparées, la
 * duplication d'une visite, d'une lettre de voiture, d'un contact ou d'un
 * service (un devis se duplique dans src/crm/devis/actions.ts), l'ajout et la
 * suppression d'une lettre, les contacts, les services, la modification d'un
 * litige.
 *
 * Comme partout dans le CRM, chacune vérifie d'abord la session, et ne touche
 * qu'aux lignes du dossier qu'elle reçoit.
 */

const s = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const n = (f: FormData, k: string) => {
  const v = s(f, k);
  if (v == null) return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : null;
};
const jour = (f: FormData, k: string) => {
  const v = s(f, k);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

async function noter(dossierId: number, libelle: string) {
  const u = await currentUser();
  await q("insert into activite(dossier_id,utilisateur_id,libelle) values($1,$2,$3)", [dossierId, u.id, libelle]);
  await q("update dossiers set maj_le=now() where id=$1", [dossierId]);
  // Le dossier a changé : son espace client suit (voir lib/espace.ts).
  await projeterEspace(dossierId);
}
const rafraichir = (id: number) => {
  revalidatePath("/(interne)", "layout");
  revalidatePath(`/dossiers/${id}`);
};
async function numero(prefixe: string, table: "devis" | "lettres_voiture") {
  const an = anneeParis();
  const r = await q1<{ n: number }>(`select coalesce(max(substring(numero from '[0-9]+$')::int),0) + 1 as n from ${table} where numero like $1`, [`${prefixe}-${an}-%`]);
  return `${prefixe}-${an}-${String(r!.n).padStart(4, "0")}`;
}
async function clientDu(dossierId: number) {
  return (await q1<{ client_id: number }>("select client_id from dossiers where id=$1", [dossierId]))?.client_id ?? null;
}

/* ---------- la fenêtre « Fiche » : l'identité du client ---------- */

const TYPES_CLIENT = ["particulier", "compte", "militaire", "partenaire", "logement_social"];

/**
 * L'identité du client, reprise du formulaire de l'ancienne fiche. Son
 * e-mail ne change pas ici quand un espace client existe : c'est son
 * identifiant de connexion, qui se modifie depuis la fiche de l'espace.
 */
export async function majIdentite(id: number, f: FormData) {
  await currentUser();
  const nom = s(f, "client_nom");
  if (!nom) return;
  const espace = await q1("select 1 as n from public.ec_dossiers where crm_dossier_id=$1 limit 1", [id]).catch(() => null);
  const valeurs = [id, s(f, "client_civilite"), s(f, "client_prenom"), nom, s(f, "client_societe"), s(f, "client_telephone"), s(f, "client_telephone2")];
  if (espace) {
    await q("update clients set civilite=$2, prenom=$3, nom=$4, societe=$5, telephone=$6, telephone2=$7 where id=(select client_id from dossiers where id=$1)", valeurs);
  } else {
    await q("update clients set civilite=$2, prenom=$3, nom=$4, societe=$5, telephone=$6, telephone2=$7, email=$8 where id=(select client_id from dossiers where id=$1)", [...valeurs, s(f, "client_email")]);
  }
  // Le type de client fixe le parcours de l'espace client (segment, cahier des charges §2).
  const type = s(f, "type_client");
  if (type && TYPES_CLIENT.includes(type)) await q("update clients set type=$2 where id=(select client_id from dossiers where id=$1)", [id, type]);
  // L'entreprise (espace pro) du client : un espace qui existe, ou aucune. Champ absent ou valeur inconnue : rien ne change.
  if (f.has("espace_pro_id")) {
    const entreprise = await entrepriseValide(f.get("espace_pro_id"));
    if (entreprise !== undefined) await q("update clients set espace_pro_id=$2 where id=(select client_id from dossiers where id=$1)", [id, entreprise]);
  }
  await noter(id, "Fiche client mise à jour");
  rafraichir(id);
}

/* ---------- la fenêtre « Suivi » : commercial, observations ---------- */

export async function majSuivi(id: number, f: FormData) {
  await currentUser();
  await q("update dossiers set commercial_id=$2, traite_par_id=$3, observations=$4, passer_en_dernier=$5, vehicule=$6, maj_le=now() where id=$1", [
    id, n(f, "commercial_id"), n(f, "traite_par_id"), s(f, "observations"), f.get("passer_en_dernier") === "on", f.get("vehicule") === "on",
  ]);
  await noter(id, "Suivi du dossier mis à jour");
  rafraichir(id);
}

/* ---------- la fenêtre « Adresses et accès » ---------- */

const OUI_NON_EVALUER = ["oui", "non", "a_evaluer"];
const STATIONNEMENTS = ["facile", "autorisation", "reserve_client"];
const ESCALIERS = ["aucun", "droit", "colimacon", "etroit"];
const POIDS_LOURDS = ["oui", "non", "ne_sait_pas"];
const choix = (v: string | null, permis: string[]) => (v && permis.includes(v) ? v : null);

/**
 * Les adresses et les accès du dossier, étape par étape — tous les champs de
 * la fenêtre de visite (module des visites) —, puis la période. « Ajouter une
 * étape » (ajouter=1) et « Retirer » (retirer=<id>) passent par ici : ce qui
 * vient d'être saisi est enregistré d'abord.
 */
export async function majItineraire(id: number, f: FormData) {
  await currentUser();
  const etapes = await q<{ id: number }>("select id from etapes_trajet where dossier_id=$1", [id]);
  const ajouter = f.get("ajouter") === "1";
  const retirer = n(f, "retirer");
  await transaction(async (db) => {
    await db.query("select 1 from dossiers where id=$1 for update", [id]);
    for (const { id: e } of etapes) {
      // Une étape absente du formulaire (ajoutée ailleurs entre-temps) n'est pas effacée.
      if (!f.has(`adresse_${e}`)) continue;
      const portage = n(f, `portage_${e}`);
      await db.query(
        `update etapes_trajet set adresse=$3, code_postal=$4, ville=$5, pays=$6, telephone=$7, etage=$8, ascenseur=$9, monte_charge=$10, transbordement=$11,
                portage_m=$12, monte_meuble=$13, stationnement=$14, escalier=$15, poids_lourd=$16, acces=$17
          where id=$1 and dossier_id=$2`,
        [
          e, id, s(f, `adresse_${e}`), s(f, `code_postal_${e}`), s(f, `ville_${e}`), s(f, `pays_${e}`), s(f, `telephone_${e}`), s(f, `etage_${e}`),
          f.get(`ascenseur_${e}`) === "on", f.get(`monte_charge_${e}`) === "on", f.get(`transbordement_${e}`) === "on",
          portage != null && portage >= 0 && portage <= 1000 ? Math.round(portage) : null,
          choix(s(f, `monte_meuble_${e}`), OUI_NON_EVALUER), choix(s(f, `stationnement_${e}`), STATIONNEMENTS),
          choix(s(f, `escalier_${e}`), ESCALIERS), choix(s(f, `poids_lourd_${e}`), POIDS_LOURDS), s(f, `acces_${e}`),
        ],
      );
    }
    if (f.has("periode")) {
      await db.query("update dossiers set periode=$2, mois_ca=$3 where id=$1", [id, s(f, "periode"), s(f, "mois_ca") ? `${s(f, "mois_ca")}-01` : null]);
    }
    if (ajouter) {
      // Une destination de plus, avant l'arrivée.
      const [m] = await db.query<{ ordre: number | null }>("select max(ordre) as ordre from etapes_trajet where dossier_id=$1 and genre <> 'arrivee'", [id]);
      const ordre = (m?.ordre ?? 0) + 1;
      await db.query("update etapes_trajet set ordre=ordre+1 where dossier_id=$1 and ordre >= $2", [id, ordre]);
      await db.query("insert into etapes_trajet(dossier_id,ordre,genre) values($1,$2,'autre')", [id, ordre]);
    }
    // Jamais le départ ni l'arrivée.
    if (retirer) await db.query("delete from etapes_trajet where id=$1 and dossier_id=$2 and genre in ('autre','garde_meuble')", [retirer, id]);
  });
  await noter(id, ajouter ? "Étape ajoutée au trajet" : retirer ? "Étape retirée du trajet" : "Adresses et accès mis à jour");
  rafraichir(id);
}

/* ---------- Déménagements · Visites ---------- */

/**
 * « Dupliquer » une visite : le même rendez-vous (type, commercial, durée,
 * titre, lieu, commentaire) à une autre date. La règle des visites tient :
 * pas sur un autre rendez-vous du commercial. Aucun SMS ne part : « Confirmer »
 * l'envoie quand l'équipe le décide.
 */
export async function copierRdv(dossierId: number, rdvId: number, f: FormData) {
  const u = await currentUser();
  const r = await q1<Row>("select * from rendez_vous where id=$1 and dossier_id=$2", [rdvId, dossierId]);
  const date = jour(f, "date");
  const heure = s(f, "heure");
  if (!r || !date || !heure || !/^\d{2}:\d{2}$/.test(heure)) return;
  const debut = instantParis(date, heure);
  if (estVisite(r.type) && !r.journee) {
    const plages = await occupation(r.commercial_id, debut, new Date(debut.getTime() + r.duree_min * 60_000), null);
    const c = conflit(plages, debut, r.duree_min);
    if (c) {
      await noter(dossierId, `Duplication de la visite refusée : le commercial n'est pas libre le ${momentVisite(debut, true)} (${c.libelle})`);
      rafraichir(dossierId);
      return;
    }
  }
  await q("insert into rendez_vous(commercial_id,dossier_id,type,titre,lieu,debut,duree_min,notes,journee) values($1,$2,$3,$4,$5,$6,$7,$8,false)", [
    r.commercial_id, dossierId, r.type, r.titre, r.lieu, debut.toISOString(), r.duree_min, r.notes,
  ]);
  await q("insert into activite(dossier_id,utilisateur_id,libelle) values($1,$2,$3)", [dossierId, u.id, `Visite dupliquée au ${momentVisite(debut, true)}`]);
  await q("update dossiers set maj_le=now() where id=$1", [dossierId]);
  await projeterEspace(dossierId);
  rafraichir(dossierId);
  revalidatePath("/planning");
}

/* ---------- Déménagements · Devis : « Dupliquer » est dupliquerDevis (src/crm/devis/actions.ts) ---------- */

/* ---------- Déménagements · Lettres de voiture ---------- */

/** « Nouveau » : une lettre de voiture de plus (une rupture de charge oubliée). Le montant reste sur la première. */
export async function ajouterLettre(dossierId: number) {
  await currentUser();
  const d = await q1<Row>("select date_chargement, date_livraison from dossiers where id=$1", [dossierId]);
  if (!d) return;
  const stops = await q<Row>("select adresse from etapes_trajet where dossier_id=$1 order by ordre, id", [dossierId]);
  const trajet = stops.length >= 2 ? `${stops[0].adresse ?? "—"} → ${stops[stops.length - 1].adresse ?? "—"}` : "Trajet à préciser";
  const num = await numero("LV", "lettres_voiture");
  await q("insert into lettres_voiture(dossier_id,numero,trajet,date_chargement,date_livraison,montant) values($1,$2,$3,$4,$5,0)", [
    dossierId, num, trajet, d.date_chargement, d.date_livraison,
  ]);
  await noter(dossierId, `Lettre de voiture ${num} ajoutée`);
  rafraichir(dossierId);
}

/** « Dupliquer » : la même lettre (trajet, dates, prestataire, équipe, camion, consignes), sans montant. */
export async function copierLettre(dossierId: number, lettreId: number) {
  await currentUser();
  const l = await q1<Row>("select * from lettres_voiture where id=$1 and dossier_id=$2", [lettreId, dossierId]);
  if (!l) return;
  const num = await numero("LV", "lettres_voiture");
  await q(
    `insert into lettres_voiture(dossier_id,numero,trajet,date_chargement,date_livraison,prestataire,prix_sous_traitance,montant,equipe,immatriculation,instructions)
     values($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10)`,
    [dossierId, num, l.trajet, l.date_chargement, l.date_livraison, l.prestataire, l.prix_sous_traitance, l.equipe, l.immatriculation, l.instructions],
  );
  await noter(dossierId, `Lettre de voiture ${l.numero} dupliquée en ${num}`);
  rafraichir(dossierId);
}

/**
 * « Supprimer » une lettre de voiture. Si elle portait le montant du
 * déménagement, la première des lettres restantes le reprend : le chiffre
 * d'affaires reste compté une fois.
 */
export async function supprimerLettre(dossierId: number, lettreId: number) {
  await currentUser();
  const l = await q1<{ numero: string; montant: number; trajet: string; prestataire: string; statut: string }>(
    "delete from lettres_voiture where id=$1 and dossier_id=$2 returning numero, montant::float8 as montant, trajet, prestataire, statut",
    [lettreId, dossierId],
  );
  if (!l) return;
  if (l.montant > 0) {
    await q("update lettres_voiture set montant=$2 where id=(select id from lettres_voiture where dossier_id=$1 order by id limit 1)", [dossierId, l.montant]);
  }
  const libelle = `Lettre de voiture ${l.numero} supprimée`;
  await noter(dossierId, libelle);
  rafraichir(dossierId);
  await journaliser({ action: "lettre_voiture.supprime", libelle, objet: { type: "lettre_voiture", id: lettreId }, dossierId, details: { numero: l.numero, trajet: l.trajet, prestataire: l.prestataire, statut: l.statut, montant: l.montant }, activite: libelle });
}

const LV_STATUTS = ["a_planifier", "planifiee", "en_cours", "livree"];

/** La fenêtre d'une lettre de voiture : tout se modifie, trajet compris (majLettre ne le touche pas). */
export async function modifierLettre(dossierId: number, lettreId: number, f: FormData) {
  await currentUser();
  await q(
    `update lettres_voiture set trajet=coalesce($3,trajet), date_chargement=$4, date_livraison=$5, prestataire=coalesce($6,prestataire), prix_sous_traitance=$7,
            statut=coalesce($8,statut), equipe=$9, immatriculation=$10, instructions=$11
      where id=$1 and dossier_id=$2`,
    [lettreId, dossierId, s(f, "trajet"), jour(f, "date_chargement"), jour(f, "date_livraison"), s(f, "prestataire"), n(f, "prix_sous_traitance"),
      choix(s(f, "statut"), LV_STATUTS), s(f, "equipe"), s(f, "immatriculation"), s(f, "instructions")],
  );
  await noter(dossierId, "Lettre de voiture mise à jour");
  rafraichir(dossierId);
}

/* ---------- Déménagements · Litiges ---------- */

export async function modifierLitige(dossierId: number, litigeId: number, f: FormData) {
  await currentUser();
  const objet = s(f, "objet");
  if (!objet) return;
  await q("update litiges set objet=$3, montant=$4 where id=$1 and dossier_id=$2", [litigeId, dossierId, objet, n(f, "montant")]);
  await noter(dossierId, "Litige modifié");
  rafraichir(dossierId);
}

/* ---------- Commun · Contacts ---------- */

const champsContact = (f: FormData) => [s(f, "civilite"), s(f, "prenom"), s(f, "nom") ?? "Sans nom", s(f, "fonction"), s(f, "telephone"), s(f, "email"), s(f, "notes")];

export async function ajouterContact(dossierId: number, f: FormData) {
  await currentUser();
  const client = await clientDu(dossierId);
  if (!client || !s(f, "nom")) return;
  await q("insert into contacts(client_id,civilite,prenom,nom,fonction,telephone,email,notes) values($1,$2,$3,$4,$5,$6,$7,$8)", [client, ...champsContact(f)]);
  await noter(dossierId, `Contact ajouté : ${[s(f, "prenom"), s(f, "nom")].filter(Boolean).join(" ")}`);
  rafraichir(dossierId);
}
export async function modifierContact(dossierId: number, contactId: number, f: FormData) {
  await currentUser();
  const client = await clientDu(dossierId);
  if (!client || !s(f, "nom")) return;
  await q("update contacts set civilite=$3, prenom=$4, nom=$5, fonction=$6, telephone=$7, email=$8, notes=$9 where id=$1 and client_id=$2", [contactId, client, ...champsContact(f)]);
  await noter(dossierId, "Contact modifié");
  rafraichir(dossierId);
}
export async function copierContact(dossierId: number, contactId: number) {
  await currentUser();
  const client = await clientDu(dossierId);
  if (!client) return;
  await q(
    "insert into contacts(client_id,civilite,prenom,nom,fonction,telephone,email,notes) select client_id,civilite,prenom,nom,fonction,telephone,email,notes from contacts where id=$1 and client_id=$2",
    [contactId, client],
  );
  await noter(dossierId, "Contact dupliqué");
  rafraichir(dossierId);
}
export async function supprimerContact(dossierId: number, contactId: number) {
  await currentUser();
  const client = await clientDu(dossierId);
  if (!client) return;
  const c = await q1<{ nom: string; fonction: string | null }>("delete from contacts where id=$1 and client_id=$2 returning coalesce(prenom || ' ', '') || nom as nom, fonction", [contactId, client]);
  const libelle = c ? `Contact supprimé : ${c.nom}` : null;
  if (libelle) await noter(dossierId, libelle);
  rafraichir(dossierId);
  if (c) await journaliser({ action: "contact.supprime", libelle: libelle!, objet: { type: "contact", id: contactId }, dossierId, details: { nom: c.nom, fonction: c.fonction }, activite: libelle });
}

/* ---------- Services (modèle provisoire, voir fiche/schema.ts) ---------- */

const STATUTS_SERVICE = ["prevu", "confirme", "realise", "annule"];
const champsService = (f: FormData) => [s(f, "libelle") ?? "Service", jour(f, "date_prevue"), n(f, "montant"), choix(s(f, "statut"), STATUTS_SERVICE) ?? "prevu", s(f, "notes")];

export async function ajouterService(dossierId: number, f: FormData) {
  await currentUser();
  if (!s(f, "libelle")) return;
  await q("insert into services(dossier_id,libelle,date_prevue,montant,statut,notes) values($1,$2,$3,$4,$5,$6)", [dossierId, ...champsService(f)]);
  await noter(dossierId, `Service ajouté : ${s(f, "libelle")}`);
  rafraichir(dossierId);
}
export async function modifierService(dossierId: number, serviceId: number, f: FormData) {
  await currentUser();
  if (!s(f, "libelle")) return;
  await q("update services set libelle=$3, date_prevue=$4, montant=$5, statut=$6, notes=$7 where id=$1 and dossier_id=$2", [serviceId, dossierId, ...champsService(f)]);
  await noter(dossierId, "Service modifié");
  rafraichir(dossierId);
}
export async function copierService(dossierId: number, serviceId: number) {
  await currentUser();
  await q(
    "insert into services(dossier_id,libelle,date_prevue,montant,statut,notes) select dossier_id,libelle,date_prevue,montant,'prevu',notes from services where id=$1 and dossier_id=$2",
    [serviceId, dossierId],
  );
  await noter(dossierId, "Service dupliqué");
  rafraichir(dossierId);
}
export async function supprimerService(dossierId: number, serviceId: number) {
  await currentUser();
  const r = await q1<{ libelle: string; statut: string; montant: number | null }>("delete from services where id=$1 and dossier_id=$2 returning libelle, statut, montant::float8 as montant", [serviceId, dossierId]);
  const libelle = r ? `Service supprimé : ${r.libelle}` : null;
  if (libelle) await noter(dossierId, libelle);
  rafraichir(dossierId);
  if (r) await journaliser({ action: "service.supprime", libelle: libelle!, objet: { type: "service", id: serviceId }, dossierId, details: { libelle: r.libelle, statut: r.statut, montant: r.montant }, activite: libelle });
}
export async function statutService(dossierId: number, serviceId: number, statut: string) {
  await currentUser();
  if (!STATUTS_SERVICE.includes(statut)) return;
  await q("update services set statut=$3 where id=$1 and dossier_id=$2", [serviceId, dossierId, statut]);
  await noter(dossierId, `Service : ${statut === "confirme" ? "confirmé" : statut === "realise" ? "réalisé" : statut === "annule" ? "annulé" : "prévu"}`);
  rafraichir(dossierId);
}
