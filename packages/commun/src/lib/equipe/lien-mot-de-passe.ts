import "server-only";
import { createClient } from "@supabase/supabase-js";
import { URL_INTERNE, versInterne } from "@/lib/adresses";
import { membreParEmail, type MembreEquipe } from "@/lib/droits";
import { bouton, echapper, mention, mettreEnPage, paragraphe, salutation } from "@/lib/email-layout";
import { envoyerEmail, type ResultatEnvoi } from "@/lib/envois";
import { ecrireJournal } from "@/lib/journal";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";
import { roleDuCompte } from "@/lib/supabase/roles";
import { DUREE_LIEN_MIN, jetonValide, refusMotDePasse } from "./regles-mot-de-passe";

/*
 * Choisir son mot de passe par un lien à usage unique, au lieu de le recevoir
 * par e-mail (David, 20/11/2026 : un mot de passe envoyé par e-mail reste dans
 * la boîte, et celui d'un compte de l'équipe ouvre les vraies données).
 *
 * Le jeton est celui d'un lien de récupération de Supabase Auth : le serveur
 * le demande par `auth.admin.generateLink` (Supabase n'envoie rien), et
 * l'envoie lui-même par le circuit d'envoi (lib/envois : ENVOI_MODE, journal)
 * vers /login/mot-de-passe/choisir?jeton=…. Supabase le rend inutilisable une
 * fois servi, au bout d'une heure, ou dès qu'un lien plus récent est émis
 * pour le même compte.
 *
 * Ouvrir le lien ne le consomme pas : la page demande le nouveau mot de passe,
 * et c'est l'envoi du formulaire qui vérifie le jeton. Sans cela, les
 * messageries qui inspectent les liens d'un e-mail avant qu'on l'ouvre (c'est
 * le cas d'Outlook) brûleraient le lien, comme pour l'espace client.
 *
 * Seul un compte de l'équipe (sans rôle dans app_metadata, actif dans
 * team_members, même identifiant) peut recevoir ou servir ce lien. Le lien
 * part toujours à l'adresse de la fiche, jamais à une adresse fournie par la
 * requête, et il est construit sur NEXT_PUBLIC_URL_INTERNE, jamais sur l'hôte
 * de la requête : un en-tête Host forgé ne peut pas le détourner.
 */

const LIEN_INVALIDE =
  "Ce lien n'est plus valable : il a déjà servi, il a expiré, ou un lien plus récent l'a remplacé. Demandez-en un nouveau ci-dessous.";

/** Le lien de choix du mot de passe d'un membre actif de l'équipe. Lève si le compte ne correspond pas. */
export async function emettreLienMotDePasse(membre: MembreEquipe): Promise<string> {
  if (!membre.actif) throw new Error("Ce membre de l'équipe n'est pas actif.");
  if (!URL_INTERNE) throw new Error("L'adresse du CRM n'est pas réglée (NEXT_PUBLIC_URL_INTERNE).");
  const { data, error } = await createServiceClient().auth.admin.generateLink({ type: "recovery", email: membre.email });
  if (error || !data?.properties?.hashed_token) throw new Error(`Émission du lien impossible : ${error?.message ?? "réponse vide"}`);
  // Le lien doit ouvrir exactement le compte de la fiche, et un compte de l'équipe.
  if (data.user.id !== membre.id || roleDuCompte(data.user.app_metadata) !== "equipe") {
    throw new Error("Le lien émis ne correspond pas au compte de l'équipe.");
  }
  return versInterne(`/login/mot-de-passe/choisir?jeton=${encodeURIComponent(data.properties.hashed_token)}`);
}

/** Le premier mot du nom, pour « Bonjour Céline, ». */
const prenom = (m: Pick<MembreEquipe, "nom">) => (m.nom ?? "").trim().split(/\s+/)[0] || "";

export async function composerMail(membre: Pick<MembreEquipe, "nom" | "email">, lien: string) {
  const settings = await getSettings().catch(() => null);
  const bonjour = prenom(membre) ? `Bonjour ${prenom(membre)},` : "Bonjour,";
  const sujet = "BaillyCRM : choisir votre mot de passe";
  const html = mettreEnPage({
    titre: "Choisir votre mot de passe",
    surtitre: "BaillyCRM",
    base: (settings?.base_url || "").replace(/\/$/, ""),
    apercu: `Le lien pour choisir votre mot de passe, valable une heure.`,
    entreprise: { nom: settings?.entreprise_nom ?? undefined, email: settings?.entreprise_email ?? undefined },
    corps: [
      salutation(echapper(bonjour)),
      paragraphe(`Pour choisir le mot de passe de votre compte BaillyCRM (${echapper(membre.email)}), ouvrez le lien ci-dessous.`),
      paragraphe(`Il est valable une heure et ne sert qu'une fois. Une fois le mot de passe choisi, l'ancien ne fonctionne plus.`),
      bouton("Choisir mon mot de passe", lien),
      mention("Vous n'avez rien demandé ? Ignorez ce message : votre mot de passe actuel reste valable."),
    ].join("\n"),
  });
  const texte = `${bonjour}\n\nPour choisir le mot de passe de votre compte BaillyCRM (${membre.email}), ouvrez ce lien. Il est valable une heure et ne sert qu'une fois :\n\n${lien}\n\nVous n'avez rien demandé ? Ignorez ce message : votre mot de passe actuel reste valable.`;
  return { sujet, html, texte };
}

/**
 * Envoie le lien au membre actif de l'équipe de cette adresse. Rien, sans
 * bruit, si l'adresse n'est pas celle d'un membre actif : la page répond la
 * même chose dans tous les cas.
 */
export async function envoyerLienMotDePasse(email: string): Promise<ResultatEnvoi | null> {
  const membre = await membreParEmail(email);
  if (!membre?.actif) return null;
  const lien = await emettreLienMotDePasse(membre);
  const m = await composerMail(membre, lien);
  const r = await envoyerEmail({
    origine: "crm",
    modele: "Équipe : choisir le mot de passe",
    a: membre.email,
    sujet: m.sujet,
    html: m.html,
    texte: m.texte,
    // Ni pixel ni lien réécrit : le lien ouvre le compte, il ne passe par personne.
    suivi: false,
  });
  await ecrireJournal(
    {
      action: "membre_equipe.lien_mot_de_passe",
      libelle: `Lien pour choisir le mot de passe envoyé à ${membre.nom || membre.email}`,
      objet: { type: "membre_equipe", id: membre.id },
      details: { email: membre.email, envoi: r.statut, demande: "page de connexion" },
    },
    { type: "staff", email: membre.email },
  ).catch(() => undefined);
  return r;
}

/** Un client Supabase sans session gardée : il ne sert qu'à vérifier le jeton. */
const clientSansSession = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

/**
 * Consomme le lien et enregistre le nouveau mot de passe. Les règles sont
 * vérifiées AVANT le jeton : une saisie refusée ne brûle pas le lien. Toutes
 * les sessions du compte sont ensuite fermées, celle du lien comprise.
 */
export async function choisirParLien(
  jeton: string,
  nouveau: string,
  confirmation: string,
): Promise<{ ok: true; email: string } | { ok: false; erreur: string; lienPerdu?: boolean }> {
  const regle = refusMotDePasse(nouveau, confirmation);
  if (regle) return { ok: false, erreur: regle };
  if (!jetonValide(jeton)) return { ok: false, erreur: LIEN_INVALIDE, lienPerdu: true };

  const { data, error } = await clientSansSession().auth.verifyOtp({ token_hash: jeton, type: "recovery" });
  if (error || !data.user || !data.session) return { ok: false, erreur: LIEN_INVALIDE, lienPerdu: true };

  const service = createServiceClient();
  const fermer = () => service.auth.admin.signOut(data.session!.access_token, "global").catch(() => undefined);
  const membre = roleDuCompte(data.user.app_metadata) === "equipe" ? await membreParEmail(data.user.email).catch(() => null) : null;
  if (!membre?.actif || membre.id !== data.user.id) {
    await fermer();
    return { ok: false, erreur: LIEN_INVALIDE, lienPerdu: true };
  }
  const { error: refus } = await service.auth.admin.updateUserById(membre.id, { password: nouveau });
  await fermer();
  if (refus) return { ok: false, erreur: `Le mot de passe n'a pas été accepté (${refus.message}). Ce lien a servi : demandez-en un nouveau.`, lienPerdu: true };

  await ecrireJournal(
    {
      action: "membre_equipe.mot_de_passe",
      libelle: `Mot de passe choisi par ${membre.nom || membre.email}`,
      objet: { type: "membre_equipe", id: membre.id },
      details: { email: membre.email, par: "lien à usage unique" },
    },
    { type: "staff", email: membre.email },
  ).catch(() => undefined);
  return { ok: true, email: membre.email };
}

export { DUREE_LIEN_MIN, LIEN_INVALIDE };
