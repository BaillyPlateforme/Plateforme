import {
  avecTeinte,
  bouton,
  carteContact,
  cartePrix,
  carteTrajet,
  echapper,
  etapes,
  mention,
  mettreEnPage,
  paragraphe,
  salutation,
  sousTitre,
} from "@/lib/email-layout";
import { renderTemplate, type MessageContext } from "@/lib/messaging";

/** Une ligne du chiffrage, telle que le moteur la produit. */
export type LigneEstimation = { label: string; amount: number };

export interface ContexteRendu {
  /** Le contexte des variables : {{client_nom}}, {{montant_ttc}}… */
  vars: MessageContext;
  /** Le détail du chiffrage, pour le bloc d'estimation. */
  lignes?: LigneEstimation[];
  /** L'adresse du site, pour les liens, le logo et la photo. */
  base?: string;
  entreprise?: { nom?: string; email?: string; tel?: string };
  /** L'estimation part en pièce jointe : le message le dit. */
  pieceJointe?: boolean;
  /**
   * L'espace pro d'où vient la demande : sa couleur teinte le message, son
   * enseigne se pose dans l'en-tête, et il peut remplacer l'objet et ajouter
   * son propre mot d'accueil.
   */
  espace?: {
    nom: string;
    couleur: string;
    logo?: string | null;
    objet?: string;
    message?: string;
  } | null;
}

const eur = (n: number) =>
  `${n
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    // Certaines boîtes n'ont pas l'espace fine insécable de fr-FR dans leur police.
    .replace(/[  ]/g, " ")} €`;

/** Un montant, qu'il arrive en nombre (3468) ou déjà écrit (« 3 468,00 € »). */
function montant(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") return eur(v);
  const s = String(v).trim();
  return /^-?\d+([.,]\d+)?$/.test(s) ? eur(parseFloat(s.replace(",", "."))) : s;
}

/** « 2026-11-15 » devient « 15 novembre 2026 » ; tout autre texte reste tel quel. */
function quand(v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

const FORMULES: Record<string, string> = { eco: "Économique", standard: "Standard", luxe: "Premium" };

/**
 * Les variables que le rendu calcule lui-même.
 *
 * `titre_demande` change selon que l'estimation existe ou non : un même modèle
 * sert d'accusé de réception tant qu'elle n'est pas chiffrée, et d'envoi
 * d'estimation dès qu'elle l'est.
 */
export function variablesCalculees(vars: MessageContext): MessageContext {
  return {
    titre_demande: vars.montant_ttc
      ? "Votre estimation de déménagement"
      : "Nous avons bien reçu votre demande",
    ...vars,
  };
}

/**
 * Transforme le texte d'un modèle en e-mail HTML complet.
 *
 * Le corps s'écrit en texte, avec des variables et des blocs. Une ligne qui ne
 * contient qu'un bloc devient ce bloc ; tout le reste devient des paragraphes.
 * L'équipe compose donc son message sans écrire une balise.
 */
export function rendreEmail(
  modele: { sujet?: string | null; contenu: string; name: string },
  contexte: ContexteRendu,
): { sujet: string; html: string } {
  const ctx = { ...contexte, vars: variablesCalculees(contexte.vars) };
  return avecTeinte(ctx.espace?.couleur, () => composer(modele, ctx));
}

function composer(
  modele: { sujet?: string | null; contenu: string; name: string },
  ctx: ContexteRendu,
): { sujet: string; html: string } {
  const v = ctx.vars;
  const sujet = renderTemplate(ctx.espace?.objet?.trim() || modele.sujet || modele.name, v);
  // Le découpage se fait sur le texte BRUT : les jetons de bloc doivent être
  // reconnus avant que la substitution des variables ne les efface.
  const corps = assembler(modele.contenu, ctx);

  // L'en-tête reprend l'objet, sans le nom de l'entreprise que le logo dit déjà.
  const nom = String(v.entreprise_nom ?? ctx.entreprise?.nom ?? "");
  const titre = nom && sujet.endsWith(nom) ? sujet.slice(0, -nom.length).replace(/\s*[—–-]\s*$/, "") : sujet;

  const trajet = [v.ville_depart, v.ville_arrivee].filter(Boolean).join(" → ");
  const puces = [trajet, v.volume ? `${v.volume} m³` : "", quand(v.date)].filter(Boolean) as string[];

  return {
    sujet,
    html: mettreEnPage({
      titre: titre || sujet,
      corps,
      apercu: premiereLigne(modele.contenu, ctx),
      base: ctx.base,
      entreprise: ctx.entreprise,
      surtitre: v.reference
        ? `Estimation ${v.reference}`
        : ctx.espace
          ? /^espace\b/i.test(ctx.espace.nom) ? ctx.espace.nom : `Espace ${ctx.espace.nom}`
          : "Votre déménagement",
      puces,
      marque: ctx.espace ? { nom: ctx.espace.nom, logo: ctx.espace.logo } : null,
    }),
  };
}

/** Le texte rendu, coupé en paragraphes et en blocs. */
function assembler(texte: string, ctx: ContexteRendu): string {
  const morceaux: string[] = [];
  let paragrapheEnCours: string[] = [];

  const viderParagraphe = () => {
    if (paragrapheEnCours.length) {
      // Les variables sont remplacées ici, puis échappées : un nom de client
      // n'est pas du HTML, et ne doit pas pouvoir en devenir.
      const lignes = paragrapheEnCours.map((l) => echapper(renderTemplate(l, ctx.vars)));
      const premier = morceaux.length === 0 && lignes.length === 1 && /^bonjour\b/i.test(lignes[0]);
      morceaux.push(premier ? salutation(lignes[0]) : paragraphe(lignes.join("<br>")));
      // Le mot d'accueil de l'espace pro vient juste après le bonjour.
      if (premier && ctx.espace?.message?.trim()) {
        for (const bloc of ctx.espace.message.trim().split(/\n\s*\n/)) {
          morceaux.push(
            paragraphe(
              bloc
                .split("\n")
                .map((l) => echapper(renderTemplate(l.trim(), ctx.vars)))
                .join("<br>"),
            ),
          );
        }
      }
      paragrapheEnCours = [];
    }
  };

  for (const ligne of texte.split("\n")) {
    const net = ligne.trim();
    if (!net) {
      viderParagraphe();
      continue;
    }
    const bloc = rendreBloc(net, ctx);
    if (bloc !== null) {
      viderParagraphe();
      if (bloc) morceaux.push(bloc);
      continue;
    }
    // Une ligne seule qui finit par « : » fait un bon intertitre.
    if (net.endsWith(":") && net.length < 60 && paragrapheEnCours.length === 0) {
      morceaux.push(sousTitre(renderTemplate(net.slice(0, -1), ctx.vars)));
      continue;
    }
    paragrapheEnCours.push(net);
  }
  viderParagraphe();

  return morceaux.join("\n");
}

/** Rend un bloc, ou null si la ligne n'en est pas un. */
function rendreBloc(ligne: string, ctx: ContexteRendu): string | null {
  const v = ctx.vars;
  const lien = (cle: string) => String(v[cle] ?? "");

  switch (ligne) {
    case "{{bloc_recapitulatif}}": {
      const reperes: [string, string][] = [];
      if (v.distance) reperes.push(["Distance", `${v.distance} km`]);
      if (v.volume) reperes.push(["Volume", `${v.volume} m³`]);
      if (v.date) reperes.push(["Période", quand(v.date)]);
      if (v.formule) reperes.push(["Formule", FORMULES[String(v.formule)] ?? String(v.formule)]);
      return carteTrajet({
        depart: v.ville_depart ? String(v.ville_depart) : undefined,
        arrivee: v.ville_arrivee ? String(v.ville_arrivee) : undefined,
        reperes,
      });
    }

    case "{{bloc_estimation}}": {
      const lignes = (ctx.lignes ?? []).map((l) => [l.label, eur(l.amount)] as [string, string]);
      const ttc = montant(v.montant_ttc);
      if (!lignes.length && !ttc) return "";
      return (
        sousTitre("Votre estimation") +
        paragraphe(
          "Établie sur notre grille tarifaire, à partir des informations que vous nous avez transmises" +
            (ctx.pieceJointe ? ". Vous la retrouvez en pièce jointe, au format PDF." : "."),
        ) +
        cartePrix({
          lignes,
          ht: montant(v.montant_ht) || undefined,
          ttc: ttc || undefined,
          validite: v.validite ? String(v.validite) : undefined,
        }) +
        mention("Estimation indicative : elle ne constitue pas un devis contractuel.")
      );
    }

    case "{{bouton_estimation}}":
      return lien("lien_estimation") ? bouton("Voir mon estimation", lien("lien_estimation")) : "";

    case "{{bouton_completer}}":
      return lien("lien_completion") ? bouton("Compléter ma demande", lien("lien_completion")) : "";

    case "{{bloc_suite}}":
      // La première étape dit où en est le dossier : l'estimation est faite,
      // ou elle est en cours. Les deux suivantes ne changent pas.
      return (
        sousTitre("Et maintenant ?") +
        etapes([
          v.montant_ttc
            ? [
                "Un conseiller vous appelle",
                "Il confirme l'estimation avec vous, par téléphone ou lors d'une visite technique, gratuite et sans engagement.",
              ]
            : [
                "Nous étudions votre demande",
                "Un conseiller reprend vos informations et établit votre estimation.",
              ],
          ["Vous recevez un devis ferme", "Sous 24 heures ouvrées après votre accord."],
          ["Nous bloquons votre date", "Équipes et camions sont réservés dès que le devis est signé."],
        ])
      );

    case "{{bloc_contact}}":
      return carteContact({
        tel: v.entreprise_tel ? String(v.entreprise_tel) : undefined,
        mail: v.entreprise_email ? String(v.entreprise_email) : undefined,
      });

    default:
      return null;
  }
}

/** La ligne d'aperçu que les boîtes affichent à côté de l'objet. */
function premiereLigne(texte: string, ctx: ContexteRendu): string {
  const lignes = texte
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("{{"));
  // « Bonjour Camille, » ne dit rien : l'aperçu prend la phrase d'après.
  const ligne = lignes.find((l) => !/^bonjour\b/i.test(l)) ?? lignes[0];
  return ligne ? renderTemplate(ligne, ctx.vars).slice(0, 140) : "";
}

/**
 * Habille un texte libre — un message écrit à la main par l'équipe, un envoi
 * de test. Sans variables ni blocs à interpréter : le texte part tel quel,
 * mais dans la même mise en page que les messages automatiques.
 */
export function habillerTexte(
  sujet: string,
  texte: string,
  reglages: { base?: string; entreprise?: { nom?: string; email?: string; tel?: string } },
): string {
  return rendreEmail(
    { name: sujet, sujet, contenu: texte },
    { vars: { entreprise_nom: reglages.entreprise?.nom }, base: reglages.base, entreprise: reglages.entreprise },
  ).html;
}
