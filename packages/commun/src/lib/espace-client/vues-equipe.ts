import "server-only";
import { CAPACITE_SAMEDI } from "./cartons";
import { etatEnvois } from "@/lib/envois";
import { envoisDesNotifications } from "@/lib/envois/journal";
import { demoEquipeActive, estDemo, modeDonnees } from "./config";
import { cleCatalogue, textesEspace } from "./catalogue-textes";
import { createServiceClient } from "@/lib/supabase/server";
import { avecDelai, lireDonnees, tableManquante } from "./depot";
import { devisDeLaDemande, lireDemande, listerDemandes } from "./demandes";
import { rendreEmail, texteSms } from "./emails";
import { lienArchive, lienFichier } from "./fichiers";
import { aujourdhui, heure, joursRestants, nomClient, PAYS } from "./format";
import { conseillerDe, snapshotDe } from "./lectures";
import { modelesDe } from "./modeles";
import { PHOTOS } from "./photos";
import { LISTE_CONDITIONS } from "./pieces";
import { fichiersDuDossier, GROUPES_FICHIERS } from "./pieces-jointes";
import { avancement, calculerFrise, estInternationalSuivi, piecesManquantes, prochaineEtape, suiviEquipe } from "./progression";
import { LISTE_SEGMENTS, segmentDe } from "./segments";
import { distanceKm, PARAMS_TOURNEE } from "./tournee";
import { lireTutosVus } from "./tutos-vus";
import type { Donnees } from "./types";

/*
 * Ce que lisent les écrans du back-office. Les mêmes fonctions servent la
 * route protégée de l'espace équipe (/api/data/espace-client) et la route du
 * back-office de démonstration : un seul calcul, deux portes.
 */

/** Combien de jours avant le déménagement une étape bloquante non faite devient une alerte. */
const SEUIL_ALERTE_JOURS = 21;

/**
 * Où vivent les données, et ce que deviennent les messages : l'état réel du
 * module d'envoi (désactivé, recette avec liste blanche, actif). En
 * démonstration en mémoire, rien ne part jamais.
 */
function mode() {
  const e = etatEnvois();
  const demo = estDemo();
  return {
    donnees: modeDonnees(),
    envoi: !demo && e.mode !== "desactive",
    envois: demo ? { ...e, libelle: "Démonstration", detail: "Démonstration en mémoire : aucun message ne part, quel que soit le réglage." } : e,
    demoEquipe: demoEquipeActive(),
  };
}

export function vueApercu(d: Donnees) {
  // Un client, un espace : les dossiers de chaque espace, pour dire sur chaque ligne qu'il en réunit plusieurs.
  const parClient = new Map<string, { id: string; reference: string }[]>();
  for (const x of [...d.dossiers].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
    parClient.set(x.client_id, [...(parClient.get(x.client_id) ?? []), { id: x.id, reference: x.reference }]);
  }
  const lignes = d.dossiers
    .map((dossier) => {
      const s = snapshotDe(d, dossier.id);
      if (!s) return null;
      const frise = calculerFrise(s);
      const suivi = suiviEquipe(s, frise);
      const suivante = prochaineEtape(frise);
      const bloquante = frise.find((e) => e.bloquante && e.statut !== "fait");
      const j = joursRestants(dossier.periode_debut);
      const termine = dossier.statut === "termine";
      const conseiller = conseillerDe(d, s.client.conseiller_id);
      return {
        id: dossier.id,
        reference: dossier.reference,
        statut: dossier.statut,
        crm: dossier.crm_dossier_id ?? null,
        conseiller: { id: conseiller.id, nom: `${conseiller.prenom} ${conseiller.nom}`.trim() },
        client: {
          id: s.client.id,
          nom: nomClient(s.client),
          societe: s.client.societe,
          type: s.client.type,
          email: s.client.email,
          masquage: s.client.masquer_devis || s.client.masquer_factures,
          demo: s.client.demo,
          /** Les autres dossiers de son espace (un client, un espace) : vide quand il n'en a qu'un. */
          autres: (parClient.get(s.client.id) ?? []).filter((x) => x.id !== dossier.id),
        },
        depart: dossier.ville_depart,
        arrivee: dossier.ville_arrivee,
        portee: dossier.portee,
        pays: dossier.pays_destination,
        debut: dossier.periode_debut,
        fin: dossier.periode_fin,
        joursAvant: j,
        /** La part des points du dossier faits (suiviEquipe) : le même pourcentage que sur la fiche. */
        pourcent: suivi.pourcent,
        piecesManquantes: piecesManquantes(s).length,
        piecesDemandees: suivi.pieces.demandees,
        prochaine: suivante?.titre ?? null,
        prochaineCle: suivante?.cle ?? null,
        bloque: !termine && !!bloquante,
        alerte: !termine && bloquante && j <= SEUIL_ALERTE_JOURS ? `${bloquante.titre} à valider · J−${Math.max(j, 0)}` : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => Number(a.statut === "termine") - Number(b.statut === "termine") || a.debut.localeCompare(b.debut));

  const jour = aujourdhui();
  const avenir = d.livraisons_cartons.filter((l) => l.date_samedi >= jour);
  const prochainSamedi = avenir.map((l) => l.date_samedi).sort()[0] ?? null;
  return {
    mode: mode(),
    conseillers: d.conseillers.filter((c) => d.clients.some((x) => x.conseiller_id === c.id)).map((c) => ({ id: c.id, nom: `${c.prenom} ${c.nom}`.trim() })),
    kpis: {
      actifs: lignes.filter((l) => l.statut !== "termine").length,
      alertes: lignes.filter((l) => l.alerte).length,
      cartonsASaisir: avenir.filter((l) => !l.nb_cartons).length,
      savOuverts: d.sav_declarations.filter((x) => x.statut !== "cloturee").length,
      prochainSamedi,
    },
    lignes,
  };
}

/**
 * La fiche d'un dossier, vue de l'équipe. `porte` : la porte des fichiers
 * (…/fichier) ; l'archive ZIP est à côté (…/archive), sur la porte de
 * l'équipe seulement.
 */
export function vueDossier(d: Donnees, id: string, porte: string) {
  const lien = (type: Parameters<typeof lienFichier>[0], x: string) => lienFichier(type, x, { porte });
  const telecharger = (type: Parameters<typeof lienFichier>[0], x: string) => lienFichier(type, x, { porte, telecharger: true });
  const s = snapshotDe(d, id);
  if (!s) return null;
  const frise = calculerFrise(s);
  // Toutes les pièces jointes, sans leur chemin dans le seau (il ne sort pas du serveur).
  const fichiers = fichiersDuDossier(s, d.conseillers).map((f) => ({ ...f, chemin: undefined, lien: lien(f.type, f.id), telecharger: telecharger(f.type, f.id) }));
  const porteEquipe = porte === PORTE_FICHIERS_EQUIPE;
  return {
    mode: mode(),
    client: s.client,
    dossier: s.dossier,
    /** Le dossier du CRM dont l'espace est la face client : il tient le client, le trajet, les dates, les devis et les factures. */
    crm: s.dossier.crm_dossier_id ?? null,
    segment: segmentDe(s.client.type),
    conseiller: conseillerDe(d, s.client.conseiller_id),
    conseillers: d.conseillers,
    frise,
    avancement: avancement(frise),
    /** Ce que le client a à faire, point par point, et la part faite : le haut de la fiche de l'équipe. */
    suivi: suiviEquipe(s, frise),
    suiviConteneur: estInternationalSuivi(s.dossier),
    pieces: s.requirements.map((r) => {
      const depot = s.documents.find((x) => x.requirement_id === r.id);
      return {
        ...r,
        depot: depot ? { id: depot.id, nom: depot.nom_fichier, le: depot.created_at, lien: lien("doc", depot.id), telecharger: telecharger("doc", depot.id), mime: depot.mime, taille: depot.taille_octets } : null,
      };
    }),
    documents: s.documents.filter((x) => !x.requirement_id).map((x) => ({ ...x, lien: lien("doc", x.id) })),
    fichiers,
    groupes: GROUPES_FICHIERS.map(({ cle, libelle }) => ({ cle, libelle })),
    /** « Tout télécharger » : sur la porte de l'équipe seulement, jamais en démonstration sans connexion. */
    archive: fichiers.length && porteEquipe ? lienArchive(s.dossier.id, PORTE_ARCHIVE_EQUIPE) : null,
    devis: s.devis.map((x) => ({ ...x, lien: lien("devis", x.id), telecharger: telecharger("devis", x.id) })),
    factures: s.factures.map((x) => ({ ...x, lien: lien("facture", x.id), telecharger: telecharger("facture", x.id) })),
    declaration: s.declaration,
    conditions: s.conditions ? { ...s.conditions, photos: s.conditions.photos.map((p) => ({ ...p, lien: lien("photo", p.id), telecharger: telecharger("photo", p.id) })) } : null,
    acceptations: [...s.acceptations].sort((a, b) => b.accepted_at.localeCompare(a.accepted_at)),
    livraisons: s.livraisons,
    sav: s.sav.map((x) => ({ ...x, photos: x.photos.map((p) => ({ ...p, lien: lien("photo", p.id), telecharger: telecharger("photo", p.id) })) })),
    notifications: d.notifications.filter((n) => n.dossier_id === id).slice(0, 60),
    photos: PHOTOS,
    pays: PAYS,
  };
}

/** Les portes des fichiers et de l'archive, pour l'équipe connectée (routes-equipe.ts). */
const PORTE_FICHIERS_EQUIPE = "/api/data/espace-client/fichier";
const PORTE_ARCHIVE_EQUIPE = "/api/data/espace-client/archive";

/** Une connexion du client à son espace : une session ouverte par un lien d'accès (ec_sessions). */
export type Connexion = { le: string; ip: string | null; appareil: string | null; etat: "ouverte" | "fermee" | "expiree" };

/**
 * Les dernières connexions du client — toutes ses sessions : une session
 * ouvre tous ses dossiers. Rien en démonstration ; une lecture qui échoue
 * rend une liste vide, sans bloquer la fiche.
 */
async function connexionsDu(clientId: string): Promise<Connexion[]> {
  if (estDemo()) return [];
  try {
    const { data } = await avecDelai(
      createServiceClient().from("ec_sessions").select("ouverte_le, ip, user_agent, fermee_le, expire_le").eq("client_id", clientId).order("ouverte_le", { ascending: false }).limit(12),
      5000,
    );
    const maintenant = Date.now();
    return (data ?? []).map((x) => ({
      le: x.ouverte_le as string,
      ip: (x.ip as string | null) ?? null,
      appareil: (x.user_agent as string | null) ?? null,
      etat: x.fermee_le ? ("fermee" as const) : Date.parse(x.expire_le as string) < maintenant ? ("expiree" as const) : ("ouverte" as const),
    }));
  } catch {
    return [];
  }
}

/**
 * Les tutoriels publiés que le client a vus (« Mes tutos », ec_tutos_vus) :
 * combien, sur combien, et lesquels. Une lecture qui échoue rend zéro, sans
 * bloquer la fiche.
 */
async function tutosVusDu(d: Donnees, clientId: string) {
  const publies = d.tutos.filter((t) => t.actif).sort((a, b) => a.ordre - b.ordre);
  const vus = new Set((await lireTutosVus(clientId, "service")).map((v) => v.tuto_id));
  const titres = publies.filter((t) => vus.has(t.id)).map((t) => t.titre);
  return { vus: titres.length, total: publies.length, titres };
}

/** La fiche d'un dossier, les connexions de son client et les tutoriels qu'il a vus. */
export async function vueDossierComplete(d: Donnees, id: string, porte: string) {
  const v = vueDossier(d, id, porte);
  if (!v) return null;
  const [connexions, tutos] = await Promise.all([connexionsDu(v.client.id), tutosVusDu(d, v.client.id)]);
  return { ...v, connexions, tutos };
}

export function vueCartons(d: Donnees, samediDemande: string | null) {
  const jour = aujourdhui();
  const parDate = new Map<string, number>();
  for (const l of d.livraisons_cartons) if (l.date_samedi >= jour) parDate.set(l.date_samedi, (parDate.get(l.date_samedi) ?? 0) + 1);
  const samedis = [...parDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, n]) => ({ date, n, complet: n >= CAPACITE_SAMEDI }));
  const samedi = samediDemande && /^\d{4}-\d{2}-\d{2}$/.test(samediDemande) ? samediDemande : (samedis[0]?.date ?? null);

  const livraisons = d.livraisons_cartons
    .filter((l) => l.date_samedi === samedi)
    .map((l) => {
      const dossier = d.dossiers.find((x) => x.id === l.dossier_id)!;
      const client = d.clients.find((c) => c.id === dossier.client_id)!;
      const conseiller = conseillerDe(d, client.conseiller_id);
      const horsZone = l.lat != null && l.lng != null && distanceKm(PARAMS_TOURNEE.depot, { lat: l.lat, lng: l.lng }) > PARAMS_TOURNEE.rayonMaxKm;
      return {
        ...l,
        dossierId: dossier.id,
        reference: dossier.reference,
        volume: dossier.volume_m3,
        client: nomClient(client),
        email: client.email,
        horsZone,
        sms: l.creneau_debut && l.nb_cartons
          ? texteSms("creneau_cartons", { prenom: client.prenom, nb: l.nb_cartons, debut: heure(l.creneau_debut), fin: heure(l.creneau_fin!), adresse: l.adresse, contact: l.contact_nom, telephone: conseiller.telephone })
          : null,
      };
    })
    .sort((a, b) => (a.ordre_passage ?? 99) - (b.ordre_passage ?? 99) || a.contact_nom.localeCompare(b.contact_nom));

  const tournee = livraisons.filter((l) => !l.horsZone);
  return {
    mode: mode(),
    samedis,
    samedi,
    depot: PARAMS_TOURNEE.depot,
    params: { heureDepart: PARAMS_TOURNEE.heureDepart, minutesParArret: PARAMS_TOURNEE.minutesParArret, rayonMaxKm: PARAMS_TOURNEE.rayonMaxKm, capacite: CAPACITE_SAMEDI },
    livraisons,
    total: livraisons.reduce((n, l) => n + (l.nb_cartons ?? 0), 0),
    aSaisir: livraisons.filter((l) => !l.nb_cartons).length,
    nonLocalisees: livraisons.filter((l) => l.lat == null).length,
    planifiee: tournee.length > 0 && tournee.every((l) => l.ordre_passage),
    envoyes: livraisons.filter((l) => l.creneau_envoye_le).length,
  };
}

export function vueSav(d: Donnees, porte: string) {
  return {
    mode: mode(),
    declarations: [...d.sav_declarations]
      .sort((a, b) => Number(a.statut === "cloturee") - Number(b.statut === "cloturee") || b.created_at.localeCompare(a.created_at))
      .map((x) => {
        const dossier = d.dossiers.find((y) => y.id === x.dossier_id);
        const client = dossier && d.clients.find((c) => c.id === dossier.client_id);
        return { ...x, reference: dossier?.reference ?? "", dossierId: dossier?.id ?? "", client: client ? nomClient(client) : "", photos: x.photos.map((p) => ({ ...p, lien: lienFichier("photo", p.id, { porte }) })) };
      }),
  };
}

/**
 * L'éditeur des pièces à fournir : les pièces, leur condition et leurs
 * modèles à télécharger (liens de cinq minutes sur la porte de l'équipe).
 * `migration0021` : la table des modèles se lit — sinon l'éditeur le dit,
 * et ne propose ni condition ni modèle.
 */
export function vueDestinations(d: Donnees, porte: string) {
  return {
    mode: mode(),
    pieces: [...d.document_requirements]
      .sort((a, b) => (a.segment ?? "").localeCompare(b.segment ?? "") || (a.pays ?? "").localeCompare(b.pays ?? "") || a.ordre - b.ordre)
      .map((p) => ({
        ...p,
        condition: p.condition ?? null,
        modeles: modelesDe(d, p.id).map((m) => ({ ...m, chemin: undefined, lien: lienFichier("modele", m.id, { porte, telecharger: true }) })),
      })),
    pays: PAYS,
    segments: LISTE_SEGMENTS.map((s) => ({ cle: s.cle, libelle: s.libelle })),
    conditions: LISTE_CONDITIONS,
    migration0021: estDemo() || !tableManquante("modeles_pieces"),
  };
}

/**
 * Le journal de l'espace : chaque message, avec ce que le module d'envoi en
 * a fait (envoyé, journalisé, bloqué par la liste blanche, bac à sable…). Si
 * le journal des envois ne se lit pas, les lignes gardent leur statut court.
 */
export async function vueJournal(d: Donnees) {
  const envois = estDemo() ? new Map() : await envoisDesNotifications().catch(() => new Map());
  return {
    mode: mode(),
    notifications: d.notifications.slice(0, 400).map((n) => {
      // brevo_id : l'identifiant du message chez son fournisseur, quel qu'il soit (envois/journal.ts).
      const e = envois.get(n.id) as { statut: string; motif: string | null; brevo_id: string | null } | undefined;
      return { ...n, reference: d.dossiers.find((x) => x.id === n.dossier_id)?.reference ?? null, envoi: e ? { statut: e.statut, motif: e.motif, idFournisseur: e.brevo_id } : null };
    }),
  };
}

export function vueReglages(d: Donnees) {
  return {
    mode: mode(),
    conseillers: d.conseillers.map((c) => ({ ...c, dossiers: d.clients.filter((x) => x.conseiller_id === c.id).length })),
    tutos: [...d.tutos].sort((a, b) => a.ordre - b.ordre),
    services: [...d.services].sort((a, b) => a.ordre - b.ordre),
  };
}

export function vueNouveau(d: Donnees) {
  return { mode: mode(), conseillers: d.conseillers, photos: PHOTOS, pays: PAYS, clients: d.clients.map((c) => ({ email: c.email, nom: nomClient(c) })) };
}

/** Les demandes des questionnaires : lecture Supabase, qui peut échouer sans rien bloquer. */
export async function vueDemandes() {
  try {
    return { demandes: await listerDemandes(), erreur: null };
  } catch (e) {
    return { demandes: [], erreur: e instanceof Error ? e.message : "Lecture impossible" };
  }
}

/**
 * Une demande, pour préremplir « Nouveau dossier » (et l'action « Ouvrir
 * l'espace client » de sa fiche) : la demande, son estimation, et le dossier
 * déjà ouvert pour elle, s'il y en a un.
 */
export async function vueDemande(d: Donnees, id: string) {
  const dossier = d.dossiers.find((x) => x.request_id === id);
  const existant = dossier ? { id: dossier.id, reference: dossier.reference } : null;
  try {
    const [demande, devis] = await Promise.all([lireDemande(id), devisDeLaDemande(id)]);
    return { demande, devis, dossier: existant, erreur: null };
  } catch (e) {
    return { demande: null, devis: [], dossier: existant, erreur: e instanceof Error ? e.message : "Lecture impossible" };
  }
}

export async function apercuNotification(d: Donnees, id: string, base: string) {
  const n = d.notifications.find((x) => x.id === id);
  if (!n) return null;
  if (n.canal === "sms") return { canal: "sms" as const, destinataire: n.destinataire, sujet: "SMS", texte: String(n.payload.texte ?? ""), html: null };
  // Le texte réglé aujourd'hui dans « Courriers et SMS » (celui d'hier n'est pas gardé : le journal garde les données, pas le rendu).
  const t = (await textesEspace()).get(cleCatalogue(n.modele, "email"));
  const r = rendreEmail(n.modele, n.payload, base, t?.corps?.trim() ? { objet: t.objet, corps: t.corps } : null);
  return { canal: "email" as const, destinataire: n.destinataire, sujet: r.sujet, texte: r.texte, html: r.html.replace("<head>", '<head><base target="_blank">') };
}

/** Le routeur des vues : /…/espace-client/<vue>/<id>. */
export async function lireVue(chemin: string[], params: URLSearchParams, base: string, porteFichiers: string) {
  const [vue = "apercu", id] = chemin;
  if (vue === "demandes" && !id) return vueDemandes();
  const d = await lireDonnees();
  if (vue === "demandes") return /^[0-9a-f-]{36}$/i.test(id!) ? vueDemande(d, id!) : null;
  switch (vue) {
    case "apercu":
      return vueApercu(d);
    case "dossier":
      return id ? await vueDossierComplete(d, id, porteFichiers) : null;
    case "cartons":
      return vueCartons(d, params.get("samedi"));
    case "sav":
      return vueSav(d, porteFichiers);
    case "destinations":
      return vueDestinations(d, porteFichiers);
    case "journal":
      return await vueJournal(d);
    case "reglages":
      return vueReglages(d);
    case "nouveau":
      return vueNouveau(d);
    case "apercu-message":
      return id ? await apercuNotification(d, id, base) : null;
    default:
      return null;
  }
}
