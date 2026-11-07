import type { TemplateOptions } from "@/lib/messaging";

/**
 * Les modèles livrés avec l'application.
 *
 * La base a été remplie, au tout début, de huit messages en texte brut : trois
 * phrases et une formule de politesse. Mis en page, ils restaient pauvres —
 * ni le trajet, ni le prix, ni la suite. Plutôt que de demander à l'équipe de
 * les réécrire un à un, chaque texte d'origine est associé ici à sa version
 * complète, composée de blocs.
 *
 * La règle est stricte : seul un message resté MOT POUR MOT à son texte
 * d'origine est remplacé. Dès que l'équipe en change une virgule, c'est son
 * texte qui part, tel quel. L'éditeur affiche la version réellement envoyée,
 * et l'enregistrer la fait entrer en base.
 */

type Defaut = {
  /** Le texte d'origine, tel qu'il a été semé en base. */
  ancien: string;
  sujet: string;
  contenu: string;
  options?: TemplateOptions;
};

const DEFAUTS: Defaut[] = [
  // ── Accusé de réception ────────────────────────────────────────────────
  // Céline : « je ne vois pas l'intérêt de ce mail puisque le client a
  // l'estimation en fin de processus ; le mieux serait qu'il reçoive
  // l'estimation en PDF ». Le message porte donc l'estimation dès qu'elle
  // existe ; tant qu'elle n'existe pas, ses blocs restent vides et il
  // redevient un accusé de réception.
  {
    ancien: `Bonjour {{client_nom}},

Nous vous confirmons la bonne réception de votre demande de déménagement de {{ville_depart}} vers {{ville_arrivee}}.

Notre équipe étudie votre projet et revient vers vous dans les plus brefs délais avec une estimation personnalisée.

À très bientôt,
L'équipe {{entreprise_nom}}`,
    sujet: "{{titre_demande}} — {{entreprise_nom}}",
    contenu: `Bonjour {{client_nom}},

Merci de votre confiance. Votre demande de déménagement est bien enregistrée : en voici le détail.

{{bloc_recapitulatif}}

{{bloc_estimation}}

{{bouton_estimation}}

{{bloc_suite}}

{{bloc_contact}}

À très bientôt,
L'équipe {{entreprise_nom}}`,
  },

  // ── Demande complète ───────────────────────────────────────────────────
  {
    ancien: `Bonjour {{client_nom}},

Merci ! Toutes les informations nécessaires à l'étude de votre déménagement ({{ville_depart}} → {{ville_arrivee}}, volume estimé ~{{volume}} m³) sont réunies.

Nous préparons votre devis et vous l'adressons très prochainement.

Bien à vous,
L'équipe {{entreprise_nom}}`,
    sujet: "{{titre_demande}} — {{entreprise_nom}}",
    contenu: `Bonjour {{client_nom}},

Merci ! Toutes les informations nécessaires à l'étude de votre déménagement sont réunies.

{{bloc_recapitulatif}}

{{bloc_estimation}}

{{bouton_estimation}}

{{bloc_suite}}

{{bloc_contact}}

Bien à vous,
L'équipe {{entreprise_nom}}`,
  },

  // ── Demande à compléter ────────────────────────────────────────────────
  {
    ancien: `Bonjour {{client_nom}},

Pour finaliser l'estimation de votre déménagement, il ne nous manque que quelques informations.

Merci de compléter votre demande en cliquant sur le lien ci-dessous (moins de 2 minutes) :

{{lien_completion}}

Une fois ces éléments renseignés, nous vous enverrons votre devis personnalisé.

Merci et à très vite,
L'équipe {{entreprise_nom}}`,
    sujet: "Complétez votre demande en 2 minutes — {{entreprise_nom}}",
    contenu: `Bonjour {{client_nom}},

Pour établir l'estimation de votre déménagement, il ne nous manque que quelques informations. Cela vous prendra moins de deux minutes.

{{bouton_completer}}

{{bloc_recapitulatif}}

Dès que ces éléments sont renseignés, vous recevez votre estimation détaillée.

{{bloc_contact}}

Merci et à très vite,
L'équipe {{entreprise_nom}}`,
  },

  // ── Estimation prête ───────────────────────────────────────────────────
  {
    ancien: `Bonjour {{client_nom}},

Votre devis {{reference}} pour le déménagement {{ville_depart}} → {{ville_arrivee}} est prêt.

Montant estimé : {{montant_ttc}} € TTC ({{montant_ht}} € HT)
Volume : ~{{volume}} m³

Nous revenons vers vous pour vous le transmettre officiellement.

L'équipe {{entreprise_nom}}`,
    sujet: "Votre estimation {{reference}} est prête",
    contenu: `Bonjour {{client_nom}},

Votre estimation pour le déménagement de {{ville_depart}} vers {{ville_arrivee}} est prête.

{{bloc_recapitulatif}}

{{bloc_estimation}}

{{bouton_estimation}}

{{bloc_suite}}

{{bloc_contact}}

L'équipe {{entreprise_nom}}`,
  },

  // ── Envoi du devis ─────────────────────────────────────────────────────
  // Un devis ferme, pas une estimation : le bloc d'estimation, qui rappelle
  // qu'elle n'engage personne, n'a pas sa place ici. Le document est joint.
  {
    ancien: `Bonjour {{client_nom}},

Nous avons le plaisir de vous adresser votre devis pour le déménagement de {{ville_depart}} vers {{ville_arrivee}}.

Référence : {{reference}}
Montant : {{montant_ttc}} € TTC ({{montant_ht}} € HT)
Volume estimé : ~{{volume}} m³
Date souhaitée : {{date}}

Ce devis reste à votre disposition. N'hésitez pas à nous contacter pour toute question ou ajustement.

Bien cordialement,
L'équipe {{entreprise_nom}}`,
    sujet: "Votre devis {{reference}} — {{entreprise_nom}}",
    contenu: `Bonjour {{client_nom}},

Nous avons le plaisir de vous adresser votre devis pour le déménagement de {{ville_depart}} vers {{ville_arrivee}}. Il est joint à ce message.

{{bloc_recapitulatif}}

Votre devis :

Référence : {{reference}}
Montant : {{montant_ttc}} € TTC ({{montant_ht}} € HT)

Ce devis reste à votre disposition. Pour le confirmer ou l'ajuster, répondez simplement à ce message ou appelez-nous.

{{bloc_contact}}

Bien cordialement,
L'équipe {{entreprise_nom}}`,
    options: { piece_jointe: "estimation" },
  },

  // ── Déménagement confirmé ──────────────────────────────────────────────
  {
    ancien: `Bonjour {{client_nom}},

Nous vous remercions pour votre confiance ! Votre devis {{reference}} est bien accepté et votre déménagement {{ville_depart}} → {{ville_arrivee}} est confirmé.

Notre équipe vous contactera pour organiser les détails (date, accès, préparation).

À très bientôt,
L'équipe {{entreprise_nom}}`,
    sujet: "Votre déménagement est confirmé — merci !",
    contenu: `Bonjour {{client_nom}},

Merci pour votre confiance ! Votre devis {{reference}} est accepté : votre déménagement est confirmé.

{{bloc_recapitulatif}}

Notre équipe vous contacte pour organiser les détails : date, accès, préparation.

{{bloc_contact}}

À très bientôt,
L'équipe {{entreprise_nom}}`,
  },

  // ── Devis refusé ───────────────────────────────────────────────────────
  {
    ancien: `Bonjour {{client_nom}},

Nous avons bien noté que notre devis {{reference}} ne vous convient pas pour le moment.

Votre projet nous tient à cœur : si vous le souhaitez, nous pouvons l'adapter (formule, date, prestations) pour mieux répondre à vos attentes.

N'hésitez pas à nous répondre, nous restons à votre entière disposition.

Bien à vous,
L'équipe {{entreprise_nom}}`,
    sujet: "Votre devis {{reference}} — nous restons à votre écoute",
    contenu: `Bonjour {{client_nom}},

Nous avons bien noté que notre devis {{reference}} ne vous convient pas pour le moment.

Votre projet nous tient à cœur : si vous le souhaitez, nous pouvons l'adapter — formule, date, prestations — pour mieux répondre à vos attentes.

{{bloc_contact}}

Bien à vous,
L'équipe {{entreprise_nom}}`,
  },

  // ── Relance ────────────────────────────────────────────────────────────
  {
    ancien: `Bonjour {{client_nom}},

Nous revenons vers vous au sujet de votre devis {{reference}} ({{montant_ttc}} € TTC) pour votre déménagement {{ville_depart}} → {{ville_arrivee}}.

Avez-vous des questions ? Souhaitez-vous que nous ajustions certains éléments (formule, date, prestations) ?

Nous restons disponibles pour en discuter.

L'équipe {{entreprise_nom}}`,
    sujet: "Votre devis {{reference}} — avez-vous des questions ?",
    contenu: `Bonjour {{client_nom}},

Nous revenons vers vous au sujet de votre devis {{reference}}, pour votre déménagement de {{ville_depart}} vers {{ville_arrivee}}.

{{bloc_recapitulatif}}

Avez-vous des questions ? Souhaitez-vous que nous ajustions certains éléments — formule, date, prestations ?

{{bloc_contact}}

L'équipe {{entreprise_nom}}`,
  },
];

/** Deux textes sont « les mêmes » aux espaces et aux apostrophes près. */
const net = (texte: string) =>
  texte
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const PAR_ANCIEN = new Map(DEFAUTS.map((d) => [net(d.ancien), d]));

/**
 * Le modèle tel qu'il part réellement : la version complète s'il est resté à
 * son texte d'origine, lui-même sinon.
 */
export function modeleEffectif<
  T extends { channel: string; sujet: string | null; contenu: string; options?: TemplateOptions | null },
>(tpl: T): T {
  if (tpl.channel !== "email") return tpl;
  const defaut = PAR_ANCIEN.get(net(tpl.contenu));
  if (!defaut) return tpl;
  // Un réglage explicite de la pièce jointe, s'il existe, reste celui de l'équipe.
  const regle = tpl.options && tpl.options.piece_jointe !== undefined;
  return {
    ...tpl,
    sujet: defaut.sujet,
    contenu: defaut.contenu,
    options: regle ? tpl.options : { ...(tpl.options ?? {}), ...(defaut.options ?? {}) },
  };
}
