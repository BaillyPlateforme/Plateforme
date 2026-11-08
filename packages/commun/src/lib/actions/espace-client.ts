"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientParEmail, consommerLien, envoyerLienAuClient, estClientDemo } from "@/lib/espace-client/acces";
import { AdresseDejaPrise } from "@/lib/espace-client/comptes";
import { bornesCartons, CAPACITE_SAMEDI } from "@/lib/espace-client/cartons";
import { estDemo, profilsDemoOuverts } from "@/lib/espace-client/config";
import { depot, maintenant, nouvelId } from "@/lib/espace-client/depot";
import { cheminFichier, deposerFichier, octets } from "@/lib/espace-client/fichiers";
import { aujourdhui, dateLongue, jourLong, joursRestants, nomClient, salutation } from "@/lib/espace-client/format";
import { conseillerDe, signatureDe } from "@/lib/espace-client/lectures";
import { estProfilDemo } from "@/lib/espace-client/seed";
import { notifier } from "@/lib/espace-client/notifier";
import { alerterEquipe, champDesabonnement, destinatairesAlerte, noterEvenement } from "@/lib/alertes-equipe";
import { paiementSimule, traiterEvenement } from "@/lib/espace-client/paiement";
import { prestataire } from "@/lib/espace-client/stripe";
import { stripeConfigure } from "@/lib/espace-client/stripe-config";
import { arrhesPayees, livraisonEffectuee, montantArrhes, requirementsApplicables } from "@/lib/espace-client/progression";
import { noterDansLeCrm, signerDevisCrm } from "@/lib/espace-client/crm";
import { segmentDe } from "@/lib/espace-client/segments";
import { occupationSamedis } from "@/lib/espace-client/samedi";
import {
  acceptationsSchema, avarieSchema, conditionsLivraisonSchema, connexionSchema, declarationValeursSchema, erreursDe,
  ficheCartonsSchema, lireAcceptations, lireAvarie, lireConditions, lireDeclaration, lireFicheCartons,
  TYPES_DOCUMENTS, verifierFichier, verifierPhotos, type Erreurs,
} from "@/lib/espace-client/schemas";
import { marqueEquipe, tracerEdition } from "@/lib/espace-client/edition";
import { editionEquipe, exigerClientPourAgir, fermerSession, lireDonneesClient, ouvrirSessionBase, ouvrirSessionDemo, refuserEnApercu } from "@/lib/espace-client/session";
import { VERSIONS } from "@/lib/espace-client/textes";
import type { Acceptation, Client, PieceJointe, TypeAcceptation } from "@/lib/espace-client/types";
import { TEL_AGENCE } from "@/lib/messaging";

/*
 * Les actions du client. Une action serveur répond depuis n'importe quelle
 * page : chacune refait donc elle-même tout le chemin —
 *   1. la session (Supabase Auth, inscrite au registre ec_sessions),
 *   2. la propriété du dossier : il est cherché dans ce que la RLS rend au
 *      client, et la référence doit être à lui,
 *   3. le schéma (le même que celui du navigateur),
 *   4. l'écriture, par la clé de service, puis le message éventuel.
 * La clé publique, elle, n'écrit rien : la base le refuse.
 *
 * Pendant un aperçu de l'équipe (session.ts) :
 *   - en lecture, toutes refusent, d'entrée : celles du client par
 *     `exigerClientPourAgir` (dans `contexte`), les autres par
 *     `refuserEnApercu` ;
 *   - en édition (un super admin), les gestes du client passent, tracés
 *     comme ceux de l'équipe (edition.ts) : ligne au fil d'activité du CRM,
 *     marque dans l'enregistrement quand il peut la porter, et pas d'accusé
 *     de réception au client comme s'il avait agi. Restent refusés, par
 *     `refuserEnApercu` en tête : la connexion et les liens (un lien du
 *     client ne doit jamais être consommé, ni une session ouverte, depuis le
 *     navigateur de l'équipe), les paiements (l'équipe enregistre un
 *     règlement dans le CRM, elle ne paie pas au nom du client), la
 *     signature d'un devis et l'acceptation des CGV et du RGPD (un
 *     consentement ne se donne pas pour autrui), et les messages écrits au
 *     conseiller au nom du client (la discussion, actions/discussion.ts :
 *     l'équipe y répond en son nom, depuis le CRM).
 */

export type EtatFormulaire = { ok?: boolean; erreurs?: Erreurs; message?: string };

async function contexte(reference: string) {
  const client = await exigerClientPourAgir();
  const d = await lireDonneesClient();
  const dossier = d.dossiers.find((x) => x.reference === reference && x.client_id === client.id);
  if (!dossier) throw new Error("Dossier introuvable.");
  return { client, dossier, conseiller: conseillerDe(d, client.conseiller_id), d };
}

/**
 * D'où vient l'acceptation : adresse IP et navigateur, relevés par le
 * serveur. En édition par l'équipe, le navigateur porte la marque de l'équipe
 * (qui, son adresse) : l'acceptation est la sienne, pas celle du client.
 */
async function traces() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
  const navigateur = h.get("user-agent") ?? "inconnu";
  const e = await editionEquipe();
  return { ip, user_agent: (e ? `${marqueEquipe(e)} · ${navigateur}` : navigateur).slice(0, 400) };
}

function acceptation(dossierId: string, type: Exclude<TypeAcceptation, "devis">, t: { ip: string; user_agent: string }): Acceptation {
  return { id: nouvelId(), dossier_id: dossierId, type, version_texte: VERSIONS[type], accepted_at: maintenant(), objet: null, ...t };
}

const rafraichir = (reference: string) => revalidatePath(`/espace-client/${reference}`, "layout");

const fichiersDe = (fd: FormData, cle: string) => fd.getAll(cle).filter((f): f is File => f instanceof File && f.size > 0);

async function deposerPhotos(dossierId: string, rubrique: string, fichiers: File[]): Promise<PieceJointe[]> {
  const out: PieceJointe[] = [];
  for (const f of fichiers) {
    const chemin = cheminFichier(dossierId, f.name, rubrique);
    await deposerFichier(chemin, await octets(f), f.type);
    out.push({ id: nouvelId(), chemin, nom: f.name, taille: f.size, mime: f.type });
  }
  return out;
}

// --- Connexion ---------------------------------------------------------------------------------

/** Un profil fictif qui peut s'ouvrir sans boîte mail : raccourcis ouverts, client de démonstration. */
async function profilDemo(email: string): Promise<Client | null> {
  if (!profilsDemoOuverts() || !estProfilDemo(email)) return null;
  const client = await clientParEmail(email);
  return client && estClientDemo(client) ? client : null;
}

export async function demanderLien(_: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  await refuserEnApercu();
  const r = connexionSchema.safeParse({ email: String(fd.get("email") ?? "").trim() });
  if (!r.success) return { erreurs: erreursDe(r.error) };
  let apercu = "";
  try {
    const client = await clientParEmail(r.data.email);
    const n = client ? await envoyerLienAuClient(client) : null;
    // En démonstration seulement, et pour un profil fictif : la page ouvre l'e-mail « reçu ».
    if (n && client && profilsDemoOuverts() && estClientDemo(client) && estProfilDemo(client.email)) apercu = `&apercu=${n.id}`;
  } catch (e) {
    // Une adresse prise par un compte de l'équipe : la même réponse qu'une adresse inconnue.
    if (!(e instanceof AdresseDejaPrise)) {
      // La base ne répond pas : le dire sous le champ, plutôt qu'une page d'erreur.
      return { erreurs: { email: `Le service est momentanément indisponible. Réessayez dans quelques instants, ou appelez l'agence au ${TEL_AGENCE}.` } };
    }
  }
  // La même réponse, que l'adresse soit connue ou non : la page ne dit pas qui est client.
  redirect(`/espace-client/connexion?envoye=1&email=${encodeURIComponent(r.data.email)}${apercu}`);
}

/** Ouvre la session du client d'un lien qu'on vient de consommer, puis l'emmène à son dossier. */
async function entrer(jeton: string, destination?: string | null): Promise<never> {
  await refuserEnApercu();
  const r = await consommerLien(jeton);
  if (!r.ok) redirect(`/espace-client/connexion?erreur=${r.raison}`);
  if (estDemo()) await ouvrirSessionDemo(r.client);
  else {
    const o = await ouvrirSessionBase(r.client, jeton, r.lien.auth_user_id!, await traces());
    if (!o.ok) redirect(`/espace-client/connexion?erreur=${o.raison}`);
  }
  const vise = destination ?? r.lien.reference;
  // Le dossier visé n'est ouvert que s'il est bien au client : la page le revérifie de toute façon.
  redirect(vise ? `/espace-client/${encodeURIComponent(vise)}?ok=bienvenue` : "/espace-client?ok=bienvenue");
}

/** Le clic « Accéder à mon espace » de la page d'arrivée : c'est lui qui consomme le lien. */
export async function entrerAvecJeton(fd: FormData) {
  await refuserEnApercu();
  await entrer(String(fd.get("token_hash") ?? ""));
}

/**
 * Démonstration seulement : entrer comme l'un des profils A à D. Le chemin
 * est le vrai — un lien est émis et journalisé, puis consommé, et la session
 * ouverte comme au clic « Accéder » — sans passer par la boîte de réception.
 */
export async function entrerDemo(fd: FormData) {
  await refuserEnApercu();
  const client = await profilDemo(String(fd.get("email") ?? ""));
  if (!client) redirect("/espace-client/connexion");
  const reference = String(fd.get("reference") ?? "") || null;
  const n = await envoyerLienAuClient(client, { reference });
  const jeton = new URL(String(n.payload.lien)).searchParams.get("token_hash");
  if (!jeton) redirect("/espace-client/connexion");
  await entrer(jeton, reference);
}

/** Démonstration seulement : émettre le lien d'un profil et ouvrir l'e-mail « reçu ». */
export async function voirEmailDemo(fd: FormData) {
  await refuserEnApercu();
  const client = await profilDemo(String(fd.get("email") ?? ""));
  if (!client) redirect("/espace-client/connexion");
  const n = await envoyerLienAuClient(client, { reference: String(fd.get("reference") ?? "") || null });
  redirect(`/espace-client/apercu-email/${n.id}`);
}

/** Démonstration en mémoire seulement : tout revient à l'état de départ. */
export async function reinitialiserDemo() {
  await refuserEnApercu();
  if (!estDemo()) return;
  await depot().reinitialiser();
  await fermerSession();
  revalidatePath("/espace-client", "layout");
  redirect("/espace-client/connexion?reinitialise=1");
}

// --- Mes documents -----------------------------------------------------------------------------

/**
 * Un avis à l'équipe dont le texte vient du code (cartons, avarie, service) :
 * à ses abonnés (Relances › Alertes de l'équipe), chacun avec sa clé et son
 * lien de désabonnement ; sans abonnements lisibles, comme avant
 * (ESPACE_CLIENT_EMAIL_EQUIPE, sinon le conseiller du dossier).
 */
async function avertirEquipe(alerte: string, evenement: string, conseiller: string, m: Omit<Parameters<typeof notifier.envoyer>[0], "destinataire">) {
  const { destinataires } = await destinatairesAlerte(alerte, { conseillers: [conseiller] });
  for (const a of destinataires) {
    await notifier.envoyer({ ...m, destinataire: a.email, payload: { ...m.payload, ...champDesabonnement(a) } }, { cle: `alerte:${alerte}:${evenement}:${a.email}` });
  }
  await noterEvenement(alerte, evenement, String(m.payload.reference ?? "") || null, destinataires.length, destinataires.length ? `${destinataires.length} destinataire(s)` : "Aucun abonné : rien n'est parti.");
}

/** Alerte « pièces complètes » : la pièce déposée était la dernière obligatoire qui manquait. */
async function alerterSiPiecesCompletes(c: Awaited<ReturnType<typeof contexte>>, piece: { id: string; libelle: string; obligatoire: boolean }) {
  const { client, dossier, d, conseiller } = c;
  if (!piece.obligatoire) return;
  const recues = new Set(d.documents.filter((x) => x.dossier_id === dossier.id).map((x) => x.requirement_id));
  const manquantes = requirementsApplicables(dossier, client.type, d.document_requirements).filter((r) => r.obligatoire && !recues.has(r.id));
  if (manquantes.length !== 1 || manquantes[0].id !== piece.id) return;
  await alerterEquipe("pieces_completes", {
    evenement: `dossier-${dossier.id}`, reference: dossier.reference, origine: "espace_client", conseillers: [conseiller.email],
    vars: { client: nomClient(client), reference: dossier.reference, piece: piece.libelle },
    lien: typeof dossier.crm_dossier_id === "number" ? { chemin: `/dossiers/${dossier.crm_dossier_id}`, libelle: "Ouvrir le dossier" } : null,
  });
}

export async function deposerPiece(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const ctx = await contexte(reference);
  const { client, dossier, d } = ctx;
  const f = fd.get("fichier");
  const fichier = f instanceof File ? f : null;
  const erreur = verifierFichier(fichier, TYPES_DOCUMENTS);
  if (erreur) return { erreurs: { fichier: erreur } };

  const requirementId = String(fd.get("requirement_id") ?? "") || null;
  const piece = requirementId ? requirementsApplicables(dossier, client.type, d.document_requirements).find((r) => r.id === requirementId) : null;
  if (requirementId && !piece) return { erreurs: { fichier: "Cette pièce n'est pas demandée pour votre dossier." } };
  const libelle = piece?.libelle ?? (String(fd.get("libelle") ?? "").trim().slice(0, 80) || "Document");

  const chemin = cheminFichier(dossier.id, fichier!.name);
  await deposerFichier(chemin, await octets(fichier!), fichier!.type);
  // En édition, la pièce reste celle du client (elle compte pour son dossier), déposée par l'équipe : `created_by` le dit.
  const edition = await editionEquipe();
  await depot().inserer("documents", {
    id: nouvelId(), dossier_id: dossier.id, categorie: piece?.pays ? "pays" : piece?.segment ? "segment" : piece ? "identite" : "autre", libelle, source: "client",
    chemin, nom_fichier: fichier!.name, taille_octets: fichier!.size, mime: fichier!.type, requirement_id: piece?.id ?? null,
    created_by: edition ? marqueEquipe(edition) : client.id, created_at: maintenant(),
  });
  await tracerEdition(dossier, `Pièce « ${libelle} » déposée`);
  if (piece) await alerterSiPiecesCompletes(ctx, piece);
  rafraichir(reference);
  redirect(`/espace-client/${reference}/documents?ok=piece#pieces`);
}

export async function enregistrerConditions(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { client, dossier, d, conseiller } = await contexte(reference);
  const existant = d.conditions_livraison.find((c) => c.dossier_id === dossier.id);
  if (existant?.valide_at) {
    return { message: "Vos conditions de livraison sont déjà validées : pour les modifier, contactez votre conseiller." };
  }
  const r = conditionsLivraisonSchema.safeParse(lireConditions(fd));
  const photos = fichiersDe(fd, "photos");
  const errPhotos = verifierPhotos(photos, { max: 6 });
  if (!r.success || errPhotos) return { erreurs: { ...(r.success ? {} : erreursDe(r.error)), ...(errPhotos ? { photos: errPhotos } : {}) } };

  const t = await traces();
  const pieces = await deposerPhotos(dossier.id, "acces", photos);
  const v = r.data;
  const ligne = {
    adresse_livraison: v.adresse_livraison,
    etage: v.etage,
    ascenseur: v.ascenseur,
    ascenseur_dimensions: v.ascenseur ? { largeur: Number(v.asc_largeur), profondeur: Number(v.asc_profondeur), hauteur: Number(v.asc_hauteur) } : null,
    escalier: v.escalier,
    distance_portage_m: v.distance_portage_m,
    acces_poids_lourd: v.acces_poids_lourd,
    stationnement: v.stationnement,
    particularites_rue: v.particularites_rue,
    monte_meuble: v.monte_meuble,
    horaires_restreints: v.horaires_restreints,
    commentaire: v.commentaire,
    photos: pieces,
    valide_at: maintenant(),
  };
  if (existant) await depot().modifier("conditions_livraison", existant.id, ligne, { valide_at: null });
  else await depot().inserer("conditions_livraison", { id: nouvelId(), dossier_id: dossier.id, ...ligne });
  await depot().inserer("acceptations", acceptation(dossier.id, "conditions_livraison", t));
  await tracerEdition(dossier, "Conditions de livraison validées");
  await alerterEquipe("conditions_validees", {
    evenement: `dossier-${dossier.id}-${ligne.valide_at}`, reference: dossier.reference, origine: "espace_client", conseillers: [conseiller.email],
    vars: { client: nomClient(client), reference: dossier.reference },
    lien: typeof dossier.crm_dossier_id === "number" ? { chemin: `/dossiers/${dossier.crm_dossier_id}`, libelle: "Ouvrir le dossier" } : null,
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}/documents?ok=conditions#conditions`);
}

export async function soumettreDeclaration(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { dossier, d } = await contexte(reference);
  const existante = d.declarations_valeurs.find((x) => x.dossier_id === dossier.id);
  if (existante?.statut === "soumise") {
    return { message: "Votre déclaration est déjà transmise : pour la modifier, contactez votre conseiller." };
  }
  const r = declarationValeursSchema.safeParse(lireDeclaration(fd));
  if (!r.success) return { erreurs: erreursDe(r.error) };
  const { declarant_nom, declarant_qualite, lieu, date, objets } = r.data;
  // En édition, la déclaration dit qui l'a saisie (dans son contenu, sans changer de schéma).
  const edition = await editionEquipe();
  const contenu = { declarant_nom, declarant_qualite, lieu, date, objets, ...(edition ? { saisie_equipe: { par: edition.par, email: edition.email, le: maintenant() } } : {}) };
  const total = Math.round(contenu.objets.reduce((n, o) => n + o.quantite * o.valeur_unitaire, 0) * 100) / 100;
  const t = await traces();
  const ligne = { contenu, total, statut: "soumise" as const, soumise_at: maintenant() };
  if (existante) await depot().modifier("declarations_valeurs", existante.id, ligne, { statut: "brouillon" });
  else await depot().inserer("declarations_valeurs", { id: nouvelId(), dossier_id: dossier.id, ...ligne });
  await depot().inserer("acceptations", acceptation(dossier.id, "declaration_valeurs", t));
  await tracerEdition(dossier, `Déclaration de valeurs transmise (${total} €)`);
  rafraichir(reference);
  redirect(`/espace-client/${reference}/documents?ok=valeurs#valeurs`);
}

export async function accepterConditionsGenerales(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  // Un consentement (CGV, RGPD) ne se donne pas pour autrui : refusé pendant tout aperçu, édition comprise.
  await refuserEnApercu();
  const { dossier, d } = await contexte(reference);
  const r = acceptationsSchema.safeParse(lireAcceptations(fd));
  if (!r.success) return { erreurs: erreursDe(r.error) };
  const t = await traces();
  const nouvelles = (["cgv", "rgpd"] as const)
    .filter((type) => !d.acceptations.some((a) => a.dossier_id === dossier.id && a.type === type && a.version_texte === VERSIONS[type]))
    .map((type) => acceptation(dossier.id, type, t));
  await depot().inserer("acceptations", nouvelles);
  rafraichir(reference);
  redirect(`/espace-client/${reference}/documents?ok=cgv#cgv`);
}

// --- Cartons -----------------------------------------------------------------------------------

export async function planifierCartons(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { client, dossier, conseiller, d } = await contexte(reference);
  if (dossier.statut === "termine") return { message: "Ce déménagement est terminé." };
  const r = ficheCartonsSchema(bornesCartons(dossier.periode_debut)).safeParse(lireFicheCartons(fd));
  if (!r.success) return { erreurs: erreursDe(r.error) };

  const existante = d.livraisons_cartons.find((l) => l.dossier_id === dossier.id && l.statut !== "livree");
  if (existante && joursRestants(existante.date_samedi) < 2) {
    return { message: "Votre livraison est trop proche pour être modifiée en ligne : appelez votre conseiller." };
  }
  const autres = (await occupationSamedis(r.data.date_samedi, r.data.date_samedi, existante?.id))[r.data.date_samedi] ?? 0;
  if (autres >= CAPACITE_SAMEDI) return { erreurs: { date_samedi: "Ce samedi vient d'être complet : choisissez-en un autre." } };

  const champs = { ...r.data, ordre_passage: null, creneau_debut: null, creneau_fin: null, creneau_envoye_le: null };
  if (existante) {
    const memeAdresse = existante.adresse === r.data.adresse;
    await depot().modifier("livraisons_cartons", existante.id, { ...champs, ...(memeAdresse ? {} : { lat: null, lng: null }) });
  } else {
    await depot().inserer("livraisons_cartons", {
      id: nouvelId(), dossier_id: dossier.id, ...champs, nb_cartons: null, lat: null, lng: null, statut: "demandee", created_at: maintenant(),
    });
  }
  if (dossier.cartons_non_necessaires) await depot().modifier("dossiers", dossier.id, { cartons_non_necessaires: false });
  await tracerEdition(dossier, `Livraison de cartons ${existante ? "modifiée" : "demandée"} (samedi ${r.data.date_samedi})`);

  // L'e-mail à l'équipe, pour qu'elle saisisse le nombre de cartons : à ses abonnés.
  await avertirEquipe("cartons_demandes", `${dossier.id}-${r.data.date_samedi}-${maintenant()}`, conseiller.email, {
    dossier_id: dossier.id,
    canal: "email",
    modele: "cartons_demandes_equipe",
    payload: {
      client: nomClient(client), reference: dossier.reference, jour: jourLong(r.data.date_samedi), adresse: r.data.adresse,
      contact: r.data.contact_nom, telephone_contact: r.data.contact_tel, modification: !!existante,
      chemin: `/dashboard/espace-client/cartons?samedi=${r.data.date_samedi}`, signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone },
    },
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}/cartons?ok=cartons`);
}

export async function pasBesoinDeCartons(reference: string) {
  const { dossier } = await contexte(reference);
  await depot().modifier("dossiers", dossier.id, { cartons_non_necessaires: true });
  await tracerEdition(dossier, "« Pas besoin de cartons » indiqué");
  rafraichir(reference);
  redirect(`/espace-client/${reference}?ok=sans-cartons#progression`);
}

// --- SAV ---------------------------------------------------------------------------------------

export async function declarerAvarie(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { client, dossier, conseiller } = await contexte(reference);
  if (!livraisonEffectuee(dossier)) return { message: "La déclaration d'avarie s'ouvre après la livraison." };
  const r = avarieSchema.safeParse(lireAvarie(fd));
  const photos = fichiersDe(fd, "photos");
  const errPhotos = verifierPhotos(photos, { min: 1, max: 5 });
  if (!r.success || errPhotos) return { erreurs: { ...(r.success ? {} : erreursDe(r.error)), ...(errPhotos ? { photos: errPhotos } : {}) } };

  const pieces = await deposerPhotos(dossier.id, "sav", photos);
  const numero = await depot().prochainNumero("sav_declarations", `SAV-${aujourdhui().slice(0, 4)}-`, 3);
  await depot().inserer("sav_declarations", { id: nouvelId(), dossier_id: dossier.id, numero, ...r.data, photos: pieces, statut: "recue", created_at: maintenant() });

  const signature = signatureDe(conseiller);
  await avertirEquipe("sav_declare", numero, conseiller.email, {
    dossier_id: dossier.id, canal: "email", modele: "avarie_equipe",
    payload: {
      client: nomClient(client), reference: dossier.reference, numero, reserves: r.data.reserves_emises, date_constat: r.data.date_constat,
      objets: r.data.objets, description: r.data.description, nb_photos: pieces.length,
      chemin: `/dashboard/espace-client/dossiers/${dossier.id}`, signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone },
    },
  });
  // L'accusé de réception au client (« votre déclaration ») : pas quand c'est l'équipe qui la saisit pour lui.
  const edition = await editionEquipe();
  if (!edition) {
    await notifier.envoyer({
      dossier_id: dossier.id, canal: "email", modele: "avarie_recue", destinataire: client.email,
      payload: { salutation: salutation(client), numero, objets: r.data.objets, chemin: `/espace-client/${dossier.reference}/sav`, signature },
    });
  }
  // Logement social : le bailleur est prévenu de chaque déclaration (cahier des charges, §2).
  if (client.type === "logement_social" && dossier.bailleur_email) {
    await notifier.envoyer({
      dossier_id: dossier.id, canal: "email", modele: "avarie_bailleur", destinataire: dossier.bailleur_email,
      payload: {
        bailleur: dossier.bailleur_nom ?? "", locataire: nomClient(client), reference: dossier.reference, numero, reserves: r.data.reserves_emises,
        date_constat: dateLongue(r.data.date_constat), objets: r.data.objets, adresse: dossier.adresse_arrivee, nb_photos: pieces.length,
        signature: { nom: `${conseiller.prenom} ${conseiller.nom}`.trim(), role: "Conseiller", telephone: conseiller.telephone },
      },
    });
  }
  if (edition) await tracerEdition(dossier, `Avarie déclarée (${numero}) : ${r.data.objets}`);
  else await noterDansLeCrm(dossier.crm_dossier_id, `Avarie déclarée par le client dans son espace (${numero}) : ${r.data.objets}`);
  rafraichir(reference);
  redirect(`/espace-client/${reference}/sav?ok=avarie`);
}

// --- Paiements ---------------------------------------------------------------------------------

export async function payerArrhes(reference: string, devisId: string) {
  // L'équipe enregistre un règlement dans le CRM ; elle ne paie jamais au nom du client.
  await refuserEnApercu();
  const { client, dossier, d } = await contexte(reference);
  // Grands comptes et militaires ne règlent rien en ligne (cahier des charges, §3.3).
  if (!segmentDe(client.type).paieEnLigne || client.masquer_devis) throw new Error("Paiement des arrhes indisponible pour ce compte.");
  const devis = d.devis.find((x) => x.id === devisId && x.dossier_id === dossier.id);
  const payable = !!devis && devis.arrhes_pourcentage > 0 && (devis.statut === "envoye" || (devis.statut === "accepte" && !arrhesPayees(devis, d.factures)));
  if (!devis || !payable) redirect(`/espace-client/${reference}/devis`);
  // Le montant vient de la base (le devis lu par la session du client), jamais du navigateur.
  const { url } = await prestataire().creerPaiement({
    cible: "devis_arrhes", cible_id: devis.id, dossier_id: dossier.id, montant: montantArrhes(devis),
    libelle: `Arrhes ${devis.arrhes_pourcentage} % · devis ${devis.numero}`, trace: await traces(),
    reference: dossier.reference, email: client.email,
  });
  redirect(url);
}

/**
 * Un devis sans arrhes s'accepte d'un clic : l'acceptation est horodatée
 * comme les autres. Un devis du CRM est signé dans le CRM, par la même règle
 * que la page /signature (un seul devis signé par dossier), puis revient ici
 * par la projection.
 */
export async function accepterDevis(reference: string, devisId: string) {
  // Une signature est l'engagement du client : refusée pendant tout aperçu (l'équipe signe dans le CRM).
  await refuserEnApercu();
  const { client, dossier, d } = await contexte(reference);
  if (!segmentDe(client.type).paieEnLigne || client.masquer_devis) throw new Error("Acceptation indisponible pour ce compte.");
  const devis = d.devis.find((x) => x.id === devisId && x.dossier_id === dossier.id);
  if (devis && devis.statut === "envoye" && devis.arrhes_pourcentage === 0 && typeof devis.crm_devis_id === "number") {
    const issue = await signerDevisCrm(devis.crm_devis_id, await traces());
    if (issue === "signe") {
      await alerterEquipe("devis_signe", {
        evenement: `crm-devis-${devis.crm_devis_id}`, reference: dossier.reference, origine: "espace_client", conseillers: [conseillerDe(d, client.conseiller_id).email],
        vars: { client: nomClient(client), reference: dossier.reference, numero: devis.numero, origine: "accepté depuis l'espace client" },
        lien: typeof dossier.crm_dossier_id === "number" ? { chemin: `/dossiers/${dossier.crm_dossier_id}`, libelle: "Ouvrir le dossier" } : null,
      });
    }
  } else if (devis && devis.statut === "envoye" && devis.arrhes_pourcentage === 0) {
    const t = await traces();
    // Accepté une seule fois, même sur deux clics simultanés.
    if (await depot().modifier("devis", devis.id, { statut: "accepte", accepte_le: aujourdhui() }, { statut: "envoye" })) {
      for (const autre of d.devis) {
        if (autre.dossier_id === dossier.id && autre.id !== devis.id && autre.statut === "envoye") await depot().modifier("devis", autre.id, { statut: "refuse" }, { statut: "envoye" });
      }
      await depot().inserer("acceptations", { id: nouvelId(), dossier_id: dossier.id, type: "devis", version_texte: devis.numero, objet: devis.numero, accepted_at: maintenant(), ...t });
    }
  }
  rafraichir(reference);
  redirect(`/espace-client/${reference}/devis`);
}

export async function payerFacture(reference: string, factureId: string) {
  // L'équipe enregistre un règlement dans le CRM ; elle ne paie jamais au nom du client.
  await refuserEnApercu();
  const { client, dossier, d } = await contexte(reference);
  if (client.masquer_factures) throw new Error("Factures indisponibles pour ce compte.");
  const f = d.factures.find((x) => x.id === factureId && x.dossier_id === dossier.id);
  if (!f || f.statut === "payee") redirect(`/espace-client/${reference}/devis#factures`);
  const { url } = await prestataire().creerPaiement({
    cible: "facture", cible_id: f.id, dossier_id: dossier.id, montant: f.montant_ttc, libelle: `${f.libelle} · ${f.numero}`, trace: await traces(),
    reference: dossier.reference, email: client.email,
  });
  redirect(url);
}

/**
 * Le bouton de la page de paiement simulée. Il joue le prestataire : il
 * signe l'événement comme le ferait son webhook, et c'est le traitement du
 * webhook — le seul — qui fait passer la facture à « payée ». Fermé dès que
 * Stripe est réglé.
 */
export async function issuePaiementSimule(sessionId: string, fd: FormData) {
  await refuserEnApercu();
  if (stripeConfigure()) redirect("/espace-client");
  const client = await exigerClientPourAgir();
  const d = await lireDonneesClient();
  const session = d.sessions_paiement.find((s) => s.id === sessionId);
  const dossier = session && d.dossiers.find((x) => x.id === session.dossier_id && x.client_id === client.id);
  if (!session || !dossier) redirect("/espace-client");
  const payer = fd.get("issue") === "payer";
  const reference = `PAY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { corps, signature } = paiementSimule.signerEvenement({ type: payer ? "paiement.reussi" : "paiement.annule", session_id: session.id, reference });
  await traiterEvenement(corps, signature);
  rafraichir(dossier.reference);
  if (payer) redirect(`/espace-client/paiement/${session.id}`);
  redirect(`/espace-client/${dossier.reference}/devis?ok=paiement-annule${session.cible === "facture" ? "#factures" : ""}`);
}

// --- Contact -----------------------------------------------------------------------------------
// Écrire au conseiller : la discussion (actions/discussion.ts), qui a remplacé le formulaire d'un seul message.

export async function demanderService(reference: string, serviceId: string) {
  const { client, dossier, conseiller, d } = await contexte(reference);
  const service = d.services.find((s) => s.id === serviceId && s.actif);
  if (!service) redirect(`/espace-client/${reference}/services`);
  await avertirEquipe("service_demande", `${dossier.id}-${service.id}-${aujourdhui()}`, conseiller.email, {
    dossier_id: dossier.id, canal: "email", modele: "service_demande",
    payload: { client: nomClient(client), email: client.email, telephone_client: client.telephone, reference: dossier.reference, service: service.titre, signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone } },
  });
  await tracerEdition(dossier, `Service « ${service.titre} » demandé`);
  redirect(`/espace-client/${reference}/services?ok=service`);
}
