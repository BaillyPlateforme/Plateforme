import "server-only";
import { TEXTES_ESPACE } from "@/lib/espace-client/textes-messages";
import { q, q1, type Row } from "@/crm/lib/db";

/*
 * Le catalogue des messages — « Courriers et SMS », vu comme une marketplace :
 * une carte par type d'action (visite confirmée, devis prêt, arrhes reçues…).
 *
 * Une seule source de vérité pour les textes : crm.modeles_messages. Le
 * catalogue n'ajoute pas de couche ; il dit, pour chaque type d'action, quelle
 * ligne en porte le texte, et la rapproche :
 *   - les modèles du CRM existants (semés par seed2.ts) reçoivent leur clé,
 *     retrouvés par leur nom — leur texte ne bouge pas ;
 *   - les messages de l'espace client au client, jusqu'ici écrits dans le
 *     code, y entrent avec leur texte d'origine (textes-messages.ts) ;
 *   - un type d'action sans texte validé y entre vide, désactivé, marqué
 *     « texte à valider » : rien n'est inventé.
 * Les messages des questionnaires gardent leur moteur (message_templates et
 * règles, avec leurs blocs) : l'écran les montre et les modifie par leurs
 * propres actions, sans les recopier.
 */

export type Etape = "demande" | "visite" | "devis" | "commande" | "cartons" | "demenagement" | "facturation" | "apres";

export const ETAPES: { cle: Etape; libelle: string }[] = [
  { cle: "demande", libelle: "Demande" },
  { cle: "visite", libelle: "Visite" },
  { cle: "devis", libelle: "Devis" },
  { cle: "commande", libelle: "Dossier" },
  { cle: "cartons", libelle: "Cartons" },
  { cle: "demenagement", libelle: "Déménagement" },
  { cle: "facturation", libelle: "Facturation" },
  { cle: "apres", libelle: "Après" },
];

/** Les variables des modèles du CRM, remplacées à l'envoi. */
export const VARIABLES_CRM = ["client", "commercial", "date", "heure", "ref"];

export type EntreeCatalogue = {
  cle: string;
  /** Le type d'action, titre de la carte. */
  titre: string;
  etape: Etape;
  canal: "email" | "sms";
  /** Quand le message part. */
  declencheur: string;
  /** Le délai, en clair, quand il n'est pas réglé par une règle de relance. */
  delai?: string;
  /** La règle de relance qui l'envoie (crm.relances_regles). */
  regle?: string;
  /** Le modèle du CRM à rapprocher, par son nom d'origine. */
  nomCrm?: string;
  /** Le texte de départ (espace client) ; sans lui et sans modèle du CRM, la carte attend son texte. */
  depart?: { objet: string | null; corps: string };
  /** Le texte vient du code, et n'est pas modifiable ici (le lien d'accès). */
  texteCode?: boolean;
  variables: string[];
  /** La carte ne se désactive pas, pour cette raison. */
  verrouillee?: string;
  /** Le déclencheur n'est pas encore branché : la carte attend son texte et son branchement. */
  aBrancher?: boolean;
  /** Les noms de modèle sous lesquels ses envois sont au journal (public.envois). */
  journal: string[];
};

const espace = (cle: string) => {
  const t = TEXTES_ESPACE.find((x) => x.cle === cle)!;
  return { depart: { objet: t.objet, corps: t.corps }, variables: t.variables, journal: [t.modele] };
};

export const CATALOGUE: EntreeCatalogue[] = [
  // ── Visite ──────────────────────────────────────────────────────────────
  { cle: "rdv_confirmation", titre: "Visite confirmée", etape: "visite", canal: "sms", nomCrm: "Confirmation de rendez-vous", variables: VARIABLES_CRM, journal: ["Confirmation de rendez-vous"],
    declencheur: "À la prise d'un rendez-vous de visite (sur place ou en visio), et sur « SMS de confirmation » dans le dossier.", delai: "Aussitôt" },
  { cle: "rdv_rappel_veille", titre: "Rappel de la veille", etape: "visite", canal: "sms", nomCrm: "Rappel de visite (veille)", variables: VARIABLES_CRM, journal: ["Rappel de visite (veille)"],
    declencheur: "La veille du rendez-vous, par la tâche de la veille.", delai: "J−1, en fin d'après-midi" },
  { cle: "rdv_manque", titre: "Rendez-vous manqué", etape: "visite", canal: "sms", nomCrm: "Rendez-vous manqué", variables: VARIABLES_CRM, journal: ["Rendez-vous manqué"],
    declencheur: "Aucun envoi automatique : modèle à disposition de l'équipe." },
  { cle: "fiche_visite", titre: "Fiche de visite", etape: "visite", canal: "email", nomCrm: "Fiche de visite", variables: VARIABLES_CRM, journal: ["Fiche de visite"],
    declencheur: "Aucun envoi automatique : modèle à disposition de l'équipe." },
  // ── Devis ───────────────────────────────────────────────────────────────
  { cle: "devis_pret", titre: "Devis prêt", etape: "devis", canal: "email", nomCrm: "Envoi du devis", variables: VARIABLES_CRM, journal: ["Envoi du devis"],
    declencheur: "« Envoyer » ou « Envoyer pour signature » sur un devis du dossier : le devis et son lien de signature.", delai: "Aussitôt" },
  { cle: "devis_relance", titre: "Devis à relancer", etape: "devis", canal: "email", nomCrm: "Relance de devis", regle: "devis", variables: VARIABLES_CRM, journal: ["Relance de devis"],
    declencheur: "Un devis envoyé reste sans signature : relance par la tâche de la veille." },
  { cle: "devis_signe", titre: "Devis signé", etape: "devis", canal: "email", variables: VARIABLES_CRM, journal: ["devis_signe"], aBrancher: true,
    declencheur: "À la signature d'un devis — déclencheur à brancher une fois le texte validé." },
  // ── Dossier (espace client) ─────────────────────────────────────────────
  { cle: "ec_acces", titre: "Accès à l'espace client", etape: "commande", canal: "email", texteCode: true, variables: [], journal: ["acces"],
    verrouillee: "Indispensable : c'est le lien de connexion du client.", declencheur: "À l'ouverture de l'espace, et à chaque lien demandé ou renvoyé.", delai: "Aussitôt" },
  { cle: "ec_document_depose", titre: "Document déposé", etape: "commande", canal: "email", ...espace("ec_document_depose"),
    declencheur: "Quand l'équipe dépose un document dans l'espace du client.", delai: "Aussitôt" },
  { cle: "relance_pieces", titre: "Pièces manquantes", etape: "commande", canal: "email", regle: "pieces", variables: [...VARIABLES_CRM, "pieces"], journal: ["relance_pieces"],
    declencheur: "Des pièces à fournir manquent avant le déménagement : relance par la tâche de la veille." },
  { cle: "relance_conditions", titre: "Conditions de livraison", etape: "commande", canal: "email", regle: "conditions", variables: VARIABLES_CRM, journal: ["relance_conditions"],
    declencheur: "Les conditions de livraison ne sont pas validées avant le déménagement : relance par la tâche de la veille." },
  // ── Cartons ─────────────────────────────────────────────────────────────
  { cle: "ec_creneau_cartons_sms", titre: "Cartons : créneau de la veille", etape: "cartons", canal: "sms", ...espace("ec_creneau_cartons_sms"),
    declencheur: "La veille du samedi de livraison des cartons, par la tâche de la veille.", delai: "J−1" },
  { cle: "ec_creneau_cartons", titre: "Cartons : créneau de la veille", etape: "cartons", canal: "email", ...espace("ec_creneau_cartons"),
    declencheur: "La veille du samedi de livraison des cartons, par la tâche de la veille.", delai: "J−1" },
  { cle: "cartons_annonce", titre: "Livraison de cartons", etape: "cartons", canal: "sms", nomCrm: "Livraison de cartons", variables: VARIABLES_CRM, journal: ["Livraison de cartons"],
    declencheur: "Aucun envoi automatique : modèle à disposition de l'équipe." },
  { cle: "cartons_livres", titre: "Cartons livrés", etape: "cartons", canal: "sms", variables: VARIABLES_CRM, journal: ["cartons_livres"], aBrancher: true,
    declencheur: "Quand les cartons sont marqués livrés — déclencheur à brancher une fois le texte validé." },
  // ── Déménagement ─────────────────────────────────────────────────────────
  { cle: "veille_demenagement", titre: "Veille du déménagement", etape: "demenagement", canal: "sms", variables: VARIABLES_CRM, journal: ["veille_demenagement"],
    declencheur: "La veille du chargement, par la tâche de la veille.", delai: "J−1" },
  { cle: "lettre_voiture", titre: "Lettre de voiture", etape: "demenagement", canal: "email", nomCrm: "Lettre de voiture", variables: VARIABLES_CRM, journal: ["Lettre de voiture"],
    declencheur: "Aucun envoi automatique : modèle à disposition de l'équipe." },
  // ── Facturation ─────────────────────────────────────────────────────────
  { cle: "ec_paiement_confirme", titre: "Arrhes reçues · facture payée", etape: "facturation", canal: "email", ...espace("ec_paiement_confirme"),
    declencheur: "Au paiement en ligne, d'arrhes ou d'une facture, depuis l'espace client.", delai: "Aussitôt" },
  { cle: "facture_emise", titre: "Facture émise", etape: "facturation", canal: "email", nomCrm: "Facture", variables: VARIABLES_CRM, journal: ["Facture"],
    declencheur: "Aucun envoi automatique : la facture n'est pas encore jointe d'elle-même." },
  { cle: "relance_solde", titre: "Solde à régler", etape: "facturation", canal: "email", regle: "solde", variables: [...VARIABLES_CRM, "montant"], journal: ["relance_solde"],
    declencheur: "Une facture de solde reste à régler : relance par la tâche de la veille." },
  // ── Après ───────────────────────────────────────────────────────────────
  { cle: "ec_avarie_recue", titre: "Avarie : accusé de réception", etape: "apres", canal: "email", ...espace("ec_avarie_recue"),
    declencheur: "Quand le client déclare une avarie depuis son espace.", delai: "Aussitôt" },
  { cle: "ec_demande_avis", titre: "Demande d'avis", etape: "apres", canal: "email", ...espace("ec_demande_avis"),
    declencheur: "À la fin de chantier (« Dossier réalisé » dans l'espace client). Retenue tant qu'il n'y a pas de lien de dépôt d'avis.", delai: "Aussitôt" },
  { cle: "relance_avis", titre: "Relance de l'avis", etape: "apres", canal: "email", regle: "avis", variables: VARIABLES_CRM, journal: ["relance_avis"],
    declencheur: "La demande d'avis est partie : relance par la tâche de la veille." },
  // ── Les relances par SMS (section Relances, 08/11/2026) : une carte par type,
  //    vide et désactivée tant que Bailly n'en a pas validé le texte. ──────────
  ...(
    [
      ["devis_relance_sms", "Devis à relancer", "devis", "devis", "Un devis envoyé reste sans signature"],
      ["relance_pieces_sms", "Pièces manquantes", "commande", "pieces", "Des pièces à fournir manquent avant le déménagement"],
      ["relance_conditions_sms", "Conditions de livraison", "commande", "conditions", "Les conditions de livraison ne sont pas validées avant le déménagement"],
      ["relance_solde_sms", "Solde à régler", "facturation", "solde", "Une facture de solde reste à régler"],
      ["relance_avis_sms", "Relance de l'avis", "apres", "avis", "La demande d'avis est partie"],
    ] as const
  ).map(([cle, titre, etape, regle, quand]): EntreeCatalogue => ({
    cle, titre, etape, canal: "sms", regle, journal: [cle],
    variables: regle === "pieces" ? [...VARIABLES_CRM, "pieces"] : regle === "solde" ? [...VARIABLES_CRM, "montant"] : VARIABLES_CRM,
    declencheur: `${quand} : relance par SMS, quand la règle de relance prévoit ce canal.`,
  })),
];

export const entree = (cle: string) => CATALOGUE.find((e) => e.cle === cle) ?? null;

export interface LigneModele {
  id: number;
  cle: string | null;
  canal: "email" | "sms";
  nom: string;
  objet: string | null;
  corps: string;
  etape: string | null;
  actif: boolean;
  delai_jours: number | null;
  a_valider: boolean;
  maj_le: string | null;
}

const COLONNES = "id, cle, canal, nom, objet, corps, etape, actif, delai_jours, a_valider, maj_le";

/**
 * Rapproche le catalogue de la table, une fois par processus : clé posée sur
 * le modèle du CRM d'origine, ligne créée pour ce qui manque. Rien n'est
 * réécrit : une ligne qui a déjà sa clé reste telle que l'équipe l'a laissée.
 */
const g = globalThis as typeof globalThis & { __crmCatalogue?: Promise<void> };

export function assurerCatalogue(): Promise<void> {
  if (!g.__crmCatalogue) {
    g.__crmCatalogue = (async () => {
      for (const e of CATALOGUE) {
        if (await q1("select 1 from modeles_messages where cle=$1", [e.cle])) continue;
        if (e.nomCrm) {
          const r = await q1<{ id: number }>(
            "update modeles_messages set cle=$1, etape=$2 where id = (select id from modeles_messages where cle is null and canal=$3 and nom=$4 order by id limit 1) returning id",
            [e.cle, e.etape, e.canal, e.nomCrm],
          );
          if (r) continue;
        }
        // Un texte d'origine (espace client) entre actif ; sans texte, la carte attend : désactivée, à valider.
        const texte = e.depart?.corps ?? "";
        const aValider = !e.texteCode && !texte;
        await q(
          `insert into modeles_messages(canal, nom, objet, corps, cle, etape, actif, a_valider) values($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (cle) where cle is not null do nothing`,
          [e.canal, e.titre, e.depart?.objet ?? null, texte, e.cle, e.etape, !aValider, aValider],
        );
      }
    })().catch((err) => {
      g.__crmCatalogue = undefined;
      throw err;
    });
  }
  return g.__crmCatalogue;
}

/** Toutes les lignes du catalogue. */
export async function lignesCatalogue(): Promise<Map<string, LigneModele>> {
  await assurerCatalogue();
  const rows = await q<LigneModele>(`select ${COLONNES} from modeles_messages where cle is not null`);
  return new Map(rows.map((r) => [r.cle!, r]));
}

/** La ligne d'une carte, pour un envoi. */
export async function modeleDe(cle: string): Promise<LigneModele | null> {
  await assurerCatalogue();
  return (await q1<LigneModele>(`select ${COLONNES} from modeles_messages where cle=$1`, [cle])) ?? null;
}

/** Un modèle utilisable : actif, avec un texte. Sinon, la raison de ne pas envoyer. */
export function raisonDeNePasEnvoyer(m: LigneModele | null): string | null {
  if (!m) return "Modèle introuvable dans « Courriers et SMS ».";
  if (!m.corps.trim()) return "Texte à rédiger et à valider dans « Courriers et SMS » : rien n'est parti.";
  if (!m.actif) return "Message désactivé dans « Courriers et SMS » : journalisé, rien n'est parti.";
  return null;
}

/** Remplit {client} {commercial} {date} {heure} {ref}… — les variables du CRM. */
export const remplir = (texte: string, vars: Record<string, string | number | null | undefined>) =>
  texte.replace(/\{([a-z_]+)\}/gi, (m, k: string) => (vars[k] == null ? "" : String(vars[k])));

export type { Row };
