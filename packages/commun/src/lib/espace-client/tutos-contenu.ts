/*
 * Le contenu des tutoriels de l'espace client — « Mes tutos » — en un seul
 * fichier, pour que Bailly le relise en une fois.
 *
 * Les lignes ec_tutos (réglées par l'équipe dans le CRM, Réglages de
 * l'espace client) décident toujours de l'ordre, de la publication, du titre,
 * du résumé et de la vidéo. Ce fichier apporte le reste, par tutoriel : la
 * promesse, le niveau, le matériel, les étapes expliquées et illustrées, les
 * chapitres de la vidéo, les erreurs à éviter, le conseil, la FAQ et le
 * geste à faire ensuite. Un tutoriel ajouté par l'équipe sans contenu ici
 * s'affiche avec ses seules étapes (une par ligne, saisies dans le CRM).
 *
 * D'OÙ VIENT CHAQUE TEXTE — chaque phrase passe par l'une de ces fonctions,
 * qui ne font rien d'autre que la marquer :
 *   voix(…)      dit mot pour mot par la voix off de la vidéo (fabrication :
 *                Code/Bailly tutos vidéo/_fabrication/src/tutos.mjs, où ces
 *                phrases portaient déjà la mention « à faire valider »). Le
 *                changer ici sans refaire la vidéo les ferait diverger ;
 *   espace(…)    repris des textes de l'espace client lui-même (formulaires,
 *                rubriques, règles du formulaire) ;
 *   site(…)      repris de demenagements-bailly.com, page citée en
 *                commentaire (consultée le 8 novembre 2026) ;
 *   aValider(…)  ÉCRIT POUR CES PAGES, À VALIDER PAR BAILLY. Des conseils
 *                pratiques généraux, sans prix, sans seuil d'assurance, sans
 *                délai ni engagement propre à Bailly : quand une règle
 *                compte et qu'aucune source ne la donne, le texte renvoie au
 *                conseiller.
 * Une phrase relue et validée par Bailly : remplacer aValider(…) par
 * valide(…).
 *
 * POINT À TRANCHER PAR BAILLY : le formulaire de déclaration de valeurs
 * exige qu'un objet de plus de 1 500 € se déclare seul (SEUIL_OBJET_DETAILLE,
 * schemas.ts, « à confirmer par Bailly »), et la vidéo le dit. La page
 * Assurances du site public parle, elle, d'une déclaration exigée « pour les
 * biens supérieur à 800 € » (garantie Luxe). Les textes ci-dessous suivent le
 * formulaire (le seuil est lu dans schemas.ts) ; si le seuil change, la
 * vidéo de la déclaration est à refaire.
 *
 * Les images : public/espace-client/tutos/<slug>/ — etape-NN.webp (fin de
 * chaque scène d'étape), erreur-N.webp (les cartes de la scène « erreurs »),
 * astuce.webp — tirées des vidéos livrées (1920 × 1080). Les temps des
 * chapitres sont ceux des sous-titres (.vtt, début de la première réplique) :
 * à reprendre si une vidéo est refaite.
 *
 * Pur : aucun import serveur, il sert aux pages comme aux tests.
 */

import { CATEGORIES_OBJETS, SEUIL_OBJET_DETAILLE } from "./schemas";

/** Dit par la voix off de la vidéo, mot pour mot. */
const voix = (t: string) => t;
/** Repris des textes de l'espace client. */
const espace = (t: string) => t;
/** Repris de demenagements-bailly.com. */
const site = (t: string) => t;
/** Écrit pour ces pages : à valider par Bailly. */
const aValider = (t: string) => t;
/** Relu et validé par Bailly (aucun pour l'instant). */
export const valide = (t: string) => t;

/** « 1 500 € », insécable : le seuil du formulaire de déclaration (schemas.ts). */
const seuil = `${SEUIL_OBJET_DETAILLE.toLocaleString("fr-FR").replace(/\s/g, " ")} €`;

/** Où mène le bouton « Faire maintenant », dans l'espace du dossier : « » = la page de garde. */
export type CibleAction = "" | "cartons" | "documents#valeurs";

/** Le moment du déménagement où le tutoriel sert : la recommandation s'en sert (tutos.ts). */
export type Phase = "emballage" | "declaration" | "jour_j";

export interface EtapeTuto {
  /** Le titre court, affiché à l'écran au-dessus de l'étape dans la vidéo. */
  titre: string;
  /** La consigne, telle que la dit la voix off. */
  consigne: string;
  /** L'explication, sous la consigne. */
  detail: string;
  /** Début de la réplique dans la vidéo, en secondes (sous-titres). */
  t: number;
}

export interface ContenuTuto {
  slug: string;
  /** La vidéo à laquelle se rapportent les chapitres et les images. */
  video: string;
  /** Sa durée, en secondes. */
  dureeVideo: number;
  phase: Phase;
  /** L'étape dont l'image représente le tutoriel (sa recommandation, en tête de « Mes tutos »), à partir de 1. */
  couverture: number;
  /** La promesse, en une phrase, sous le titre. */
  promesse: string;
  niveau: "Facile" | "Intermédiaire";
  /** « Ce qu'il vous faut ». */
  materiel: string[];
  etapes: EtapeTuto[];
  erreurs: { titre: string; detail: string }[];
  /** Début des répliques « Les erreurs à éviter » et « L'astuce Bailly ». */
  temps: { erreurs: number; astuce: number };
  /** « Le conseil des déménageurs » : l'astuce Bailly de la vidéo. */
  conseil: string;
  /** Une ligne sous le conseil. */
  conseilDetail: string;
  faq: { q: string; r: string }[];
  /** Le geste à faire après le tutoriel. */
  action: { cible: CibleAction; titre: string; texte: string; bouton: string };
}

const VIDEO = (slug: string) => `/espace-client/tutos/${slug}.mp4`;

/*
 * Les objets que le client transporte lui-même — site de Bailly, page
 * « Démarches et conseils » (/demenagement-particulier/demarches-et-conseils/) :
 * « Le client est responsable du transport des objets suivants : Bijoux,
 * perles, pierres et métaux précieux, monnaies, billets de banque ; Animaux,
 * denrées et produits périssables ; Marchandises classées dangereuses,
 * interdites, armes à feu… »
 */
const OBJETS_AVEC_VOUS = site("bijoux, perles, pierres et métaux précieux, monnaies et billets de banque");
const OBJETS_PERISSABLES = site("les animaux, les denrées et les produits périssables");

export const CONTENUS: ContenuTuto[] = [
  // --- 1 · Bien remplir un carton ----------------------------------------------------------------
  {
    slug: "bien-remplir-un-carton",
    video: VIDEO("bien-remplir-un-carton"),
    dureeVideo: 87.27,
    couverture: 5,
    phase: "emballage",
    promesse: aValider("Des cartons solides, faciles à porter, qui arrivent comme ils sont partis."),
    niveau: "Facile",
    materiel: [
      aValider("Des cartons de deux tailles : petits et grands"),
      aValider("Du ruban adhésif d'emballage"),
      aValider("Du papier à froisser : papier kraft ou papier journal"),
      aValider("Un marqueur épais"),
    ],
    etapes: [
      {
        titre: voix("La bonne taille"),
        consigne: voix("Choisissez la bonne taille : les petits cartons pour le lourd, les grands pour le léger."),
        detail: aValider("Livres, vaisselle, conserves ou outils vont dans les petits cartons : même pleins, ils restent portables. Le linge, les coussins et les jouets, légers et encombrants, prennent les grands."),
        t: 8.48,
      },
      {
        titre: voix("Un fond solide"),
        consigne: voix("Montez le fond en croisant deux bandes d'adhésif."),
        detail: aValider("Une bande sur la jointure des rabats, une autre en travers : le fond tient sous le poids et ne s'ouvre pas quand on soulève le carton."),
        t: 15.07,
      },
      {
        titre: voix("Un lit de papier"),
        consigne: voix("Tapissez le fond de papier froissé pour amortir les chocs."),
        detail: aValider("Quelques boules de papier suffisent : elles absorbent les secousses du trajet et protègent ce qui est posé au fond."),
        t: 20.67,
      },
      {
        titre: voix("Lourd en bas, léger en haut"),
        consigne: voix("Placez les objets lourds au fond, les plus légers au-dessus."),
        detail: aValider("Le carton est plus stable et rien de lourd n'écrase ce qui est délicat. La même règle vaut quand vous empilez les cartons : les plus lourds dessous."),
        t: 26.27,
      },
      {
        titre: voix("Rien ne bouge"),
        consigne: voix("Comblez les vides avec du papier froissé : rien ne doit bouger."),
        detail: aValider("Un objet qui glisse finit par cogner les autres. Du linge peut aussi servir de calage."),
        t: 31.87,
      },
      {
        titre: voix("15 kg maximum"),
        consigne: voix("Ne dépassez pas 15 kg : le carton doit se soulever d'une main."),
        detail: aValider("Au-delà, il devient pénible à porter et son fond peut céder. S'il vous fait forcer, répartissez son contenu dans un second carton."),
        t: 37.47,
      },
      {
        titre: voix("Plein, sans bomber"),
        consigne: voix("Remplissez jusqu'en haut, sans faire bomber le couvercle."),
        detail: aValider("Un carton plein résiste au poids de ceux qu'on pose dessus ; un couvercle bombé ferme mal et rend la pile instable."),
        t: 43.07,
      },
      {
        titre: voix("Fermer et noter la pièce"),
        consigne: voix("Fermez, puis notez la pièce de destination sur deux faces."),
        detail: aValider("Sur le dessus et sur un côté : une fois les cartons empilés, l'inscription reste lisible. Le tutoriel « Étiqueter pour un déballage facile » va plus loin."),
        t: 48.67,
      },
    ],
    erreurs: [
      { titre: voix("Un grand carton rempli de livres"), detail: voix("Bien trop lourd à porter.") },
      { titre: voix("Un carton à moitié vide"), detail: voix("Il s'écrase sous les autres.") },
      { titre: voix("Un couvercle qui bombe"), detail: voix("Le carton ferme mal et s'empile mal.") },
    ],
    temps: { erreurs: 54.27, astuce: 71.2 },
    conseil: voix("Avant de fermer, inclinez doucement le carton : si rien ne bouge, il est prêt."),
    conseilDetail: aValider("Un geste de quelques secondes, à faire pour chaque carton."),
    faq: [
      {
        q: aValider("Combien de cartons prévoir ?"),
        r: aValider("Cela dépend du volume de votre logement. La rubrique « Mes cartons » vous en donne une estimation d'après votre dossier ; votre conseiller peut l'ajuster."),
      },
      {
        q: aValider("Puis-je utiliser mes propres cartons ?"),
        r: aValider("Oui, s'ils sont propres, secs et rigides. Un carton déjà affaibli ou humide risque de céder ; des cartons de taille régulière s'empilent mieux."),
      },
      {
        q: aValider("Y a-t-il des objets à ne pas mettre en carton ?"),
        r: `${aValider("Oui. D'après les conseils de Bailly, certains objets voyagent avec vous et non dans le camion :")} ${OBJETS_AVEC_VOUS}, ${aValider("ainsi que")} ${OBJETS_PERISSABLES}. ${site("Les marchandises dangereuses ou interdites ne se transportent pas.")}`,
      },
    ],
    action: {
      cible: "cartons",
      titre: aValider("Vos cartons, en un clic"),
      texte: aValider("Choisissez le samedi où vos cartons vides vous sont livrés, ou indiquez que vous n'en avez pas besoin."),
      bouton: aValider("Mes cartons"),
    },
  },

  // --- 2 · Emballer la vaisselle -------------------------------------------------------------------
  {
    slug: "emballer-la-vaisselle",
    video: VIDEO("emballer-la-vaisselle"),
    dureeVideo: 82.92,
    couverture: 7,
    phase: "emballage",
    promesse: aValider("Assiettes, verres et tasses emballés pour arriver entiers."),
    niveau: "Intermédiaire",
    materiel: [
      aValider("Des cartons « vaisselle » renforcés, de taille moyenne"),
      aValider("Du papier bulle ou du papier journal"),
      aValider("Du papier à froisser pour caler"),
      aValider("Du ruban adhésif et un marqueur épais"),
    ],
    etapes: [
      {
        titre: voix("Un carton renforcé"),
        consigne: voix("Utilisez un carton « vaisselle » renforcé."),
        detail: aValider("Plus épais qu'un carton ordinaire, il supporte le poids de la vaisselle sans se déformer. Préférez une taille moyenne : rempli d'assiettes, un grand carton devient vite impossible à porter."),
        t: 7.16,
      },
      {
        titre: voix("Un fond bien amorti"),
        consigne: voix("Garnissez le fond d'une épaisse couche de papier froissé."),
        detail: aValider("C'est elle qui encaisse les chocs quand le carton est posé. Mieux vaut quelques centimètres de papier de trop qu'une assiette fêlée."),
        t: 12.76,
      },
      {
        titre: voix("Chaque pièce emballée"),
        consigne: voix("Emballez chaque pièce dans du papier bulle ou du papier journal."),
        detail: aValider("Une pièce par feuille : deux pièces au contact l'une de l'autre s'entrechoquent. Gardez le papier bulle pour les plus délicates."),
        t: 18.36,
      },
      {
        titre: voix("Sur la tranche"),
        consigne: voix("Rangez les assiettes sur la tranche, jamais à plat."),
        detail: aValider("Debout, comme dans un égouttoir, une assiette résiste bien mieux aux secousses ; à plat, elle porte le poids de toutes les autres."),
        t: 23.96,
      },
      {
        titre: voix("Les verres, un par un"),
        consigne: voix("Emballez les verres un par un, avec du papier glissé à l'intérieur."),
        detail: aValider("Le papier glissé dedans soutient les parois. Les verres à pied méritent un tour de papier de plus autour du pied."),
        t: 29.56,
      },
      {
        titre: voix("Le lourd en bas"),
        consigne: voix("Placez les pièces lourdes en bas, les verres et les tasses en haut."),
        detail: aValider("Plats et assiettes forment la base ; verres, tasses et petites pièces voyagent au-dessus, là où rien ne pèse sur eux."),
        t: 35.16,
      },
      {
        titre: voix("Rien ne tinte"),
        consigne: voix("Calez chaque vide : rien ne doit tinter quand vous soulevez le carton."),
        detail: aValider("Soulevez le carton et inclinez-le doucement : au moindre bruit, ajoutez du papier. Un carton silencieux est un carton bien fait."),
        t: 40.76,
      },
      {
        titre: voix("FRAGILE et « haut »"),
        consigne: voix("Écrivez FRAGILE et une flèche « haut » sur le carton."),
        detail: aValider("En grand, sur plusieurs faces : celui qui porte le carton sait aussitôt comment le tenir et dans quel sens le poser."),
        t: 46.36,
      },
    ],
    erreurs: [
      { titre: voix("Empiler les assiettes à plat"), detail: voix("Elles encaissent mal les chocs.") },
      { titre: voix("Trop charger le carton"), detail: voix("La vaisselle dépasse vite les 15 kg.") },
      { titre: voix("Laisser du jeu"), detail: voix("Une pièce qui bouge peut se casser.") },
    ],
    temps: { erreurs: 51.96, astuce: 67.57 },
    conseil: voix("Torchons et serviettes font un très bon calage : vous emballez et rangez en même temps."),
    conseilDetail: aValider("Gardez-les propres et secs : ils serviront dès le premier soir."),
    faq: [
      {
        q: aValider("Qui emballe la vaisselle : moi ou l'équipe ?"),
        r: aValider("Cela dépend de la formule choisie avec votre devis. En cas de doute, demandez à votre conseiller avant de commencer."),
      },
      {
        q: aValider("Et les pièces de grande valeur ?"),
        r: aValider("Cristal, porcelaine ancienne, pièces de collection : signalez-les à votre conseiller avant le jour J, et pensez à les reporter dans votre déclaration de valeurs."),
      },
      {
        q: aValider("Que faire des bouteilles et des provisions ?"),
        r: `${aValider("Les conseils de Bailly rangent")} ${site("les denrées et les produits périssables")} ${aValider("parmi les objets que vous transportez vous-même. Videz et dégivrez le réfrigérateur et le congélateur la semaine d'avant.")}`,
      },
    ],
    action: {
      cible: "cartons",
      titre: aValider("Des cartons pour la cuisine"),
      texte: aValider("Votre livraison de cartons se règle dans « Mes cartons » : le samedi qui vous convient, à votre adresse."),
      bouton: aValider("Mes cartons"),
    },
  },

  // --- 3 · Étiqueter pour un déballage facile ------------------------------------------------------
  {
    slug: "etiqueter-pour-un-deballage-facile",
    video: VIDEO("etiqueter-pour-un-deballage-facile"),
    dureeVideo: 73.32,
    couverture: 1,
    phase: "emballage",
    promesse: aValider("Chaque carton trouve sa pièce, et vous retrouvez chaque objet sans tout ouvrir."),
    niveau: "Facile",
    materiel: [
      aValider("Des gommettes ou du ruban adhésif de couleur"),
      aValider("Un marqueur épais"),
      aValider("Une feuille, ou une note sur votre téléphone, pour la liste"),
    ],
    etapes: [
      {
        titre: voix("Une couleur par pièce"),
        consigne: voix("Attribuez une couleur à chaque pièce du nouveau logement."),
        detail: aValider("Cuisine en jaune, salon en vert, chambre en bleu… Pensez aux pièces du logement d'arrivée, pas à celles que vous quittez : c'est là que les cartons seront posés."),
        t: 7.84,
      },
      {
        titre: voix("Sur deux faces"),
        consigne: voix("Collez cette couleur sur deux faces de chaque carton."),
        detail: aValider("Le dessus et un côté : empilés ou alignés contre un mur, les cartons se lisent d'un coup d'œil."),
        t: 13.44,
      },
      {
        titre: voix("Un numéro par carton"),
        consigne: voix("Numérotez les cartons et tenez une liste simple."),
        detail: aValider("1, 2, 3… à la suite, toutes pièces confondues : la couleur dit où va le carton, le numéro permet de le retrouver et de vérifier à l'arrivée qu'aucun ne manque."),
        t: 19.04,
      },
      {
        titre: voix("Le contenu, en bref"),
        consigne: voix("Sur la liste, notez en quelques mots le contenu de chaque carton."),
        detail: aValider("« 12 · Cuisine · casseroles et poêles » suffit. C'est cette liste qui vous évitera d'ouvrir dix cartons pour trouver la cafetière."),
        t: 24.64,
      },
      {
        titre: voix("Les cartons « 1er soir »"),
        consigne: voix("Signalez les cartons à ouvrir en premier (« 1er soir »)."),
        detail: aValider("Une mention bien visible, ou une couleur à part : ce sont les cartons que vous ouvrirez dès l'arrivée, avant tous les autres."),
        t: 30.24,
      },
      {
        titre: voix("De quoi passer la nuit"),
        consigne: voix("Mettez-y de quoi passer la première nuit : draps, serviettes, affaires de toilette."),
        detail: aValider("Ajoutez ce qui vous servira le soir même et le lendemain matin : une tenue de rechange, de quoi préparer un petit-déjeuner, du papier toilette."),
        t: 35.84,
      },
      {
        titre: voix("Chaque couleur à sa porte"),
        consigne: voix("À l'arrivée, affichez chaque couleur sur la porte de sa pièce."),
        detail: aValider("Faites-le avant le déchargement : chaque carton est posé directement dans la bonne pièce, sans que vous ayez à guider chaque porteur."),
        t: 41.99,
      },
    ],
    erreurs: [
      { titre: voix("Écrire « divers »"), detail: voix("Personne ne sait où poser le carton.") },
      { titre: voix("N'étiqueter que le dessus"), detail: voix("Illisible une fois les cartons empilés.") },
    ],
    temps: { erreurs: 47.59, astuce: 59.69 },
    conseil: voix("Prenez votre liste en photo : vous l'aurez toujours sur vous."),
    conseilDetail: aValider("Et refaites la photo à chaque nouvelle page de la liste."),
    faq: [
      {
        q: aValider("Les gommettes de couleur sont-elles indispensables ?"),
        r: aValider("Non : un feutre de couleur, ou le nom de la pièce écrit en grand, fonctionne aussi. L'essentiel est que ce soit lisible de loin, sur deux faces."),
      },
      {
        q: aValider("Faut-il aussi signaler les cartons fragiles ?"),
        r: aValider("Oui : « FRAGILE » et une flèche « haut », en plus de la couleur et du numéro. Le tutoriel « Emballer la vaisselle » le montre."),
      },
      {
        q: aValider("Et si je démonte moi-même un meuble ?"),
        r: aValider("Mettez les vis et les petites pièces dans un sachet fermé, fixé au meuble ou rangé dans un carton bien identifié, et notez-le sur votre liste."),
      },
    ],
    action: {
      cible: "cartons",
      titre: aValider("Prêt à étiqueter ?"),
      texte: aValider("Il vous faut d'abord des cartons : leur livraison se règle dans « Mes cartons »."),
      bouton: aValider("Mes cartons"),
    },
  },

  // --- 4 · Remplir sa déclaration de valeurs -------------------------------------------------------
  {
    slug: "remplir-sa-declaration-de-valeurs",
    video: VIDEO("remplir-sa-declaration-de-valeurs"),
    dureeVideo: 77.79,
    couverture: 7,
    phase: "declaration",
    promesse: aValider("Une déclaration complète et juste, remplie en ligne, sans rien oublier."),
    niveau: "Facile",
    materiel: [
      espace("Votre espace client, rubrique « Mes documents »"),
      aValider("Le temps de faire le tour du logement, pièce par pièce"),
      aValider("Une idée des prix actuels, ou vos factures, pour les objets de valeur"),
    ],
    etapes: [
      {
        titre: voix("Mes documents"),
        consigne: voix("Ouvrez « Mes documents », rubrique « Déclaration de valeurs »."),
        detail: `${espace("Elle sert de base à votre assurance. Listez vos biens par catégorie avec leur valeur de remplacement : le total se calcule automatiquement.")} ${aValider("Le bouton « Faire maintenant », plus bas, vous y mène directement.")}`,
        t: 8.44,
      },
      {
        titre: voix("Pièce par pièce"),
        consigne: voix("Faites le tour du logement, pièce par pièce."),
        detail: aValider("En suivant le logement plutôt que votre mémoire, vous n'oubliez rien : placards, rangements, cave, grenier, garage, balcon."),
        t: 14.04,
      },
      {
        titre: voix("Par catégorie"),
        consigne: voix("Listez les objets par catégorie (mobilier, électroménager…)."),
        detail: `${aValider("Le formulaire propose ses catégories :")} ${espace(CATEGORIES_OBJETS.map((c) => c.toLowerCase()).join(", "))}.`,
        t: 19.64,
      },
      {
        titre: voix("Désignation et quantité"),
        consigne: voix("Pour chaque ligne, précisez la désignation et la quantité."),
        detail: aValider("Une ligne peut regrouper des objets semblables — « chaises de salle à manger », quantité 6 —, pourvu que chacune se reconnaisse."),
        t: 25.47,
      },
      {
        titre: voix("La valeur de remplacement"),
        consigne: voix("Indiquez une valeur de remplacement réaliste, pas le prix d'achat d'origine."),
        detail: aValider("C'est ce que coûterait aujourd'hui un objet équivalent. Les conditions d'indemnisation dépendent de la garantie choisie : votre conseiller vous les précise."),
        t: 31.07,
      },
      {
        titre: voix("Plus de 1 500 € : à part"),
        consigne: voix("Détaillez à part tout objet de plus de 1 500 €."),
        detail: `${aValider("Le formulaire l'exige :")} ${espace(`au-delà de ${seuil}, un objet se déclare seul (quantité 1).`)} ${aValider("Il a sa propre ligne, avec sa propre valeur.")}`,
        t: 36.67,
      },
      {
        titre: voix("Vérifier, puis valider"),
        consigne: voix("Vérifiez le total puis validez en ligne."),
        detail: aValider("Relisez chaque ligne, cochez la certification et transmettez : la date de transmission s'affiche ensuite dans votre espace."),
        t: 42.27,
      },
    ],
    erreurs: [
      { titre: voix("Oublier la cave, le grenier ou le garage"), detail: aValider("Ce qu'on ne voit pas tous les jours s'oublie facilement : faites-en le tour aussi.") },
      { titre: voix("Reprendre le prix d'achat d'origine"), detail: voix("Au lieu de la valeur de remplacement.") },
      { titre: voix("Regrouper un objet de plus de 1 500 €"), detail: voix("Avec d'autres sur une même ligne.") },
    ],
    temps: { erreurs: 47.87, astuce: 64.16 },
    conseil: voix("Remplissez-la avant d'emballer : tout est encore sous vos yeux."),
    conseilDetail: aValider("Vous listez chaque objet en l'ayant devant vous, pièce par pièce."),
    faq: [
      {
        q: aValider("Quand la remplir ?"),
        r: `${aValider("Le plus tôt possible. Le calendrier publié par Bailly la place deux mois avant le déménagement, et elle se remplit mieux avant d'emballer.")}`,
      },
      {
        q: aValider("Que faire des bijoux et de l'argent liquide ?"),
        r: `${aValider("Les conseils de Bailly les rangent parmi les objets que vous transportez vous-même :")} ${OBJETS_AVEC_VOUS}. ${aValider("Gardez-les avec vous le jour du déménagement.")}`,
      },
      {
        q: aValider("Comment fonctionne l'indemnisation ?"),
        r: aValider("Elle dépend de la garantie choisie avec votre devis. Pour toute question sur votre couverture, demandez à votre conseiller."),
      },
      {
        q: aValider("Puis-je la corriger après l'avoir transmise ?"),
        r: aValider("Une fois transmise, elle s'affiche en lecture dans « Mes documents ». Pour la modifier, écrivez à votre conseiller."),
      },
    ],
    action: {
      cible: "documents#valeurs",
      titre: aValider("Votre déclaration de valeurs"),
      texte: espace("Elle sert de base à votre assurance. Listez vos biens par catégorie avec leur valeur de remplacement : le total se calcule automatiquement."),
      bouton: aValider("Remplir ma déclaration"),
    },
  },

  // --- 5 · La check-list du jour J -----------------------------------------------------------------
  {
    slug: "la-check-list-du-jour-j",
    video: VIDEO("la-check-list-du-jour-j"),
    dureeVideo: 77.68,
    couverture: 2,
    phase: "jour_j",
    promesse: aValider("Le jour du départ, l'essentiel sous la main et rien d'oublié derrière vous."),
    niveau: "Facile",
    materiel: [
      aValider("Un sac qui reste avec vous"),
      aValider("Vos papiers, vos clés, vos chargeurs, vos médicaments"),
      aValider("Votre téléphone, pour photographier les compteurs"),
    ],
    etapes: [
      {
        titre: voix("Un sac pour vous"),
        consigne: voix("La veille, préparez un sac qui restera avec vous."),
        detail: `${aValider("C'est le conseil de Bailly :")} ${site("un kit avec l'essentiel — vêtements, affaires de toilette, chargeurs, papiers importants — que vous garderez avec vous.")}`,
        t: 7.92,
      },
      {
        titre: voix("L'essentiel sur vous"),
        consigne: voix("Gardez avec vous papiers, clés, chargeurs et médicaments."),
        detail: `${aValider("Ajoutez-y ce que vous transportez vous-même, d'après les conseils de Bailly :")} ${OBJETS_AVEC_VOUS}.`,
        t: 13.52,
      },
      {
        titre: voix("Des passages dégagés"),
        consigne: voix("Dégagez les passages : entrée, couloirs et escaliers."),
        detail: aValider("Retirez tapis, chaussures et objets qui traînent : on circule chargé, et chaque obstacle ralentit ou fait trébucher."),
        t: 19.12,
      },
      {
        titre: voix("Le chef d'équipe"),
        consigne: voix("Accueillez le chef d'équipe et signalez-lui les objets fragiles."),
        detail: aValider("Montrez-lui aussi ce qui reste sur place : rien ne partira par erreur."),
        t: 24.72,
      },
      {
        titre: voix("Les compteurs"),
        consigne: voix("Relevez les compteurs d'eau, d'électricité et de gaz."),
        detail: aValider("Notez chaque index, avec la date : ils servent à clore vos contrats et, si vous êtes locataire, à l'état des lieux de sortie."),
        t: 30.32,
      },
      {
        titre: voix("Le dernier tour"),
        consigne: voix("Faites un dernier tour de chaque pièce avec le chef d'équipe."),
        detail: aValider("Pièce par pièce, une fois le logement vidé : c'est le moment de repérer un oubli, tant que le camion est encore là."),
        t: 35.92,
      },
      {
        titre: voix("Placards et tiroirs"),
        consigne: voix("Ouvrez chaque placard et chaque tiroir : rien ne doit être oublié."),
        detail: aValider("Sans oublier la cave, le grenier, le garage, le balcon et la boîte aux lettres."),
        t: 41.52,
      },
      {
        titre: voix("La lettre de voiture"),
        consigne: voix("Vérifiez la lettre de voiture avant de la signer."),
        detail: aValider("Prenez le temps de la relire. Si quelque chose vous semble inexact, posez la question avant de signer."),
        t: 47.39,
      },
    ],
    erreurs: [
      { titre: voix("Ranger ses papiers dans un carton déjà chargé"), detail: aValider("Ils partent avec le camion : gardez-les dans votre sac.") },
      { titre: voix("Signer la lettre de voiture sans l'avoir relue"), detail: aValider("Quelques minutes de lecture suffisent.") },
    ],
    temps: { erreurs: 52.99, astuce: 62.69 },
    conseil: voix("Photographiez chaque compteur : l'index et la date restent dans votre téléphone."),
    conseilDetail: aValider("Faites de même au logement d'arrivée, dès votre entrée."),
    faq: [
      {
        q: aValider("Que préparer la semaine d'avant ?"),
        r: `${aValider("D'après le calendrier de Bailly :")} ${site("dégivrer le réfrigérateur et le congélateur, vérifier que vos changements d'adresse sont faits et que le suivi de votre courrier est actif, préparer votre kit d'essentiels.")}`,
      },
      {
        q: aValider("Dois-je être présent toute la journée ?"),
        r: aValider("Votre présence, ou celle d'une personne de confiance, compte surtout à deux moments : l'accueil de l'équipe et le dernier tour avant la signature. Pour le reste, voyez avec votre conseiller."),
      },
      {
        q: aValider("Et à l'arrivée ?"),
        r: aValider("Affichez les couleurs de vos pièces sur les portes, puis ouvrez d'abord vos cartons « 1er soir » : le tutoriel « Étiqueter pour un déballage facile » vous l'explique."),
      },
    ],
    action: {
      cible: "",
      titre: aValider("Tout est prêt de votre côté ?"),
      texte: aValider("La page « Mon déménagement » vous montre ce qui est fait et ce qu'il reste à faire avant le grand jour."),
      bouton: aValider("Mon déménagement"),
    },
  },
];

const PAR_SLUG = new Map(CONTENUS.map((c) => [c.slug, c]));

/** Le contenu d'un tutoriel, par son slug ; rien pour un tutoriel ajouté par l'équipe. */
export function contenuDe(slug: string): ContenuTuto | null {
  return PAR_SLUG.get(slug) ?? null;
}

// --- Les textes du hub et de la recommandation ------------------------------------------------------

export const TEXTES_HUB = {
  titre: aValider("Préparer son déménagement, pas à pas"),
  sous: aValider("Des tutoriels vidéo de quelques minutes, et pour chacun les étapes expliquées, les erreurs à éviter et le conseil des déménageurs."),
  bibliothequeKicker: aValider("Les tutoriels"),
  bibliothequeTitre: aValider("Un geste, une vidéo"),
  bibliothequeIntro: aValider("Chaque tutoriel tient en une vidéo courte et une page à garder sous la main : regardez, puis faites."),
  checkListTitre: aValider("La check-list du déménagement"),
  checkListTexte: aValider("De deux mois avant au soir de l'arrivée, toutes les étapes sur une seule page, à imprimer et à cocher."),
  toutVu: aValider("Vous avez vu tous les tutoriels. Ils restent ici, à revoir quand vous voulez."),
  ouDirectement: aValider("Ou directement :"),
  // Sans recommandation : tout est vu, ou le déménagement est passé.
  calmeToutVuTitre: aValider("Tout est vu"),
  calmeToutVuTexte: aValider("Gardez la check-list du déménagement sous la main : elle s'imprime en une page."),
  calmeApresTitre: aValider("Votre déménagement est passé"),
  calmeApresTexte: aValider("Les tutoriels restent ici, à revoir quand vous voulez, comme la check-list du déménagement."),
  checkListEspace: aValider("Dans votre espace client"),
  checkListPied: aValider("Retrouvez les tutoriels en vidéo dans votre espace client, rubrique « Mes tutos »."),
};

/** Les titres et les phrases de la page d'un tutoriel (hors contenu propre à chaque tutoriel). */
export const TEXTES_TUTO = {
  etapesKicker: aValider("Le pas à pas"),
  etapesTitre: aValider("Étape par étape"),
  etapesIntro: (n: number, chapitres: boolean) =>
    chapitres ? aValider(`${n} gestes, dans l'ordre de la vidéo : chacun s'y retrouve en un clic.`) : aValider(`${n} gestes, dans l'ordre.`),
  erreursKicker: aValider("À éviter"),
  erreursTitre: aValider("Les erreurs à éviter"),
  conseilTitre: aValider("Le conseil des déménageurs"),
  faqKicker: aValider("Questions fréquentes"),
  faqTitre: aValider("Bon à savoir"),
  faqAutre: aValider("Une autre question ?"),
  faireKicker: aValider("Faire maintenant"),
  declarationFaite: aValider("Votre déclaration est transmise"),
  declarationRevoir: aValider("Revoir ma déclaration"),
  suiteKicker: aValider("Votre progression"),
  suiteTitre: (vu: boolean) => (vu ? aValider("Tutoriel terminé") : aValider("Vous avez terminé ce tutoriel ?")),
  aideVu: aValider("Se coche aussi tout seul à la fin de la vidéo."),
  suivantKicker: aValider("Tutoriel suivant"),
  finKicker: aValider("C'était le dernier"),
  finTitre: aValider("Tous les tutoriels"),
  finTexte: aValider("Et la check-list du déménagement, à imprimer."),
};

/** Pourquoi ce tutoriel est recommandé : une ligne au-dessus, une phrase dessous (tutos.ts, recommander). */
export const RAISONS = {
  jourJ: (jours: number) => ({
    titre: jours <= 0 ? aValider("C'est le grand jour") : jours === 1 ? aValider("Votre déménagement, c'est demain") : aValider(`Votre déménagement est dans ${jours} jours`),
    texte: aValider("Passez en revue ce qu'il faut garder sur vous et vérifier avant de partir."),
  }),
  declaration: () => ({
    titre: aValider("Votre déclaration de valeurs vous attend"),
    texte: aValider("Elle n'est pas encore transmise. Ce tutoriel vous guide, ligne par ligne."),
  }),
  emballage: () => ({
    titre: aValider("Votre déménagement est confirmé"),
    texte: aValider("C'est le moment de préparer vos cartons."),
  }),
  suite: () => ({
    titre: aValider("Pour continuer"),
    texte: aValider("Le prochain tutoriel que vous n'avez pas encore vu."),
  }),
};

// --- La check-list imprimable ----------------------------------------------------------------------

/** Une ligne à cocher ; `tuto` : le tutoriel qui l'explique (slug). */
export interface LigneCheckList {
  texte: string;
  tuto?: string;
}

/*
 * Les périodes « deux mois avant », « un mois avant » et « la semaine
 * d'avant » reprennent le calendrier de la page « Démarches et conseils » du
 * site de Bailly (/demenagement-particulier/demarches-et-conseils/) ; les
 * gestes d'emballage et du jour J, les tutoriels. Le bloc « Dans votre
 * espace » se calcule du dossier (la frise), il n'est pas écrit ici.
 */
export const CHECK_LIST: { titre: string; lignes: LigneCheckList[] }[] = [
  {
    titre: site("Deux mois avant"),
    lignes: [
      { texte: site("Prévenir votre propriétaire ou votre syndic de votre départ") },
      { texte: site("Vérifier vos droits et demander la prime de déménagement à votre employeur ou à la Caisse d'allocations familiales") },
      { texte: site("Commencer le tri : vendre, donner ou jeter ce qui ne vous suit pas") },
      { texte: site("Remplir et transmettre la déclaration de valeurs"), tuto: "remplir-sa-declaration-de-valeurs" },
      { texte: site("Chercher les nouvelles écoles, préparer le nouveau logement") },
    ],
  },
  {
    titre: site("Un mois avant"),
    lignes: [
      { texte: site("Donner votre nouvelle adresse à vos banques, assurances et abonnements") },
      { texte: site("Prévenir vos fournisseurs d'énergie et de télécoms : résiliation et mise en service") },
      { texte: site("Mettre en place le suivi de votre courrier auprès de La Poste") },
      { texte: site("Prévenir les impôts, la sécurité sociale et votre caisse de retraite") },
      { texte: site("Locataire : fixer la date de l'état des lieux de sortie") },
    ],
  },
  {
    titre: aValider("Pendant l'emballage"),
    lignes: [
      { texte: voix("Les petits cartons pour le lourd, les grands pour le léger"), tuto: "bien-remplir-un-carton" },
      { texte: voix("Ne dépassez pas 15 kg : le carton doit se soulever d'une main"), tuto: "bien-remplir-un-carton" },
      { texte: voix("Rangez les assiettes sur la tranche, jamais à plat"), tuto: "emballer-la-vaisselle" },
      { texte: voix("Une couleur par pièce, un numéro par carton"), tuto: "etiqueter-pour-un-deballage-facile" },
      { texte: voix("Signalez les cartons à ouvrir en premier (« 1er soir »)"), tuto: "etiqueter-pour-un-deballage-facile" },
    ],
  },
  {
    titre: site("La semaine d'avant"),
    lignes: [
      { texte: site("Dégivrer le réfrigérateur et le congélateur") },
      { texte: site("Vérifier que vos changements d'adresse sont faits et que le suivi du courrier est actif") },
      { texte: site("Préparer un kit avec l'essentiel, que vous garderez avec vous"), tuto: "la-check-list-du-jour-j" },
    ],
  },
  {
    titre: voix("Le jour J"),
    lignes: [
      { texte: voix("Gardez avec vous papiers, clés, chargeurs et médicaments"), tuto: "la-check-list-du-jour-j" },
      { texte: voix("Dégagez les passages : entrée, couloirs et escaliers"), tuto: "la-check-list-du-jour-j" },
      { texte: voix("Accueillez le chef d'équipe et signalez-lui les objets fragiles"), tuto: "la-check-list-du-jour-j" },
      { texte: voix("Relevez les compteurs d'eau, d'électricité et de gaz"), tuto: "la-check-list-du-jour-j" },
      { texte: voix("Ouvrez chaque placard et chaque tiroir : rien ne doit être oublié"), tuto: "la-check-list-du-jour-j" },
      { texte: voix("Vérifiez la lettre de voiture avant de la signer"), tuto: "la-check-list-du-jour-j" },
    ],
  },
  {
    titre: aValider("À l'arrivée"),
    lignes: [
      { texte: voix("À l'arrivée, affichez chaque couleur sur la porte de sa pièce"), tuto: "etiqueter-pour-un-deballage-facile" },
      { texte: aValider("Ouvrez d'abord les cartons « 1er soir »"), tuto: "etiqueter-pour-un-deballage-facile" },
      { texte: aValider("Relevez les compteurs du nouveau logement") },
      { texte: site("Mettre à jour l'adresse de votre carte grise dans le mois") },
    ],
  },
];

/** L'encadré de la check-list : ce que le client transporte lui-même (site de Bailly). */
export const A_GARDER_AVEC_VOUS = {
  titre: aValider("À transporter vous-même"),
  texte: `${OBJETS_AVEC_VOUS} ; ${OBJETS_PERISSABLES}. ${site("Les marchandises dangereuses ou interdites ne se transportent pas.")}`,
};
