import "server-only";
import { CAPACITE_SAMEDI } from "./cartons";
import { demoEquipeActive, envoiReel, modeDonnees } from "./config";
import { lireDonnees } from "./depot";
import { devisDeLaDemande, listerDemandes } from "./demandes";
import { rendreEmail, texteSms } from "./emails";
import { lienFichier } from "./fichiers";
import { aujourdhui, heure, joursRestants, nomClient, PAYS } from "./format";
import { conseillerDe, snapshotDe } from "./lectures";
import { PHOTOS } from "./photos";
import { avancement, calculerFrise, estInternationalSuivi, prochaineEtape } from "./progression";
import { distanceKm, PARAMS_TOURNEE } from "./tournee";
import type { Donnees } from "./types";

/*
 * Ce que lisent les écrans du back-office. Les mêmes fonctions servent la
 * route protégée de l'espace équipe (/api/data/espace-client) et la route du
 * back-office de démonstration : un seul calcul, deux portes.
 */

/** Combien de jours avant le déménagement une étape bloquante non faite devient une alerte. */
const SEUIL_ALERTE_JOURS = 21;

function mode() {
  return { donnees: modeDonnees(), envoi: envoiReel(), demoEquipe: demoEquipeActive() };
}

export function vueApercu(d: Donnees) {
  const lignes = d.dossiers
    .map((dossier) => {
      const s = snapshotDe(d, dossier.id);
      if (!s) return null;
      const frise = calculerFrise(s);
      const suivante = prochaineEtape(frise);
      const bloquante = frise.find((e) => e.bloquante && e.statut !== "fait");
      const j = joursRestants(dossier.periode_debut);
      const termine = dossier.statut === "termine";
      return {
        id: dossier.id,
        reference: dossier.reference,
        statut: dossier.statut,
        client: { nom: nomClient(s.client), societe: s.client.societe, type: s.client.type, email: s.client.email, masquage: s.client.masquer_devis || s.client.masquer_factures },
        depart: dossier.ville_depart,
        arrivee: dossier.ville_arrivee,
        portee: dossier.portee,
        pays: dossier.pays_destination,
        debut: dossier.periode_debut,
        fin: dossier.periode_fin,
        joursAvant: j,
        pourcent: avancement(frise).pourcent,
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

export function vueDossier(d: Donnees, id: string) {
  const s = snapshotDe(d, id);
  if (!s) return null;
  const frise = calculerFrise(s);
  return {
    mode: mode(),
    client: s.client,
    dossier: s.dossier,
    conseiller: conseillerDe(d, s.client.conseiller_id),
    conseillers: d.conseillers,
    frise,
    avancement: avancement(frise),
    suiviConteneur: estInternationalSuivi(s.dossier),
    pieces: s.requirements.map((r) => {
      const depot = s.documents.find((x) => x.requirement_id === r.id);
      return { ...r, depot: depot ? { id: depot.id, nom: depot.nom_fichier, le: depot.created_at, lien: lienFichier("doc", depot.id) } : null };
    }),
    documents: s.documents.filter((x) => !x.requirement_id).map((x) => ({ ...x, lien: lienFichier("doc", x.id) })),
    devis: s.devis.map((x) => ({ ...x, lien: lienFichier("devis", x.id) })),
    factures: s.factures.map((x) => ({ ...x, lien: lienFichier("facture", x.id) })),
    declaration: s.declaration,
    conditions: s.conditions ? { ...s.conditions, photos: s.conditions.photos.map((p) => ({ ...p, lien: lienFichier("photo", p.id) })) } : null,
    acceptations: [...s.acceptations].sort((a, b) => b.accepted_at.localeCompare(a.accepted_at)),
    livraisons: s.livraisons,
    sav: s.sav.map((x) => ({ ...x, photos: x.photos.map((p) => ({ ...p, lien: lienFichier("photo", p.id) })) })),
    notifications: d.notifications.filter((n) => n.dossier_id === id).slice(0, 40),
    photos: PHOTOS,
    pays: PAYS,
  };
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

export function vueSav(d: Donnees) {
  return {
    mode: mode(),
    declarations: [...d.sav_declarations]
      .sort((a, b) => Number(a.statut === "cloturee") - Number(b.statut === "cloturee") || b.created_at.localeCompare(a.created_at))
      .map((x) => {
        const dossier = d.dossiers.find((y) => y.id === x.dossier_id);
        const client = dossier && d.clients.find((c) => c.id === dossier.client_id);
        return { ...x, reference: dossier?.reference ?? "", dossierId: dossier?.id ?? "", client: client ? nomClient(client) : "", photos: x.photos.map((p) => ({ ...p, lien: lienFichier("photo", p.id) })) };
      }),
  };
}

export function vueDestinations(d: Donnees) {
  return { mode: mode(), pieces: [...d.document_requirements].sort((a, b) => (a.pays ?? "").localeCompare(b.pays ?? "") || a.ordre - b.ordre), pays: PAYS };
}

export function vueJournal(d: Donnees) {
  return {
    mode: mode(),
    notifications: d.notifications.slice(0, 400).map((n) => ({ ...n, reference: d.dossiers.find((x) => x.id === n.dossier_id)?.reference ?? null })),
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

export async function vueDemande(id: string) {
  try {
    const [demandes, devis] = await Promise.all([listerDemandes(), devisDeLaDemande(id)]);
    return { demande: demandes.find((x) => x.id === id) ?? null, devis, erreur: null };
  } catch (e) {
    return { demande: null, devis: [], erreur: e instanceof Error ? e.message : "Lecture impossible" };
  }
}

export function apercuNotification(d: Donnees, id: string, base: string) {
  const n = d.notifications.find((x) => x.id === id);
  if (!n) return null;
  if (n.canal === "sms") return { canal: "sms" as const, destinataire: n.destinataire, sujet: "SMS", texte: String(n.payload.texte ?? ""), html: null };
  const r = rendreEmail(n.modele, n.payload, base);
  return { canal: "email" as const, destinataire: n.destinataire, sujet: r.sujet, texte: r.texte, html: r.html.replace("<head>", '<head><base target="_blank">') };
}

/** Le routeur des vues : /…/espace-client/<vue>/<id>. */
export async function lireVue(chemin: string[], params: URLSearchParams, base: string) {
  const [vue = "apercu", id] = chemin;
  if (vue === "demandes") return id ? vueDemande(id) : vueDemandes();
  const d = await lireDonnees();
  switch (vue) {
    case "apercu":
      return vueApercu(d);
    case "dossier":
      return id ? vueDossier(d, id) : null;
    case "cartons":
      return vueCartons(d, params.get("samedi"));
    case "sav":
      return vueSav(d);
    case "destinations":
      return vueDestinations(d);
    case "journal":
      return vueJournal(d);
    case "reglages":
      return vueReglages(d);
    case "nouveau":
      return vueNouveau(d);
    case "apercu-message":
      return id ? apercuNotification(d, id, base) : null;
    default:
      return null;
  }
}
