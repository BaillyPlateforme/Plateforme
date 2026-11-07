"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { consommerJeton, envoyerLienAcces } from "@/lib/espace-client/acces";
import { bornesCartons, CAPACITE_SAMEDI } from "@/lib/espace-client/cartons";
import { emailEquipe, estDemo } from "@/lib/espace-client/config";
import { depot, lireDonnees, maintenant, modifierDonnees, nouvelId } from "@/lib/espace-client/depot";
import { cheminFichier, deposerFichier, octets } from "@/lib/espace-client/fichiers";
import { aujourdhui, jourLong, joursRestants, nomClient, salutation } from "@/lib/espace-client/format";
import { conseillerDe, signatureDe } from "@/lib/espace-client/lectures";
import { estProfilDemo } from "@/lib/espace-client/seed";
import { notifier } from "@/lib/espace-client/notifier";
import { paiements, traiterEvenement } from "@/lib/espace-client/paiement";
import { arrhesPayees, livraisonEffectuee, montantArrhes, requirementsApplicables } from "@/lib/espace-client/progression";
import {
  acceptationsSchema, avarieSchema, conditionsLivraisonSchema, connexionSchema, declarationValeursSchema, erreursDe,
  ficheCartonsSchema, lireAcceptations, lireAvarie, lireConditions, lireDeclaration, lireFicheCartons, messageSchema,
  TYPES_DOCUMENTS, verifierFichier, verifierPhotos, type Erreurs,
} from "@/lib/espace-client/schemas";
import { cookieSession, COOKIE_CLIENT, exigerClient } from "@/lib/espace-client/session";
import { VERSIONS } from "@/lib/espace-client/textes";
import type { Acceptation, Donnees, PieceJointe, TypeAcceptation } from "@/lib/espace-client/types";
import { TEL_AGENCE } from "@/lib/messaging";

/*
 * Les actions du client. Une action serveur répond depuis n'importe quelle
 * page : chacune refait donc elle-même tout le chemin —
 *   1. la session (cookie signé),
 *   2. la propriété du dossier (la référence doit être à ce client),
 *   3. le schéma (le même que celui du navigateur),
 *   4. l'écriture, puis le message éventuel.
 */

export type EtatFormulaire = { ok?: boolean; erreurs?: Erreurs; message?: string };

async function contexte(reference: string) {
  const client = await exigerClient();
  const d = await lireDonnees();
  const dossier = d.dossiers.find((x) => x.reference === reference && x.client_id === client.id);
  if (!dossier) throw new Error("Dossier introuvable.");
  return { client, dossier, conseiller: conseillerDe(d, client.conseiller_id), d };
}

/** D'où vient l'acceptation : adresse IP et navigateur, relevés par le serveur. */
async function traces() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
  return { ip, user_agent: (h.get("user-agent") ?? "inconnu").slice(0, 400) };
}

function acceptation(dossierId: string, type: Exclude<TypeAcceptation, "devis">, t: { ip: string; user_agent: string }): Acceptation {
  return { id: nouvelId("ac"), dossier_id: dossierId, type, version_texte: VERSIONS[type], accepted_at: maintenant(), ...t };
}

const rafraichir = (reference: string) => revalidatePath(`/espace-client/${reference}`, "layout");

const fichiersDe = (fd: FormData, cle: string) => fd.getAll(cle).filter((f): f is File => f instanceof File && f.size > 0);

async function deposerPhotos(dossierId: string, rubrique: string, fichiers: File[]): Promise<PieceJointe[]> {
  const out: PieceJointe[] = [];
  for (const f of fichiers) {
    const chemin = cheminFichier(dossierId, f.name, rubrique);
    await deposerFichier(chemin, await octets(f), f.type);
    out.push({ id: nouvelId("pj"), chemin, nom: f.name, taille: f.size, mime: f.type });
  }
  return out;
}

// --- Connexion ---------------------------------------------------------------------------------

export async function demanderLien(_: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const r = connexionSchema.safeParse({ email: String(fd.get("email") ?? "").trim() });
  if (!r.success) return { erreurs: erreursDe(r.error) };
  let n: Awaited<ReturnType<typeof envoyerLienAcces>>;
  try {
    n = await envoyerLienAcces(r.data.email);
  } catch {
    // Le stockage ne répond pas : le dire sous le champ, plutôt qu'une page d'erreur.
    return { erreurs: { email: `Le service est momentanément indisponible. Réessayez dans quelques instants, ou appelez l'agence au ${TEL_AGENCE}.` } };
  }
  // La même réponse, que l'adresse soit connue ou non : la page ne dit pas qui est client.
  // En démonstration seulement, elle ouvre l'e-mail « reçu ».
  const apercu = n && estDemo() && estProfilDemo(r.data.email) ? `&apercu=${n.id}` : "";
  redirect(`/espace-client/connexion?envoye=1&email=${encodeURIComponent(r.data.email)}${apercu}`);
}

/** Le clic « Accéder à mon espace » de la page d'arrivée : c'est lui qui consomme le lien. */
export async function entrerAvecJeton(fd: FormData) {
  const r = await consommerJeton(String(fd.get("jeton") ?? ""));
  if (!r.ok) redirect(`/espace-client/connexion?erreur=${r.raison}`);
  const c = cookieSession(r.client);
  (await cookies()).set(c.name, c.value, c.options);
  const d = await lireDonnees();
  const vise = r.reference && d.dossiers.some((x) => x.reference === r.reference && x.client_id === r.client.id) ? r.reference : null;
  redirect(vise ? `/espace-client/${vise}?ok=bienvenue` : "/espace-client?ok=bienvenue");
}

/**
 * Démonstration seulement : entrer comme l'un des profils A à D. Le chemin
 * est le vrai — un lien est émis et journalisé, puis consommé — sans passer
 * par la boîte de réception.
 */
export async function entrerDemo(fd: FormData) {
  if (!estDemo() || !estProfilDemo(String(fd.get("email") ?? ""))) redirect("/espace-client/connexion");
  const n = await envoyerLienAcces(String(fd.get("email") ?? ""), { reference: String(fd.get("reference") ?? "") || null });
  const jeton = n ? new URL(String(n.payload.lien)).searchParams.get("jeton") : null;
  if (!jeton) redirect("/espace-client/connexion");
  const r = await consommerJeton(jeton);
  if (!r.ok) redirect(`/espace-client/connexion?erreur=${r.raison}`);
  const c = cookieSession(r.client);
  (await cookies()).set(c.name, c.value, c.options);
  redirect(r.reference ? `/espace-client/${r.reference}` : "/espace-client");
}

/** Démonstration seulement : émettre le lien d'un profil et ouvrir l'e-mail « reçu ». */
export async function voirEmailDemo(fd: FormData) {
  if (!estDemo() || !estProfilDemo(String(fd.get("email") ?? ""))) redirect("/espace-client/connexion");
  const n = await envoyerLienAcces(String(fd.get("email") ?? ""), { reference: String(fd.get("reference") ?? "") || null });
  redirect(n ? `/espace-client/apercu-email/${n.id}` : "/espace-client/connexion");
}

export async function reinitialiserDemo() {
  if (!estDemo()) return;
  await depot().reinitialiser();
  (await cookies()).delete({ name: COOKIE_CLIENT, path: "/espace-client" });
  revalidatePath("/espace-client", "layout");
  redirect("/espace-client/connexion?reinitialise=1");
}

// --- Mes documents -----------------------------------------------------------------------------

export async function deposerPiece(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { client, dossier, d } = await contexte(reference);
  const f = fd.get("fichier");
  const fichier = f instanceof File ? f : null;
  const erreur = verifierFichier(fichier, TYPES_DOCUMENTS);
  if (erreur) return { erreurs: { fichier: erreur } };

  const requirementId = String(fd.get("requirement_id") ?? "") || null;
  const piece = requirementId ? requirementsApplicables(dossier, d.document_requirements).find((r) => r.id === requirementId) : null;
  if (requirementId && !piece) return { erreurs: { fichier: "Cette pièce n'est pas demandée pour votre dossier." } };
  const libelle = piece?.libelle ?? (String(fd.get("libelle") ?? "").trim().slice(0, 80) || "Document");

  const chemin = cheminFichier(dossier.id, fichier!.name);
  await deposerFichier(chemin, await octets(fichier!), fichier!.type);
  await modifierDonnees((m) => {
    m.documents.push({
      id: nouvelId("doc"), dossier_id: dossier.id, categorie: piece?.pays ? "pays" : piece ? "identite" : "autre", libelle, source: "client",
      chemin, nom_fichier: fichier!.name, taille_octets: fichier!.size, mime: fichier!.type, requirement_id: piece?.id ?? null,
      created_by: client.id, created_at: maintenant(),
    });
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}/documents?ok=piece#pieces`);
}

export async function enregistrerConditions(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { dossier, d } = await contexte(reference);
  if (d.conditions_livraison.some((c) => c.dossier_id === dossier.id && c.valide_at)) {
    return { message: "Vos conditions de livraison sont déjà validées : pour les modifier, contactez votre conseiller." };
  }
  const r = conditionsLivraisonSchema.safeParse(lireConditions(fd));
  const photos = fichiersDe(fd, "photos");
  const errPhotos = verifierPhotos(photos, { max: 6 });
  if (!r.success || errPhotos) return { erreurs: { ...(r.success ? {} : erreursDe(r.error)), ...(errPhotos ? { photos: errPhotos } : {}) } };

  const t = await traces();
  const pieces = await deposerPhotos(dossier.id, "acces", photos);
  const v = r.data;
  await modifierDonnees((m) => {
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
    const existant = m.conditions_livraison.find((x) => x.dossier_id === dossier.id);
    if (existant) Object.assign(existant, ligne);
    else m.conditions_livraison.push({ id: nouvelId("cl-liv"), dossier_id: dossier.id, ...ligne });
    m.acceptations.push(acceptation(dossier.id, "conditions_livraison", t));
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}/documents?ok=conditions#conditions`);
}

export async function soumettreDeclaration(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { dossier, d } = await contexte(reference);
  if (d.declarations_valeurs.some((x) => x.dossier_id === dossier.id && x.statut === "soumise")) {
    return { message: "Votre déclaration est déjà transmise : pour la modifier, contactez votre conseiller." };
  }
  const r = declarationValeursSchema.safeParse(lireDeclaration(fd));
  if (!r.success) return { erreurs: erreursDe(r.error) };
  const { declarant_nom, declarant_qualite, lieu, date, objets } = r.data;
  const contenu = { declarant_nom, declarant_qualite, lieu, date, objets };
  const total = Math.round(contenu.objets.reduce((n, o) => n + o.quantite * o.valeur_unitaire, 0) * 100) / 100;
  const t = await traces();
  await modifierDonnees((m) => {
    const ligne = { contenu, total, statut: "soumise" as const, soumise_at: maintenant() };
    const existant = m.declarations_valeurs.find((x) => x.dossier_id === dossier.id);
    if (existant) Object.assign(existant, ligne);
    else m.declarations_valeurs.push({ id: nouvelId("dv-val"), dossier_id: dossier.id, ...ligne });
    m.acceptations.push(acceptation(dossier.id, "declaration_valeurs", t));
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}/documents?ok=valeurs#valeurs`);
}

export async function accepterConditionsGenerales(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { dossier } = await contexte(reference);
  const r = acceptationsSchema.safeParse(lireAcceptations(fd));
  if (!r.success) return { erreurs: erreursDe(r.error) };
  const t = await traces();
  await modifierDonnees((m) => {
    for (const type of ["cgv", "rgpd"] as const) {
      const deja = m.acceptations.some((a) => a.dossier_id === dossier.id && a.type === type && a.version_texte === VERSIONS[type]);
      if (!deja) m.acceptations.push(acceptation(dossier.id, type, t));
    }
  });
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
  const autres = d.livraisons_cartons.filter((l) => l.date_samedi === r.data.date_samedi && l.id !== existante?.id).length;
  if (autres >= CAPACITE_SAMEDI) return { erreurs: { date_samedi: "Ce samedi vient d'être complet : choisissez-en un autre." } };

  await modifierDonnees((m) => {
    const champs = { ...r.data, ordre_passage: null, creneau_debut: null, creneau_fin: null, creneau_envoye_le: null };
    const l = existante && m.livraisons_cartons.find((x) => x.id === existante.id);
    if (l) {
      const memeAdresse = l.adresse === r.data.adresse;
      Object.assign(l, champs, memeAdresse ? {} : { lat: null, lng: null });
    } else {
      m.livraisons_cartons.push({ id: nouvelId("lc"), dossier_id: dossier.id, ...champs, nb_cartons: null, lat: null, lng: null, statut: "demandee", created_at: maintenant() });
    }
    m.dossiers.find((x) => x.id === dossier.id)!.cartons_non_necessaires = false;
  });

  // L'e-mail à l'équipe, pour qu'elle saisisse le nombre de cartons.
  await notifier.envoyer({
    dossier_id: dossier.id,
    canal: "email",
    modele: "cartons_demandes_equipe",
    destinataire: emailEquipe(conseiller.email),
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
  await modifierDonnees((m) => {
    m.dossiers.find((x) => x.id === dossier.id)!.cartons_non_necessaires = true;
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}?ok=sans-cartons#progression`);
}

// --- SAV ---------------------------------------------------------------------------------------

function prochainNumeroSav(d: Donnees) {
  const annee = aujourdhui().slice(0, 4);
  const max = d.sav_declarations
    .map((s) => /^SAV-(\d{4})-(\d+)$/.exec(s.numero))
    .filter((x): x is RegExpExecArray => !!x && x[1] === annee)
    .reduce((n, x) => Math.max(n, Number(x[2])), 0);
  return `SAV-${annee}-${String(max + 1).padStart(3, "0")}`;
}

export async function declarerAvarie(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { client, dossier, conseiller } = await contexte(reference);
  if (!livraisonEffectuee(dossier)) return { message: "La déclaration d'avarie s'ouvre après la livraison." };
  const r = avarieSchema.safeParse(lireAvarie(fd));
  const photos = fichiersDe(fd, "photos");
  const errPhotos = verifierPhotos(photos, { min: 1, max: 5 });
  if (!r.success || errPhotos) return { erreurs: { ...(r.success ? {} : erreursDe(r.error)), ...(errPhotos ? { photos: errPhotos } : {}) } };

  const pieces = await deposerPhotos(dossier.id, "sav", photos);
  const numero = await modifierDonnees((m) => {
    const n = prochainNumeroSav(m);
    m.sav_declarations.push({ id: nouvelId("sav"), dossier_id: dossier.id, numero: n, ...r.data, photos: pieces, statut: "recue", created_at: maintenant() });
    return n;
  });

  const signature = signatureDe(conseiller);
  await notifier.envoyer({
    dossier_id: dossier.id, canal: "email", modele: "avarie_equipe", destinataire: emailEquipe(conseiller.email),
    payload: {
      client: nomClient(client), reference: dossier.reference, numero, reserves: r.data.reserves_emises, date_constat: r.data.date_constat,
      objets: r.data.objets, description: r.data.description, nb_photos: pieces.length,
      chemin: `/dashboard/espace-client/dossiers/${dossier.id}`, signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone },
    },
  });
  await notifier.envoyer({
    dossier_id: dossier.id, canal: "email", modele: "avarie_recue", destinataire: client.email,
    payload: { salutation: salutation(client), numero, objets: r.data.objets, chemin: `/espace-client/${dossier.reference}/sav`, signature },
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}/sav?ok=avarie`);
}

// --- Paiements ---------------------------------------------------------------------------------

export async function payerArrhes(reference: string, devisId: string) {
  const { client, dossier, d } = await contexte(reference);
  if (client.type !== "particulier" || client.masquer_devis) throw new Error("Paiement des arrhes indisponible pour ce compte.");
  const devis = d.devis.find((x) => x.id === devisId && x.dossier_id === dossier.id);
  const payable = !!devis && devis.arrhes_pourcentage > 0 && (devis.statut === "envoye" || (devis.statut === "accepte" && !arrhesPayees(devis, d.factures)));
  if (!devis || !payable) redirect(`/espace-client/${reference}/devis`);
  const { url } = await paiements.creerPaiement({
    cible: "devis_arrhes", cible_id: devis.id, dossier_id: dossier.id, montant: montantArrhes(devis),
    libelle: `Arrhes ${devis.arrhes_pourcentage} % · devis ${devis.numero}`, trace: await traces(),
  });
  redirect(url);
}

/** Un devis sans arrhes s'accepte d'un clic : l'acceptation est horodatée comme les autres. */
export async function accepterDevis(reference: string, devisId: string) {
  const { client, dossier } = await contexte(reference);
  if (client.type !== "particulier" || client.masquer_devis) throw new Error("Acceptation indisponible pour ce compte.");
  const t = await traces();
  await modifierDonnees((m) => {
    const devis = m.devis.find((x) => x.id === devisId && x.dossier_id === dossier.id);
    if (!devis || devis.statut !== "envoye" || devis.arrhes_pourcentage > 0) return;
    devis.statut = "accepte";
    devis.accepte_le = aujourdhui();
    for (const autre of m.devis) if (autre.dossier_id === dossier.id && autre.id !== devis.id && autre.statut === "envoye") autre.statut = "refuse";
    m.acceptations.push({ id: nouvelId("ac"), dossier_id: dossier.id, type: "devis", version_texte: devis.numero, objet: devis.numero, accepted_at: maintenant(), ...t });
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}/devis`);
}

export async function payerFacture(reference: string, factureId: string) {
  const { client, dossier, d } = await contexte(reference);
  if (client.masquer_factures) throw new Error("Factures indisponibles pour ce compte.");
  const f = d.factures.find((x) => x.id === factureId && x.dossier_id === dossier.id);
  if (!f || f.statut === "payee") redirect(`/espace-client/${reference}/devis#factures`);
  const { url } = await paiements.creerPaiement({
    cible: "facture", cible_id: f.id, dossier_id: dossier.id, montant: f.montant_ttc, libelle: `${f.libelle} · ${f.numero}`, trace: await traces(),
  });
  redirect(url);
}

/**
 * Le bouton de la page de paiement simulée. Il joue le prestataire : il
 * signe l'événement comme le ferait son webhook, et c'est le traitement du
 * webhook — le seul — qui fait passer la facture à « payée ».
 */
export async function issuePaiementSimule(sessionId: string, fd: FormData) {
  const client = await exigerClient();
  const d = await lireDonnees();
  const session = d.sessions_paiement.find((s) => s.id === sessionId);
  const dossier = session && d.dossiers.find((x) => x.id === session.dossier_id && x.client_id === client.id);
  if (!session || !dossier) redirect("/espace-client");
  const payer = fd.get("issue") === "payer";
  const reference = `PAY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { corps, signature } = paiements.signerEvenement({ type: payer ? "paiement.reussi" : "paiement.annule", session_id: session.id, reference });
  await traiterEvenement(corps, signature);
  rafraichir(dossier.reference);
  if (payer) redirect(`/espace-client/paiement/${session.id}`);
  redirect(`/espace-client/${dossier.reference}/devis?ok=paiement-annule${session.cible === "facture" ? "#factures" : ""}`);
}

// --- Contact -----------------------------------------------------------------------------------

export async function ecrireAuConseiller(reference: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  const { client, dossier, conseiller } = await contexte(reference);
  const r = messageSchema.safeParse({ message: fd.get("message") });
  if (!r.success) return { erreurs: erreursDe(r.error) };
  await notifier.envoyer({
    dossier_id: dossier.id, canal: "email", modele: "message_conseiller", destinataire: conseiller.email || emailEquipe(conseiller.email),
    payload: { client: nomClient(client), email: client.email, reference: dossier.reference, message: r.data.message, signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone } },
  });
  redirect(`/espace-client/${reference}/conseiller?ok=message`);
}

export async function demanderService(reference: string, serviceId: string) {
  const { client, dossier, conseiller, d } = await contexte(reference);
  const service = d.services.find((s) => s.id === serviceId && s.actif);
  if (!service) redirect(`/espace-client/${reference}/services`);
  await notifier.envoyer({
    dossier_id: dossier.id, canal: "email", modele: "service_demande", destinataire: emailEquipe(conseiller.email),
    payload: { client: nomClient(client), email: client.email, telephone_client: client.telephone, reference: dossier.reference, service: service.titre, signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone } },
  });
  redirect(`/espace-client/${reference}/services?ok=service`);
}
