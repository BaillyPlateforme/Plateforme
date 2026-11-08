/*
 * Le jeu de démonstration, repris de la v0 — entièrement fictif (noms,
 * adresses, numéros). Dossiers A à D : les quatre profils du brief. Dossiers
 * E à I : de quoi remplir une tournée de cartons un samedi. Dossiers J et K
 * (profils E et F) : un militaire et un logement social, les deux segments
 * du cahier des charges ajoutés avec le lien au CRM.
 *
 * En base, scripts/semer-espace-client.mjs relie chaque dossier à un dossier
 * fictif du CRM : les devis, factures et paiements ci-dessous y sont semés,
 * puis reviennent dans l'espace par la projection (migration 0012).
 *
 * Les dates de la v0 tombaient en septembre et octobre 2026 : passé ce cap,
 * le déménagement de Claire aurait déjà eu lieu et la démonstration ne
 * montrerait plus rien. Elles sont donc décalées à chaque amorçage d'un
 * nombre entier de semaines, pour que « aujourd'hui » corresponde toujours au
 * 11 septembre 2026 de la v0 — et que les samedis restent des samedis.
 *
 * Écarts volontaires avec la v0 : les photos sont celles de la micro démo ;
 * le devis du profil B attend l'accord du client (c'est le parcours « accepter
 * et payer les arrhes » de la micro démo) et sa facture de solde, émise avant
 * l'acceptation, a disparu.
 *
 * Le même jeu sert deux fois : en mémoire pour la démonstration
 * (ESPACE_CLIENT_DONNEES=demo), et dans les tables ec_* par
 * scripts/semer-espace-client.mjs, qui donne à chaque client fictif un compte
 * Supabase Auth en @example.com (app_metadata : role « client », demo). Ce
 * fichier ne doit donc importer que des types : le script le charge tel quel.
 */

import type { Donnees, DocumentRequirement, Service, Tuto } from "./types";

/** Le jour qui sert d'« aujourd'hui » aux dates écrites ci-dessous. */
const REFERENCE = Date.UTC(2026, 8, 11);
const T = "2026-09-01T09:00:00.000Z";

/** 2 : les segments militaire et logement social (profils E et F), les pièces par segment. */
export const VERSION_DONNEES = 2;

/** Décale toutes les dates d'un objet du même nombre de jours. */
function decaler<T>(valeur: T, jours: number): T {
  if (typeof valeur === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})(T.*)?$/.exec(valeur);
    if (!m) return valeur;
    const d = new Date(`${m[1]}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + jours);
    return `${d.toISOString().slice(0, 10)}${m[2] ?? ""}` as T;
  }
  if (Array.isArray(valeur)) return valeur.map((v) => decaler(v, jours)) as T;
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, decaler(v, jours)])) as T;
  }
  return valeur;
}

/** Les pièces à fournir de départ (v0) : la liste réelle est à fournir par Bailly. */
export const PIECES_PAR_DEFAUT: DocumentRequirement[] = [
  { id: "rq-id", pays: null, segment: null, libelle: "Pièce d'identité", description: "Carte d'identité ou passeport en cours de validité, recto verso.", obligatoire: true, ordre: 1 },
  { id: "rq-ca-bsf186", pays: "CA", segment: null, libelle: "Liste des marchandises (formulaire BSF186)", description: "Inventaire détaillé et valorisé des biens importés, à présenter à l'Agence des services frontaliers du Canada.", obligatoire: true, ordre: 10 },
  { id: "rq-ca-passeport", pays: "CA", segment: null, libelle: "Passeport de chaque membre du foyer", description: "Page d'identité, valable au moins 6 mois après l'arrivée.", obligatoire: true, ordre: 11 },
  { id: "rq-ca-permis", pays: "CA", segment: null, libelle: "Permis de travail ou confirmation de résidence permanente", description: "Justifie le statut d'immigrant ou de travailleur temporaire.", obligatoire: true, ordre: 12 },
  { id: "rq-ca-bail", pays: "CA", segment: null, libelle: "Bail ou attestation de logement au Canada", description: "Adresse de livraison au Canada.", obligatoire: false, ordre: 13 },
  { id: "rq-us-cbp", pays: "US", segment: null, libelle: "Formulaire CBP 3299", description: "Déclaration d'entrée en franchise des effets personnels.", obligatoire: true, ordre: 10 },
  { id: "rq-us-visa", pays: "US", segment: null, libelle: "Passeport et visa", description: "Visa en cours de validité pour chaque personne.", obligatoire: true, ordre: 11 },
  { id: "rq-gb-tor", pays: "GB", segment: null, libelle: "Formulaire ToR01 (Transfer of Residence)", description: "Exonération des droits sur les effets personnels.", obligatoire: true, ordre: 10 },
  // Les pièces propres à un segment, nommées par le cahier des charges (§2). Libellés à faire valider par Bailly.
  { id: "rq-mil-mutation", pays: null, segment: "militaire", libelle: "Ordre de mutation", description: "L'ordre de mutation délivré par votre administration.", obligatoire: true, ordre: 2 },
  { id: "rq-mil-carte", pays: null, segment: "militaire", libelle: "Carte militaire", description: "Recto verso.", obligatoire: true, ordre: 3 },
  { id: "rq-ls-bailleur", pays: null, segment: "logement_social", libelle: "Documents du bailleur", description: "Les documents remis par votre bailleur pour ce déménagement.", obligatoire: true, ordre: 2 },
];

/** Tutos de la v0, vignettes de la micro démo. Contenus provisoires. */
export const TUTOS_PAR_DEFAUT: Tuto[] = [
  { id: "tu-carton", titre: "Bien remplir un carton", resume: "Le lourd en bas, le léger en haut, jamais plus de 15 kg.", categorie: "Emballage", duree_min: 3, image: "/espace-client/interieur-2.jpg", ordre: 1, actif: true, url_video: "/espace-client/tutos/bien-remplir-un-carton.mp4", etapes: ["Montez le fond en croisant deux bandes d'adhésif.", "Placez les objets lourds au fond, les plus légers au-dessus.", "Comblez les vides avec du papier froissé : rien ne doit bouger.", "Ne dépassez pas 15 kg : le carton doit se soulever d'une main.", "Fermez, puis notez la pièce de destination sur deux faces."] },
  { id: "tu-vaisselle", titre: "Emballer la vaisselle", resume: "Assiettes sur la tranche, verres emballés un par un.", categorie: "Emballage", duree_min: 4, image: "/espace-client/interieur-4.jpg", ordre: 2, actif: true, url_video: null, etapes: ["Utilisez un carton « vaisselle » renforcé.", "Emballez chaque pièce dans du papier bulle ou du papier journal.", "Rangez les assiettes sur la tranche, jamais à plat.", "Écrivez FRAGILE et une flèche « haut » sur le carton."] },
  { id: "tu-etiquettes", titre: "Étiqueter pour un déballage facile", resume: "Une couleur par pièce, un numéro par carton.", categorie: "Organisation", duree_min: 2, image: "/espace-client/interieur-3.jpg", ordre: 3, actif: true, url_video: null, etapes: ["Attribuez une couleur à chaque pièce du nouveau logement.", "Numérotez les cartons et tenez une liste simple.", "Signalez les cartons à ouvrir en premier (« 1er soir »)."] },
  { id: "tu-declaration", titre: "Remplir sa déclaration de valeurs", resume: "Ce document fixe l'indemnisation en cas de sinistre.", categorie: "Démarches", duree_min: 5, image: "/espace-client/paris-interieur.jpg", ordre: 4, actif: true, url_video: null, etapes: ["Listez les objets par catégorie (mobilier, électroménager…).", "Indiquez une valeur de remplacement réaliste, pas le prix d'achat d'origine.", "Détaillez à part tout objet de plus de 1 500 €.", "Vérifiez le total puis validez en ligne."] },
  { id: "tu-jourj", titre: "La check-list du jour J", resume: "Tout ce qu'il faut avoir sous la main le jour du départ.", categorie: "Organisation", duree_min: 3, image: "/espace-client/interieur-2.jpg", ordre: 5, actif: true, url_video: null, etapes: ["Gardez avec vous papiers, clés, chargeurs et médicaments.", "Relevez les compteurs d'eau, d'électricité et de gaz.", "Faites un dernier tour de chaque pièce avec le chef d'équipe.", "Vérifiez la lettre de voiture avant de la signer."] },
];

/** Services de la v0. Prix indicatifs provisoires, à faire valider par Bailly. */
export const SERVICES_PAR_DEFAUT: Service[] = [
  { id: "sv-garde", titre: "Garde-meubles", accroche: "Un box sécurisé, au mois, sans engagement.", contenu: "Stockage en entrepôt surveillé et ventilé, de 3 à 30 m³. Accès sur rendez-vous, facturation mensuelle réglable en ligne depuis votre espace.", prix_indicatif: "à partir de 49 € / mois", ordre: 1, actif: true },
  { id: "sv-emballage", titre: "Emballage complet", accroche: "Nous emballons tout, vous ne touchez à rien.", contenu: "Nos équipes emballent la totalité de vos biens la veille du départ, avec du matériel professionnel adapté à chaque objet.", prix_indicatif: "sur devis", ordre: 2, actif: true },
  { id: "sv-monte-meuble", titre: "Monte-meuble", accroche: "Pour les étages élevés et les escaliers étroits.", contenu: "Monte-meuble jusqu'au 8e étage, avec opérateur. Nous nous chargeons de la demande d'autorisation de stationnement.", prix_indicatif: "à partir de 290 €", ordre: 3, actif: true },
  { id: "sv-nettoyage", titre: "Nettoyage de fin de bail", accroche: "Rendez vos clés l'esprit tranquille.", contenu: "Ménage complet du logement quitté, par un partenaire agréé, le jour même ou le lendemain du déménagement.", prix_indicatif: "à partir de 180 €", ordre: 4, actif: true },
  { id: "sv-vehicule", titre: "Transfert de véhicule", accroche: "Votre voiture vous attend à l'arrivée.", contenu: "Transport de votre véhicule par camion porte-voitures, en France et à l'international.", prix_indicatif: "sur devis", ordre: 5, actif: true },
  { id: "sv-piano", titre: "Objets d'exception", accroche: "Piano, œuvres d'art, cave à vin.", contenu: "Manutention spécialisée, caisses sur mesure et assurance renforcée pour vos objets les plus précieux.", prix_indicatif: "sur devis", ordre: 6, actif: true },
];

/** Les quatre profils du brief, pour l'écran de connexion et le bouton « Démo ». */
export const PROFILS_DEMO = [
  { lettre: "A", email: "claire.dumont@example.com", reference: "BD-2026-0147", titre: "Particulier · Paris → Lyon", detail: "Arrhes réglées, conditions de livraison à remplir, cartons planifiés" },
  { lettre: "B", email: "julien.roussel@example.com", reference: "BD-2026-0152", titre: "International · Marseille → Montréal", detail: "Devis à accepter et arrhes à payer, pièces du Canada, conteneur" },
  { lettre: "C", email: "mobilite.atlantique@example.com", reference: "BD-2026-0139", titre: "Grand compte · Nantes → Bordeaux", detail: "Devis et factures masqués" },
  { lettre: "D", email: "claire.dumont@example.com", reference: "BD-2024-0311", titre: "Ancien dossier · Lille → Paris", detail: "Terminé : SAV, sélecteur de dossiers" },
  { lettre: "E", email: "thomas.lefort@example.com", reference: "BD-2026-0165", titre: "Militaire · Brest → Toulon", detail: "Prise en charge par l'administration, ordre de mutation et carte militaire" },
  { lettre: "F", email: "fatou.diallo@example.com", reference: "BD-2026-0166", titre: "Logement social · Créteil → Vitry-sur-Seine", detail: "Pièces du bailleur, SAV ouvert, bailleur prévenu" },
] as const;

/**
 * Un profil de la démonstration ? Seuls ceux-là s'ouvrent sans boîte mail
 * (bouton « Entrer », aperçu de l'e-mail reçu) : un client que l'équipe
 * crée, même en démonstration, ne reçoit son lien que par e-mail. En base, il
 * faut de plus que la ligne du client soit marquée « demo » (acces.ts).
 */
export const estProfilDemo = (email: string) => PROFILS_DEMO.some((p) => p.email === email.trim().toLowerCase());

/** Le point de départ : aucun client, les listes de la v0 (pièces, tutos, services). */
function depart(): Donnees {
  return {
    version: VERSION_DONNEES,
    conseillers: [],
    clients: [],
    dossiers: [],
    devis: [],
    factures: [],
    document_requirements: PIECES_PAR_DEFAUT.map((p) => ({ ...p })),
    documents: [],
    acceptations: [],
    declarations_valeurs: [],
    conditions_livraison: [],
    livraisons_cartons: [],
    sav_declarations: [],
    tutos: TUTOS_PAR_DEFAUT.map((t) => ({ ...t, etapes: [...t.etapes] })),
    services: SERVICES_PAR_DEFAUT.map((s) => ({ ...s })),
    notifications: [],
    sessions_paiement: [],
    creneaux: [],
    visites: [],
  };
}

const sansConteneur = { compagnie: null, numero_conteneur: null, url_tracking: null, statut_conteneur: null, navire: null, port_depart: null, port_arrivee: null, eta: null };
const national = { portee: "national" as const, mode_transport: "route" as const, pays_destination: "FR", request_id: null, termine_le: null, avis_demande_le: null, cartons_non_necessaires: false, logement: null };

/** Le jeu de démonstration, daté par rapport à `now`. */
export function amorcer(now = new Date()): Donnees {
  const semaines = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - REFERENCE) / (7 * 86_400_000));
  const base = depart();

  const d: Donnees = {
    ...base,
    conseillers: [
      { id: "eq-nadia", prenom: "Nadia", nom: "Berthier", email: "nadia.berthier@example.com", telephone: "01 84 60 12 30", demo: true },
      { id: "eq-marc", prenom: "Marc", nom: "Delaunay", email: "marc.delaunay@example.com", telephone: "01 84 60 12 31", demo: true },
    ],

    clients: [
      { id: "cl-dumont", type: "particulier", civilite: "Madame", prenom: "Claire", nom: "Dumont", societe: null, email: "claire.dumont@example.com", telephone: "06 12 34 56 78", masquer_devis: false, masquer_factures: false, conseiller_id: "eq-nadia", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: "2024-03-02T10:00:00.000Z" },
      { id: "cl-roussel", type: "particulier", civilite: "Monsieur", prenom: "Julien", nom: "Roussel", societe: null, email: "julien.roussel@example.com", telephone: "06 23 45 67 89", masquer_devis: false, masquer_factures: false, conseiller_id: "eq-nadia", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
      { id: "cl-atlantique", type: "grand_compte", civilite: "Madame", prenom: "Sophie", nom: "Lemaire", societe: "Groupe Atlantique Industrie", email: "mobilite.atlantique@example.com", telephone: "02 40 00 11 22", masquer_devis: true, masquer_factures: true, conseiller_id: "eq-marc", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
      { id: "cl-garnier", type: "particulier", civilite: "Monsieur", prenom: "Hugo", nom: "Garnier", societe: null, email: "hugo.garnier@example.com", telephone: "06 34 56 78 90", masquer_devis: false, masquer_factures: false, conseiller_id: "eq-nadia", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
      { id: "cl-benoit", type: "particulier", civilite: "Madame", prenom: "Léa", nom: "Benoît", societe: null, email: "lea.benoit@example.com", telephone: "06 45 67 89 01", masquer_devis: false, masquer_factures: false, conseiller_id: "eq-marc", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
      { id: "cl-fabre", type: "particulier", civilite: "Monsieur", prenom: "Antoine", nom: "Fabre", societe: null, email: "antoine.fabre@example.com", telephone: "06 56 78 90 12", masquer_devis: false, masquer_factures: false, conseiller_id: "eq-nadia", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
      { id: "cl-marchal", type: "particulier", civilite: "Madame", prenom: "Inès", nom: "Marchal", societe: null, email: "ines.marchal@example.com", telephone: "06 67 89 01 23", masquer_devis: false, masquer_factures: false, conseiller_id: "eq-marc", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
      { id: "cl-perrin", type: "particulier", civilite: "Monsieur", prenom: "Karim", nom: "Perrin", societe: null, email: "karim.perrin@example.com", telephone: "06 78 90 12 34", masquer_devis: false, masquer_factures: false, conseiller_id: "eq-nadia", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
      // E · militaire : prise en charge par l'administration, ni devis ni factures à l'écran.
      { id: "cl-lefort", type: "militaire", civilite: "Monsieur", prenom: "Thomas", nom: "Lefort", societe: null, email: "thomas.lefort@example.com", telephone: "06 81 22 43 65", masquer_devis: true, masquer_factures: true, conseiller_id: "eq-marc", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
      // F · logement social : pièces du bailleur, bailleur prévenu des avaries.
      { id: "cl-diallo", type: "logement_social", civilite: "Madame", prenom: "Fatou", nom: "Diallo", societe: null, email: "fatou.diallo@example.com", telephone: "06 72 18 39 50", masquer_devis: false, masquer_factures: false, conseiller_id: "eq-nadia", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: T },
    ],

    dossiers: [
      // A · Paris → Lyon — parcours complet en cours.
      { ...national, ...sansConteneur, id: "do-a", client_id: "cl-dumont", reference: "BD-2026-0147", ville_depart: "Paris", ville_arrivee: "Lyon", adresse_depart: "12 rue de la Roquette, 75011 Paris", adresse_arrivee: "18 quai Saint-Vincent, 69001 Lyon", periode_debut: "2026-10-14", periode_fin: "2026-10-15", statut: "planifie", volume_m3: 32, formule: "Confort", logement: "T3 · 68 m²", photo: "/espace-client/lyon.jpg", created_at: "2026-08-18T08:30:00.000Z" },
      // B · Marseille → Montréal — international maritime.
      { ...national, id: "do-b", client_id: "cl-roussel", reference: "BD-2026-0152", ville_depart: "Marseille", ville_arrivee: "Montréal", adresse_depart: "41 boulevard Longchamp, 13001 Marseille", adresse_arrivee: "2150 rue Saint-Denis, Montréal (QC) H2X 3K9", periode_debut: "2026-11-16", periode_fin: "2026-12-18", portee: "international", mode_transport: "maritime", pays_destination: "CA", statut: "planifie", volume_m3: 45, formule: "Porte à porte international", logement: "T2 · 54 m²", compagnie: "CMA CGM", numero_conteneur: "CMAU 482193-6", url_tracking: "https://www.cma-cgm.com/ebusiness/tracking", statut_conteneur: "Réservation confirmée — embarquement prévu au port de Fos-sur-Mer", navire: "CMA CGM Saint-Laurent", port_depart: "Marseille-Fos", port_arrivee: "Montréal", eta: "2026-12-11", photo: "/espace-client/montreal.jpg", created_at: "2026-08-25T14:10:00.000Z" },
      // C · Nantes → Bordeaux — grand compte, devis et factures masqués.
      { ...national, ...sansConteneur, id: "do-c", client_id: "cl-atlantique", reference: "BD-2026-0139", ville_depart: "Nantes", ville_arrivee: "Bordeaux", adresse_depart: "7 rue Crébillon, 44000 Nantes", adresse_arrivee: "22 cours de l'Intendance, 33000 Bordeaux", periode_debut: "2026-10-05", periode_fin: "2026-10-06", statut: "planifie", volume_m3: 28, formule: "Mobilité collaborateur", logement: "Maison · 5 pièces", photo: "/espace-client/bordeaux.jpg", created_at: "2026-08-10T09:00:00.000Z" },
      // D · même cliente que A — ancien déménagement, terminé.
      { ...national, ...sansConteneur, id: "do-d", client_id: "cl-dumont", reference: "BD-2024-0311", ville_depart: "Lille", ville_arrivee: "Paris", adresse_depart: "9 rue de la Monnaie, 59800 Lille", adresse_arrivee: "12 rue de la Roquette, 75011 Paris", periode_debut: "2024-06-12", periode_fin: "2024-06-13", statut: "termine", volume_m3: 24, formule: "Essentielle", logement: "T2 · 51 m²", photo: "/espace-client/paris-interieur.jpg", termine_le: "2024-06-13T18:00:00.000Z", avis_demande_le: "2024-06-13T18:05:00.000Z", created_at: "2024-04-20T10:00:00.000Z" },
      // E à I — dossiers secondaires pour la tournée de cartons.
      { ...national, ...sansConteneur, id: "do-e", client_id: "cl-garnier", reference: "BD-2026-0155", ville_depart: "Vincennes", ville_arrivee: "Nantes", adresse_depart: "8 avenue de Paris, 94300 Vincennes", adresse_arrivee: "3 place Graslin, 44000 Nantes", periode_debut: "2026-10-09", periode_fin: "2026-10-10", statut: "planifie", volume_m3: 20, formule: "Essentielle", photo: "/espace-client/interieur-4.jpg", created_at: T },
      { ...national, ...sansConteneur, id: "do-f", client_id: "cl-benoit", reference: "BD-2026-0158", ville_depart: "Montreuil", ville_arrivee: "Rennes", adresse_depart: "15 rue de Paris, 93100 Montreuil", adresse_arrivee: "5 rue Saint-Georges, 35000 Rennes", periode_debut: "2026-10-12", periode_fin: "2026-10-12", statut: "planifie", volume_m3: 18, formule: "Confort", photo: "/espace-client/interieur-2.jpg", created_at: T },
      { ...national, ...sansConteneur, id: "do-g", client_id: "cl-fabre", reference: "BD-2026-0160", ville_depart: "Sceaux", ville_arrivee: "Toulouse", adresse_depart: "25 rue Houdan, 92330 Sceaux", adresse_arrivee: "11 rue d'Alsace-Lorraine, 31000 Toulouse", periode_debut: "2026-10-16", periode_fin: "2026-10-17", statut: "en_preparation", volume_m3: 36, formule: "Confort", photo: "/espace-client/interieur-3.jpg", created_at: T },
      { ...national, ...sansConteneur, id: "do-h", client_id: "cl-marchal", reference: "BD-2026-0161", ville_depart: "Saint-Cloud", ville_arrivee: "Annecy", adresse_depart: "40 boulevard de la République, 92210 Saint-Cloud", adresse_arrivee: "6 rue Royale, 74000 Annecy", periode_debut: "2026-10-19", periode_fin: "2026-10-20", statut: "en_preparation", volume_m3: 26, formule: "Essentielle", photo: "/espace-client/interieur-4.jpg", created_at: T },
      { ...national, ...sansConteneur, id: "do-i", client_id: "cl-perrin", reference: "BD-2026-0163", ville_depart: "Neuilly-sur-Seine", ville_arrivee: "Bordeaux", adresse_depart: "3 rue du Château, 92200 Neuilly-sur-Seine", adresse_arrivee: "14 rue Sainte-Catherine, 33000 Bordeaux", periode_debut: "2026-10-22", periode_fin: "2026-10-23", statut: "en_preparation", volume_m3: 30, formule: "Confort", photo: "/espace-client/bordeaux.jpg", created_at: T },
      // E · Brest → Toulon — militaire, prise en charge confirmée par l'administration.
      { ...national, ...sansConteneur, id: "do-j", client_id: "cl-lefort", reference: "BD-2026-0165", ville_depart: "Brest", ville_arrivee: "Toulon", adresse_depart: "14 rue de Siam, 29200 Brest", adresse_arrivee: "27 boulevard de Strasbourg, 83000 Toulon", periode_debut: "2026-10-27", periode_fin: "2026-10-28", statut: "en_preparation", volume_m3: 38, formule: "à définir", logement: "T4 · 82 m²", photo: "/espace-client/interieur-3.jpg", commande_le: "2026-09-04T10:00:00.000Z", created_at: "2026-08-29T09:00:00.000Z" },
      // F · Créteil → Vitry-sur-Seine — logement social, déménagement passé : le SAV est ouvert.
      { ...national, ...sansConteneur, id: "do-k", client_id: "cl-diallo", reference: "BD-2026-0166", ville_depart: "Créteil", ville_arrivee: "Vitry-sur-Seine", adresse_depart: "5 allée du Commerce, 94000 Créteil", adresse_arrivee: "18 avenue Paul-Vaillant-Couturier, 94400 Vitry-sur-Seine", periode_debut: "2026-09-07", periode_fin: "2026-09-08", statut: "planifie", volume_m3: 22, formule: "Standard", logement: "T3 · 64 m²", photo: "/espace-client/interieur-2.jpg", commande_le: "2026-08-20T17:00:00.000Z", bailleur_nom: "Habitat du Val Fleuri", bailleur_email: "relogement@habitat-valfleuri.example.com", created_at: "2026-08-12T09:00:00.000Z" },
    ],

    devis: [
      {
        id: "dv-a1", dossier_id: "do-a", numero: "DV-2026-0147-1", formule: "Confort",
        lignes: [
          { libelle: "Déménagement Paris → Lyon", detail: "32 m³ · 2 jours · équipe de 4", montant_ht: 2150 },
          { libelle: "Emballage des objets fragiles", detail: "Vaisselle, verrerie, cadres", montant_ht: 290 },
          { libelle: "Démontage et remontage du mobilier", montant_ht: 180 },
          { libelle: "Fourniture de cartons", detail: "40 cartons standard, 10 cartons livres, adhésif", montant_ht: 0 },
        ],
        inclus: ["Emballage du fragile", "Démontage / remontage", "Fourniture de 50 cartons"],
        montant_ht: 2620, montant_ttc: 3144, arrhes_pourcentage: 30, statut: "accepte",
        emis_le: "2026-08-20", valide_jusqu_au: "2026-09-20", accepte_le: "2026-08-24",
      },
      {
        id: "dv-b1", dossier_id: "do-b", numero: "DV-2026-0152-1", formule: "Porte à porte international",
        lignes: [
          { libelle: "Emballage et chargement à Marseille", detail: "45 m³ · équipe de 5", montant_ht: 2400 },
          { libelle: "Conteneur 40' dédié Fos-sur-Mer → Montréal", montant_ht: 5800 },
          { libelle: "Formalités douanières France et Canada", montant_ht: 650 },
          { libelle: "Livraison et installation à Montréal", montant_ht: 1450 },
        ],
        inclus: ["Emballage export", "Conteneur dédié", "Douane", "Livraison à domicile"],
        montant_ht: 10300, montant_ttc: 12360, arrhes_pourcentage: 30, statut: "envoye",
        emis_le: "2026-08-28", valide_jusqu_au: "2026-09-28", accepte_le: null,
      },
      {
        id: "dv-b0", dossier_id: "do-b", numero: "DV-2026-0152-0", formule: "Groupage international",
        lignes: [{ libelle: "Groupage maritime Marseille → Montréal", detail: "45 m³ · délai 10 à 14 semaines", montant_ht: 7900 }],
        inclus: [],
        montant_ht: 7900, montant_ttc: 9480, arrhes_pourcentage: 30, statut: "refuse",
        emis_le: "2026-08-26", valide_jusqu_au: "2026-09-26", accepte_le: null,
      },
      {
        id: "dv-c1", dossier_id: "do-c", numero: "DV-2026-0139-1", formule: "Mobilité collaborateur",
        lignes: [{ libelle: "Déménagement Nantes → Bordeaux", detail: "28 m³ · prise en charge employeur", montant_ht: 2300 }],
        inclus: [],
        montant_ht: 2300, montant_ttc: 2760, arrhes_pourcentage: 0, statut: "accepte",
        emis_le: "2026-08-12", valide_jusqu_au: "2026-09-12", accepte_le: "2026-08-14",
      },
      {
        id: "dv-d1", dossier_id: "do-d", numero: "DV-2024-0311-1", formule: "Essentielle",
        lignes: [{ libelle: "Déménagement Lille → Paris", detail: "24 m³ · 2 jours", montant_ht: 1650 }],
        inclus: [],
        montant_ht: 1650, montant_ttc: 1980, arrhes_pourcentage: 30, statut: "accepte",
        emis_le: "2024-04-22", valide_jusqu_au: "2024-05-22", accepte_le: "2024-04-25",
      },
      {
        id: "dv-k1", dossier_id: "do-k", numero: "DV-2026-0166-1", formule: "Standard",
        lignes: [
          { libelle: "Transport, chargement et livraison", montant_ht: 1450 },
          { libelle: "Démontage / remontage du mobilier", montant_ht: 150 },
          { libelle: "Emballage des objets fragiles", montant_ht: 166.67 },
        ],
        inclus: [],
        montant_ht: 1766.67, montant_ttc: 2120, arrhes_pourcentage: 30, statut: "accepte",
        emis_le: "2026-08-14", valide_jusqu_au: "2026-10-13", accepte_le: "2026-08-20",
      },
    ],

    factures: [
      { id: "fa-a1", dossier_id: "do-a", devis_id: "dv-a1", numero: "FA-2026-0412", type: "arrhes", libelle: "Arrhes 30 % — devis DV-2026-0147-1", montant_ttc: 943.2, statut: "payee", emise_le: "2026-08-24", echeance: "2026-08-31", periode: null, payee_le: "2026-08-25", paiement_ref: "SIM-7F3A21" },
      { id: "fa-a2", dossier_id: "do-a", devis_id: "dv-a1", numero: "FA-2026-0468", type: "solde", libelle: "Solde du déménagement Paris → Lyon", montant_ttc: 2200.8, statut: "a_payer", emise_le: "2026-09-10", echeance: "2026-10-07", periode: null, payee_le: null, paiement_ref: null },
      { id: "fa-c1", dossier_id: "do-c", devis_id: "dv-c1", numero: "FA-2026-0455", type: "solde", libelle: "Déménagement collaborateur Nantes → Bordeaux", montant_ttc: 2760, statut: "a_payer", emise_le: "2026-09-01", echeance: "2026-10-30", periode: null, payee_le: null, paiement_ref: null },
      { id: "fa-d1", dossier_id: "do-d", devis_id: "dv-d1", numero: "FA-2024-0188", type: "arrhes", libelle: "Arrhes 30 % — devis DV-2024-0311-1", montant_ttc: 594, statut: "payee", emise_le: "2024-04-25", echeance: "2024-05-02", periode: null, payee_le: "2024-04-26", paiement_ref: "SIM-19C0E4" },
      { id: "fa-d2", dossier_id: "do-d", devis_id: "dv-d1", numero: "FA-2024-0231", type: "solde", libelle: "Solde du déménagement Lille → Paris", montant_ttc: 1386, statut: "payee", emise_le: "2024-06-01", echeance: "2024-06-10", periode: null, payee_le: "2024-06-08", paiement_ref: "SIM-5B77D0" },
      { id: "fa-d3", dossier_id: "do-d", devis_id: null, numero: "FA-2024-0266", type: "garde_meubles", libelle: "Garde-meubles — box 6 m³", montant_ttc: 89, statut: "payee", emise_le: "2024-07-01", echeance: "2024-07-10", periode: "2024-07", payee_le: "2024-07-04", paiement_ref: "SIM-A0D211" },
      { id: "fa-k1", dossier_id: "do-k", devis_id: "dv-k1", numero: "FA-2026-0470", type: "arrhes", libelle: "Arrhes 30 %", montant_ttc: 636, statut: "payee", emise_le: "2026-08-20", echeance: "2026-08-20", periode: null, payee_le: "2026-08-20", paiement_ref: "SIM-3C81F2" },
      { id: "fa-k2", dossier_id: "do-k", devis_id: "dv-k1", numero: "FA-2026-0471", type: "solde", libelle: "Solde du déménagement", montant_ttc: 1484, statut: "payee", emise_le: "2026-09-01", echeance: "2026-09-01", periode: null, payee_le: "2026-09-03", paiement_ref: "HORS-LIGNE" },
    ],

    documents: [
      { id: "doc-a1", dossier_id: "do-a", categorie: "assurance", libelle: "Attestation d'assurance", source: "equipe", chemin: "fichiers/do-a/attestation-assurance.pdf", nom_fichier: "attestation-assurance.pdf", taille_octets: 184320, mime: "application/pdf", requirement_id: null, created_by: "eq-nadia", created_at: "2026-09-09T10:15:00.000Z" },
      { id: "doc-a3", dossier_id: "do-a", categorie: "devis", libelle: "Devis signé · DV-2026-0147-1", source: "equipe", chemin: "fichiers/do-a/devis-signe.pdf", nom_fichier: "devis-signe.pdf", taille_octets: 96200, mime: "application/pdf", requirement_id: null, created_by: "eq-nadia", created_at: "2026-08-24T18:40:00.000Z" },
      { id: "doc-a2", dossier_id: "do-a", categorie: "identite", libelle: "Pièce d'identité", source: "client", chemin: "fichiers/do-a/cni-dumont.pdf", nom_fichier: "cni-dumont.pdf", taille_octets: 402110, mime: "application/pdf", requirement_id: "rq-id", created_by: "cl-dumont", created_at: "2026-08-27T19:02:00.000Z" },
      { id: "doc-b1", dossier_id: "do-b", categorie: "douane", libelle: "Guide des formalités douanières · Canada", source: "equipe", chemin: "fichiers/do-b/guide-douane-canada.pdf", nom_fichier: "guide-douane-canada.pdf", taille_octets: 201004, mime: "application/pdf", requirement_id: null, created_by: "eq-nadia", created_at: "2026-09-08T16:40:00.000Z" },
      { id: "doc-b2", dossier_id: "do-b", categorie: "identite", libelle: "Pièce d'identité", source: "client", chemin: "fichiers/do-b/passeport-roussel.pdf", nom_fichier: "passeport-roussel.pdf", taille_octets: 350877, mime: "application/pdf", requirement_id: "rq-id", created_by: "cl-roussel", created_at: "2026-09-02T08:11:00.000Z" },
      { id: "doc-b3", dossier_id: "do-b", categorie: "pays", libelle: "Passeport de chaque membre du foyer", source: "client", chemin: "fichiers/do-b/passeports-foyer.pdf", nom_fichier: "passeports-foyer.pdf", taille_octets: 812004, mime: "application/pdf", requirement_id: "rq-ca-passeport", created_by: "cl-roussel", created_at: "2026-09-02T08:14:00.000Z" },
      { id: "doc-b4", dossier_id: "do-b", categorie: "pays", libelle: "Permis de travail", source: "client", chemin: "fichiers/do-b/permis-travail.pdf", nom_fichier: "permis-travail.pdf", taille_octets: 264500, mime: "application/pdf", requirement_id: "rq-ca-permis", created_by: "cl-roussel", created_at: "2026-09-03T21:30:00.000Z" },
      { id: "doc-c1", dossier_id: "do-c", categorie: "assurance", libelle: "Attestation d'assurance", source: "equipe", chemin: "fichiers/do-c/attestation-assurance.pdf", nom_fichier: "attestation-assurance.pdf", taille_octets: 184320, mime: "application/pdf", requirement_id: null, created_by: "eq-marc", created_at: "2026-08-20T11:00:00.000Z" },
      { id: "doc-c2", dossier_id: "do-c", categorie: "identite", libelle: "Pièce d'identité", source: "client", chemin: "fichiers/do-c/cni-collaborateur.pdf", nom_fichier: "cni-collaborateur.pdf", taille_octets: 298700, mime: "application/pdf", requirement_id: "rq-id", created_by: "cl-atlantique", created_at: "2026-08-21T09:40:00.000Z" },
      { id: "doc-d1", dossier_id: "do-d", categorie: "transport", libelle: "Lettre de voiture signée", source: "equipe", chemin: "fichiers/do-d/lettre-de-voiture.pdf", nom_fichier: "lettre-de-voiture.pdf", taille_octets: 156000, mime: "application/pdf", requirement_id: null, created_by: "eq-nadia", created_at: "2024-06-13T18:00:00.000Z" },
      { id: "doc-d2", dossier_id: "do-d", categorie: "identite", libelle: "Pièce d'identité", source: "client", chemin: "fichiers/do-d/cni-dumont.pdf", nom_fichier: "cni-dumont.pdf", taille_octets: 402110, mime: "application/pdf", requirement_id: "rq-id", created_by: "cl-dumont", created_at: "2024-05-02T10:00:00.000Z" },
      { id: "doc-j1", dossier_id: "do-j", categorie: "identite", libelle: "Pièce d'identité", source: "client", chemin: "fichiers/do-j/cni-lefort.pdf", nom_fichier: "cni-lefort.pdf", taille_octets: 312400, mime: "application/pdf", requirement_id: "rq-id", created_by: "cl-lefort", created_at: "2026-09-02T19:10:00.000Z" },
      { id: "doc-j2", dossier_id: "do-j", categorie: "segment", libelle: "Ordre de mutation", source: "client", chemin: "fichiers/do-j/ordre-mutation.pdf", nom_fichier: "ordre-mutation.pdf", taille_octets: 228900, mime: "application/pdf", requirement_id: "rq-mil-mutation", created_by: "cl-lefort", created_at: "2026-09-02T19:12:00.000Z" },
      { id: "doc-k1", dossier_id: "do-k", categorie: "identite", libelle: "Pièce d'identité", source: "client", chemin: "fichiers/do-k/cni-diallo.pdf", nom_fichier: "cni-diallo.pdf", taille_octets: 287300, mime: "application/pdf", requirement_id: "rq-id", created_by: "cl-diallo", created_at: "2026-08-21T18:30:00.000Z" },
    ],

    acceptations: [
      { id: "ac-a-dv", dossier_id: "do-a", type: "devis", version_texte: "DV-2026-0147-1", objet: "DV-2026-0147-1", accepted_at: "2026-08-24T18:21:40.000Z", ip: "203.0.113.24", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" },
      { id: "ac-a-cgv", dossier_id: "do-a", type: "cgv", version_texte: "CGV-2026.1", accepted_at: "2026-08-24T18:22:10.000Z", ip: "203.0.113.24", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" },
      { id: "ac-a-rgpd", dossier_id: "do-a", type: "rgpd", version_texte: "RGPD-2026.1", accepted_at: "2026-08-24T18:22:31.000Z", ip: "203.0.113.24", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" },
      { id: "ac-b-cgv", dossier_id: "do-b", type: "cgv", version_texte: "CGV-2026.1", accepted_at: "2026-09-08T12:01:00.000Z", ip: "198.51.100.7", user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" },
      { id: "ac-b-rgpd", dossier_id: "do-b", type: "rgpd", version_texte: "RGPD-2026.1", accepted_at: "2026-09-08T12:01:20.000Z", ip: "198.51.100.7", user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" },
      { id: "ac-b-cl", dossier_id: "do-b", type: "conditions_livraison", version_texte: "COND-LIV-2026.1", accepted_at: "2026-09-09T20:15:00.000Z", ip: "198.51.100.7", user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" },
      { id: "ac-b-dv", dossier_id: "do-b", type: "declaration_valeurs", version_texte: "DECL-VAL-2026.1", accepted_at: "2026-09-09T21:00:00.000Z", ip: "198.51.100.7", user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" },
      { id: "ac-c-cgv", dossier_id: "do-c", type: "cgv", version_texte: "CGV-2026.1", accepted_at: "2026-08-15T09:00:00.000Z", ip: "192.0.2.50", user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      { id: "ac-c-rgpd", dossier_id: "do-c", type: "rgpd", version_texte: "RGPD-2026.1", accepted_at: "2026-08-15T09:00:40.000Z", ip: "192.0.2.50", user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      { id: "ac-c-cl", dossier_id: "do-c", type: "conditions_livraison", version_texte: "COND-LIV-2026.1", accepted_at: "2026-08-22T10:30:00.000Z", ip: "192.0.2.50", user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      { id: "ac-d-cgv", dossier_id: "do-d", type: "cgv", version_texte: "CGV-2024.1", accepted_at: "2024-04-25T20:00:00.000Z", ip: "203.0.113.24", user_agent: "Mozilla/5.0 (iPhone)" },
      { id: "ac-d-rgpd", dossier_id: "do-d", type: "rgpd", version_texte: "RGPD-2024.1", accepted_at: "2024-04-25T20:00:30.000Z", ip: "203.0.113.24", user_agent: "Mozilla/5.0 (iPhone)" },
      { id: "ac-d-cl", dossier_id: "do-d", type: "conditions_livraison", version_texte: "COND-LIV-2024.1", accepted_at: "2024-05-30T19:00:00.000Z", ip: "203.0.113.24", user_agent: "Mozilla/5.0 (iPhone)" },
      { id: "ac-d-dv", dossier_id: "do-d", type: "declaration_valeurs", version_texte: "DECL-VAL-2024.1", accepted_at: "2024-05-28T19:00:00.000Z", ip: "203.0.113.24", user_agent: "Mozilla/5.0 (iPhone)" },
      { id: "ac-j-cgv", dossier_id: "do-j", type: "cgv", version_texte: "CGV-2026.1", accepted_at: "2026-09-02T19:05:00.000Z", ip: "198.51.100.42", user_agent: "Mozilla/5.0 (Linux; Android 16)" },
      { id: "ac-j-rgpd", dossier_id: "do-j", type: "rgpd", version_texte: "RGPD-2026.1", accepted_at: "2026-09-02T19:05:20.000Z", ip: "198.51.100.42", user_agent: "Mozilla/5.0 (Linux; Android 16)" },
      { id: "ac-k-dv", dossier_id: "do-k", type: "devis", version_texte: "DV-2026-0166-1", objet: "DV-2026-0166-1", accepted_at: "2026-08-20T16:58:00.000Z", ip: "192.0.2.77", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" },
      { id: "ac-k-cgv", dossier_id: "do-k", type: "cgv", version_texte: "CGV-2026.1", accepted_at: "2026-08-20T17:01:00.000Z", ip: "192.0.2.77", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" },
      { id: "ac-k-rgpd", dossier_id: "do-k", type: "rgpd", version_texte: "RGPD-2026.1", accepted_at: "2026-08-20T17:01:15.000Z", ip: "192.0.2.77", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" },
      { id: "ac-k-cl", dossier_id: "do-k", type: "conditions_livraison", version_texte: "COND-LIV-2026.1", accepted_at: "2026-08-28T20:40:00.000Z", ip: "192.0.2.77", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" },
    ],

    declarations_valeurs: [
      {
        id: "dv-val-b", dossier_id: "do-b", statut: "soumise", soumise_at: "2026-09-09T21:00:00.000Z", total: 18450,
        contenu: {
          declarant_nom: "Julien Roussel", declarant_qualite: "Propriétaire des biens", lieu: "Marseille", date: "2026-09-09",
          objets: [
            { categorie: "Mobilier", designation: "Canapé d'angle", quantite: 1, valeur_unitaire: 1800 },
            { categorie: "Électroménager", designation: "Réfrigérateur américain", quantite: 1, valeur_unitaire: 1400 },
            { categorie: "Hi-fi, vidéo, informatique", designation: "Ordinateurs et écrans", quantite: 3, valeur_unitaire: 1250 },
            { categorie: "Objets de valeur", designation: "Piano droit", quantite: 1, valeur_unitaire: 6500 },
            { categorie: "Linge et vêtements", designation: "Garde-robe complète", quantite: 1, valeur_unitaire: 5000 },
          ],
        },
      },
      {
        id: "dv-val-d", dossier_id: "do-d", statut: "soumise", soumise_at: "2024-05-28T19:00:00.000Z", total: 9800,
        contenu: {
          declarant_nom: "Claire Dumont", declarant_qualite: "Propriétaire des biens", lieu: "Lille", date: "2024-05-28",
          objets: [
            { categorie: "Mobilier", designation: "Mobilier de séjour", quantite: 1, valeur_unitaire: 4200 },
            { categorie: "Électroménager", designation: "Lave-linge et réfrigérateur", quantite: 2, valeur_unitaire: 700 },
            { categorie: "Linge et vêtements", designation: "Vêtements et linge de maison", quantite: 1, valeur_unitaire: 4200 },
          ],
        },
      },
    ],

    conditions_livraison: [
      { id: "cl-liv-b", dossier_id: "do-b", adresse_livraison: "2150 rue Saint-Denis, Montréal (QC) H2X 3K9", etage: 3, ascenseur: false, ascenseur_dimensions: null, escalier: "droit", distance_portage_m: 15, acces_poids_lourd: "oui", stationnement: "autorisation", particularites_rue: ["Aucune"], monte_meuble: "a_evaluer", horaires_restreints: "Pas de livraison avant 8 h (règlement municipal)", photos: [], commentaire: "Escalier extérieur typique du Plateau, prévoir le monte-meuble.", valide_at: "2026-09-09T20:15:00.000Z" },
      { id: "cl-liv-c", dossier_id: "do-c", adresse_livraison: "22 cours de l'Intendance, 33000 Bordeaux", etage: 2, ascenseur: true, ascenseur_dimensions: { largeur: 100, profondeur: 130, hauteur: 210 }, escalier: "droit", distance_portage_m: 20, acces_poids_lourd: "non", stationnement: "autorisation", particularites_rue: ["Rue piétonne"], monte_meuble: "non", horaires_restreints: "Zone piétonne : accès véhicules de 6 h à 11 h", photos: [], commentaire: null, valide_at: "2026-08-22T10:30:00.000Z" },
      { id: "cl-liv-d", dossier_id: "do-d", adresse_livraison: "12 rue de la Roquette, 75011 Paris", etage: 4, ascenseur: true, ascenseur_dimensions: { largeur: 80, profondeur: 100, hauteur: 200 }, escalier: "droit", distance_portage_m: 10, acces_poids_lourd: "oui", stationnement: "autorisation", particularites_rue: ["Aucune"], monte_meuble: "non", horaires_restreints: null, photos: [], commentaire: null, valide_at: "2024-05-30T19:00:00.000Z" },
      { id: "cl-liv-k", dossier_id: "do-k", adresse_livraison: "18 avenue Paul-Vaillant-Couturier, 94400 Vitry-sur-Seine", etage: 6, ascenseur: true, ascenseur_dimensions: { largeur: 100, profondeur: 120, hauteur: 210 }, escalier: "droit", distance_portage_m: 25, acces_poids_lourd: "oui", stationnement: "reserve_client", particularites_rue: ["Aucune"], monte_meuble: "non", horaires_restreints: null, photos: [], commentaire: "Badge de la résidence remis par le gardien.", valide_at: "2026-08-28T20:40:00.000Z" },
    ],

    livraisons_cartons: [
      { id: "lc-a", dossier_id: "do-a", date_samedi: "2026-09-26", adresse: "12 rue de la Roquette, 75011 Paris", complement: "Bâtiment B, 4e étage", code_acces: "4721A", contact_nom: "Claire Dumont", contact_tel: "06 12 34 56 78", nb_cartons: 50, ordre_passage: null, creneau_debut: null, creneau_fin: null, lat: 48.854, lng: 2.3727, statut: "confirmee", creneau_envoye_le: null, created_at: "2026-09-05T18:00:00.000Z" },
      { id: "lc-e", dossier_id: "do-e", date_samedi: "2026-09-26", adresse: "8 avenue de Paris, 94300 Vincennes", complement: null, code_acces: "B1290", contact_nom: "Hugo Garnier", contact_tel: "06 34 56 78 90", nb_cartons: 35, ordre_passage: null, creneau_debut: null, creneau_fin: null, lat: 48.8476, lng: 2.433, statut: "confirmee", creneau_envoye_le: null, created_at: "2026-09-06T10:00:00.000Z" },
      { id: "lc-f", dossier_id: "do-f", date_samedi: "2026-09-26", adresse: "15 rue de Paris, 93100 Montreuil", complement: "Au fond de la cour", code_acces: null, contact_nom: "Léa Benoît", contact_tel: "06 45 67 89 01", nb_cartons: null, ordre_passage: null, creneau_debut: null, creneau_fin: null, lat: 48.8565, lng: 2.437, statut: "demandee", creneau_envoye_le: null, created_at: "2026-09-08T12:00:00.000Z" },
      { id: "lc-g", dossier_id: "do-g", date_samedi: "2026-09-26", adresse: "25 rue Houdan, 92330 Sceaux", complement: null, code_acces: "0815", contact_nom: "Antoine Fabre", contact_tel: "06 56 78 90 12", nb_cartons: 60, ordre_passage: null, creneau_debut: null, creneau_fin: null, lat: 48.7784, lng: 2.2905, statut: "confirmee", creneau_envoye_le: null, created_at: "2026-09-08T15:00:00.000Z" },
      { id: "lc-h", dossier_id: "do-h", date_samedi: "2026-09-26", adresse: "40 boulevard de la République, 92210 Saint-Cloud", complement: "Interphone Marchal", code_acces: null, contact_nom: "Inès Marchal", contact_tel: "06 67 89 01 23", nb_cartons: null, ordre_passage: null, creneau_debut: null, creneau_fin: null, lat: 48.844, lng: 2.218, statut: "demandee", creneau_envoye_le: null, created_at: "2026-09-09T09:00:00.000Z" },
      { id: "lc-i", dossier_id: "do-i", date_samedi: "2026-09-26", adresse: "3 rue du Château, 92200 Neuilly-sur-Seine", complement: "Gardien sur place", code_acces: "2468", contact_nom: "Karim Perrin", contact_tel: "06 78 90 12 34", nb_cartons: 45, ordre_passage: null, creneau_debut: null, creneau_fin: null, lat: 48.8846, lng: 2.2697, statut: "confirmee", creneau_envoye_le: null, created_at: "2026-09-10T08:30:00.000Z" },
      { id: "lc-d", dossier_id: "do-d", date_samedi: "2024-05-25", adresse: "9 rue de la Monnaie, 59800 Lille", complement: null, code_acces: null, contact_nom: "Claire Dumont", contact_tel: "06 12 34 56 78", nb_cartons: 40, ordre_passage: 1, creneau_debut: "09:00", creneau_fin: "10:00", lat: 50.6405, lng: 3.0626, statut: "livree", creneau_envoye_le: "2024-05-24T18:00:00.000Z", created_at: "2024-05-10T10:00:00.000Z" },
    ],

    sav_declarations: [
      { id: "sav-d1", dossier_id: "do-d", numero: "SAV-2024-041", reserves_emises: false, date_constat: "2024-06-15", objets: "Commode en chêne", description: "Rayure profonde sur le plateau et poignée arrachée, constatées au déballage deux jours après la livraison.", photos: [], statut: "en_analyse", created_at: "2024-06-15T11:20:00.000Z" },
    ],

    notifications: [
      { id: "no-seed-1", dossier_id: "do-a", canal: "email", modele: "document_depose", destinataire: "claire.dumont@example.com", sujet: "Un nouveau document a été déposé dans votre espace client", payload: { salutation: "Madame Dumont", document: "Attestation d'assurance", chemin: "/espace-client/BD-2026-0147/documents#equipe", signature: { nom: "Nadia Berthier", role: "Votre contact", telephone: "01 84 60 12 30" } }, statut: "journalisee", sent_at: "2026-09-09T10:15:05.000Z" },
      { id: "no-seed-2", dossier_id: "do-b", canal: "email", modele: "document_depose", destinataire: "julien.roussel@example.com", sujet: "Un nouveau document a été déposé dans votre espace client", payload: { salutation: "Monsieur Roussel", document: "Guide des formalités douanières · Canada", chemin: "/espace-client/BD-2026-0152/documents#equipe", signature: { nom: "Nadia Berthier", role: "Votre contact", telephone: "01 84 60 12 30" } }, statut: "journalisee", sent_at: "2026-09-08T16:40:05.000Z" },
      { id: "no-seed-3", dossier_id: "do-d", canal: "email", modele: "demande_avis", destinataire: "claire.dumont@example.com", sujet: "Votre déménagement Lille → Paris : votre avis compte", payload: { salutation: "Madame Dumont", trajet: "Lille → Paris", signature: { nom: "Nadia Berthier", role: "Votre contact", telephone: "01 84 60 12 30" } }, statut: "journalisee", sent_at: "2024-06-13T18:05:00.000Z" },
    ],
  };

  return decaler(d, semaines * 7);
}
