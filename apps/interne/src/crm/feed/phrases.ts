import { eur, m3 } from "@/crm/lib/format";
import { MODELES_MESSAGE } from "@/lib/espace-client/libelles";
import { alerteDe } from "@/lib/alertes-equipe/catalogue";
import { STATUTS as STATUTS_LEAD } from "@/lib/suivi-commun";
import type { NomIcone } from "@/ui/icones";

/*
 * Les phrases du Feed : une par événement, sans son auteur (il s'affiche à
 * côté), au participe passé — « Devis DV-2026-0012 envoyé ». Ce sont les
 * mots de l'outil, pas des textes métier : la liste est à faire valider par
 * David (voir le compte rendu de la branche feed).
 *
 * Jamais le texte d'un message : l'objet, l'expéditeur, le destinataire au
 * plus. Le reste s'ouvre au clic (détail lu à la demande).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- les champs d'une ligne du fil dépendent de sa source
type D = Record<string, any>;

export type Ton = "indigo" | "violet" | "vert" | "ambre" | "rouge" | "gris";

export interface Phrase {
  texte: string;
  icone: NomIcone;
  ton: Ton;
  /** L'issue d'un envoi, d'un rappel… : une pastille. */
  statut?: { libelle: string; ton: Ton } | null;
  /** La page de l'objet, quand elle est plus précise que celle du dossier. */
  lien?: { href: string; libelle: string } | null;
}

const STATUTS_DEMANDE: Record<string, string> = {
  new: "Nouvelle",
  analyzing: "En analyse",
  qualified: "Qualifiée",
  quoted: "Devis envoyé",
  won: "Gagnée",
  lost: "Perdue",
  archived: "Archivée",
};

const STATUTS_RAPPEL: Record<string, { libelle: string; ton: Ton }> = {
  a_rappeler: { libelle: "À rappeler", ton: "ambre" },
  en_cours: { libelle: "En cours", ton: "indigo" },
  rappele: { libelle: "Rappelé", ton: "vert" },
  injoignable: { libelle: "Injoignable", ton: "rouge" },
  clos: { libelle: "Clos", ton: "gris" },
};

/** L'issue d'un message, quel que soit le journal qui la garde. */
export function issueEnvoi(statut: string | null | undefined): { libelle: string; ton: Ton } | null {
  switch (statut) {
    case "envoye":
    case "envoyee":
      return { libelle: "Envoyé", ton: "vert" };
    case "journalise":
    case "journalisee":
      return { libelle: "Non envoyé · envoi désactivé", ton: "ambre" };
    case "bloque":
      return { libelle: "Retenu · recette", ton: "ambre" };
    case "fictif":
      return { libelle: "Destinataire fictif", ton: "ambre" };
    case "bac_a_sable":
      return { libelle: "Bac à sable", ton: "ambre" };
    case "ignore":
    case "brouillon":
      return { libelle: "Non envoyé", ton: "ambre" };
    case "echec":
    case "incertain":
      return { libelle: "Échec", ton: "rouge" };
    case "en_cours":
      return { libelle: "En cours", ton: "gris" };
    default:
      return null;
  }
}

const sms = (d: D) => d.canal === "sms";
/** « E-mail « objet » à x@y » / « SMS « modèle » au 06… ». */
function message(d: D, libelleModele?: string | null): string {
  const quoi = d.sujet && !String(d.sujet).startsWith("[SMS]") ? d.sujet : libelleModele || d.modele || null;
  return sms(d)
    ? `SMS${quoi ? ` « ${String(quoi).replace(/^\[SMS\]\s*/, "")} »` : ""} au ${d.destinataire ?? "—"}`
    : `E-mail${quoi ? ` « ${quoi} »` : ""} à ${d.destinataire ?? "—"}`;
}

const jourCourt = (iso: string | null | undefined) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "";

/** Les pages de l'objet d'un événement du journal des gestes (rien pour un objet supprimé). */
function lienJournal(d: D): Phrase["lien"] {
  const id = d.objet_id as string | null;
  const supprime = /\.(supprime|retire)$/.test(String(d.action));
  if (supprime) return null;
  switch (d.objet_type) {
    case "partenaire":
      return id ? { href: `/partenaires/${id}`, libelle: "Ouvrir la fiche" } : null;
    case "conteneur":
      return id ? { href: `/conteneurs/${id}`, libelle: "Ouvrir le conteneur" } : null;
    case "modele_courrier":
    case "regle_alerte":
      return { href: "/reglages", libelle: "Ouvrir les réglages" };
    case "membre_equipe":
      return { href: "/dashboard/equipe", libelle: "Ouvrir l'équipe" };
    case "message":
      return { href: "/dashboard/envois", libelle: "Journal des envois" };
    default:
      return null;
  }
}

export interface Contexte {
  /** L'identifiant dans la source (le devis, la facture…). */
  id: string;
  dossierId: number | null;
  requestId: string | null;
  acteurType: string;
}

export function phraseDe(src: string, d: D, contexte: Contexte): Phrase {
  switch (src) {
    case "demande": {
      const trajet = [d.depart, d.arrivee].filter(Boolean).join(" → ");
      const lien = contexte.requestId ? { href: `/dashboard/${contexte.requestId}`, libelle: "Ouvrir la demande" } : null;
      if (d.source === "email")
        return { texte: `Demande reçue par e-mail${d.sujet ? ` : « ${d.sujet} »` : ""}`, icone: "courrier", ton: "indigo", lien };
      return {
        texte: `Demande de devis envoyée sur le site${d.espace ? ` (espace ${d.espace})` : ""}${trajet ? ` · ${trajet}` : ""}${Number(d.volume) > 0 ? `, ${m3(d.volume)}` : ""}`,
        icone: "questionnaires",
        ton: "indigo",
        lien,
      };
    }
    case "courriel":
      return { texte: `E-mail reçu${d.sujet ? ` : « ${d.sujet} »` : ""}`, icone: "courrier", ton: "violet" };
    case "evt": {
      const p: D = d.p ?? {};
      const lien = contexte.requestId ? { href: `/dashboard/${contexte.requestId}`, libelle: "Ouvrir la demande" } : null;
      switch (d.type) {
        case "completed": {
          const champs = Array.isArray(p.rempli) ? p.rempli.map((x: D) => x.champ).filter(Boolean) : [];
          return { texte: `Demande complétée${champs.length ? ` : ${champs.join(", ").toLowerCase()}` : ""}`, icone: "coche", ton: "vert", lien };
        }
        case "rappel":
          return {
            texte: `Rappel demandé${Number(p.montant_ttc) > 0 ? ` (estimation de ${eur(p.montant_ttc)})` : ""}${p.creneau ? ` · créneau ${p.creneau}` : ""}`,
            icone: "cloche",
            ton: "ambre",
            statut: STATUTS_RAPPEL[p.statut] ?? null,
            lien,
          };
        case "incomplete":
          return { texte: `Demande incomplète${Array.isArray(p.manque) && p.manque.length ? ` : il manque ${p.manque.join(", ").toLowerCase()}` : ""}`, icone: "questionnaires", ton: "ambre", lien };
        case "analysis":
          return {
            texte: `Demande analysée : potentiel ${p.score ?? "—"}/100, difficulté ${p.difficulte ?? "—"}/100`,
            icone: "stats",
            ton: "gris",
            lien,
          };
        case "status_changed":
          return { texte: `Demande passée à « ${STATUTS_DEMANDE[p.status] ?? p.status ?? "—"} »`, icone: "fleche", ton: "indigo", lien };
        case "note":
          return { texte: "Note ajoutée à la demande", icone: "questionnaires", ton: "indigo", lien };
        case "scored":
          return { texte: `Notes de la demande modifiées : potentiel ${p.potentiel ?? "—"}, difficulté ${p.difficulte ?? "—"}`, icone: "stats", ton: "indigo", lien };
        case "estimated":
          return { texte: `Estimation recalculée : ${eur(p.ttc)} TTC`, icone: "euro", ton: "indigo", lien };
        case "suivi": {
          const statut = STATUTS_LEAD.find((s) => s.key === p.statut)?.label ?? p.statut;
          return { texte: `Suivi du lead mis à jour : ${statut ?? "—"}${d.note ? " · note" : ""}`, icone: "tendance", ton: "indigo", lien };
        }
        default:
          return { texte: `Demande : ${d.type}`, icone: "questionnaires", ton: "gris", lien };
      }
    }
    case "envoi":
      return {
        texte: message(d),
        icone: sms(d) ? "sms" : "courrier",
        ton: "violet",
        statut: issueEnvoi(d.statut),
        lien: { href: "/dashboard/envois", libelle: "Journal des envois" },
      };
    case "notif": {
      if (d.modele === "message_conseiller") return { texte: "Message écrit au conseiller depuis l'espace client", icone: "courrier", ton: "vert" };
      if (d.modele === "service_demande") return { texte: `Service demandé dans l'espace client${d.service ? ` : ${d.service}` : ""}`, icone: "etoile", ton: "vert" };
      return { texte: message(d, MODELES_MESSAGE[d.modele] ?? null), icone: sms(d) ? "sms" : "courrier", ton: "violet", statut: issueEnvoi(d.statut) };
    }
    case "rem":
      return {
        texte: message(d),
        icone: sms(d) ? "sms" : "courrier",
        ton: "violet",
        statut: issueEnvoi(d.statut),
      };
    case "mail":
      return { texte: message(d), icone: sms(d) ? "sms" : "courrier", ton: "violet", statut: issueEnvoi(d.statut) };
    case "activite":
      return { texte: d.libelle, icone: "horloge", ton: "indigo" };
    case "journal": {
      const supprime = /\.(supprime|retire|supprimes|retires)$/.test(String(d.action));
      const estMessage = d.action === "message.envoye";
      return {
        texte: d.libelle,
        icone: supprime ? "corbeille" : estMessage ? (d.canal === "sms" ? "sms" : "courrier") : "horloge",
        ton: supprime ? "rouge" : estMessage ? "violet" : "indigo",
        statut: estMessage ? issueEnvoi(d.statut) : null,
        lien: lienJournal(d),
      };
    }
    case "devis_envoye":
      return {
        texte: `Devis ${d.numero} envoyé${d.titre ? ` (${d.titre})` : ""} · ${eur(d.montant)}`,
        icone: "devis",
        ton: "indigo",
        lien: contexte.dossierId ? { href: `/dossiers/${contexte.dossierId}/devis/${contexte.id}`, libelle: "Ouvrir le devis" } : null,
      };
    case "devis_signe":
      return {
        texte: `Devis ${d.numero} signé · ${eur(d.montant)}`,
        icone: "signature",
        ton: "vert",
        lien: contexte.dossierId ? { href: `/dossiers/${contexte.dossierId}/devis/${contexte.id}`, libelle: "Ouvrir le devis" } : null,
      };
    case "facture": {
      const quoi = d.genre === "avoir" ? `Avoir ${d.numero} émis` : d.genre === "acompte" ? `Facture d'arrhes ${d.numero} émise` : `Facture ${d.numero} émise`;
      return {
        texte: `${quoi}${d.objet ? ` : ${d.objet}` : ""} · ${eur(d.montant)}`,
        icone: "facture",
        ton: "indigo",
        lien: contexte.dossierId
          ? { href: `/dossiers/${contexte.dossierId}#facturation`, libelle: "Facturation du dossier" }
          : d.garde_meuble_id
            ? { href: `/garde-meuble/${d.garde_meuble_id}`, libelle: "Ouvrir le contrat" }
            : { href: `/factures?q=${encodeURIComponent(d.numero ?? "")}`, libelle: "Ouvrir les factures" },
      };
    }
    case "paiement":
      return {
        texte: `${contexte.acteurType === "client" ? "Paiement en ligne reçu" : "Règlement enregistré"}${d.libelle ? ` : ${d.libelle}` : ""} · ${eur(d.montant)}`,
        icone: "euro",
        ton: "vert",
        lien: contexte.dossierId ? { href: `/dossiers/${contexte.dossierId}#facturation`, libelle: "Facturation du dossier" } : null,
      };
    case "dossier":
      return { texte: `Dossier ${d.ref} créé`, icone: "dossierClient", ton: "indigo" };
    case "litige":
      return { texte: `Litige ouvert : ${d.objet}${Number(d.montant) > 0 ? ` · ${eur(d.montant)}` : ""}`, icone: "litige", ton: "ambre", lien: { href: "/litiges", libelle: "Ouvrir les litiges" } };
    case "conteneur":
      return { texte: `Conteneur ${d.numero} : ${d.libelle}`, icone: "bateau", ton: "indigo", lien: { href: `/conteneurs/${d.conteneur_id}`, libelle: "Ouvrir le conteneur" } };
    case "commentaire":
      return { texte: `Commentaire ajouté au conteneur ${d.numero}`, icone: "bateau", ton: "indigo", lien: { href: `/conteneurs/${d.conteneur_id}`, libelle: "Ouvrir le conteneur" } };
    case "dispatch":
      return { texte: `Dispatch « ${d.plan} » : ${d.libelle}`, icone: "dispatch", ton: "indigo", lien: { href: `/conteneurs/dispatch/${d.plan_id}`, libelle: "Ouvrir le plan" } };
    case "regle_relance":
      return { texte: `Règle de relance modifiée : ${d.resume}`, icone: "reglages", ton: "indigo", lien: { href: "/reglages", libelle: "Ouvrir les réglages" } };
    case "alerte": {
      const n = Number(d.destinataires ?? 0);
      return {
        texte: `Alerte de l'équipe « ${alerteDe(d.alerte)?.titre ?? d.alerte} » envoyée à ${n} destinataire${n > 1 ? "s" : ""}`,
        icone: "cloche",
        ton: "ambre",
      };
    }
    case "session":
      return { texte: `Connexion à l'espace client${d.demo ? " (compte de démonstration)" : ""}`, icone: "connexion", ton: "vert" };
    case "document":
      return {
        texte: `${contexte.acteurType === "client" ? "Pièce déposée" : "Document ajouté"} dans l'espace client : ${d.libelle}`,
        icone: "trombone",
        ton: contexte.acteurType === "client" ? "vert" : "indigo",
      };
    case "acceptation": {
      const texte =
        d.type === "devis"
          ? `Devis ${d.objet ?? ""} accepté dans l'espace client`
          : d.type === "cgv"
            ? "Conditions générales de vente acceptées"
            : d.type === "rgpd"
              ? "Consentement au traitement des données donné"
              : d.type === "conditions_livraison"
                ? "Conditions de livraison validées"
                : d.type === "declaration_valeurs"
                  ? `Déclaration de valeur signée${Number(d.total) > 0 ? ` · ${eur(d.total)}` : ""}`
                  : `Acceptation : ${d.type}`;
      return { texte, icone: "signature", ton: "vert" };
    }
    case "sav":
      return { texte: `Avarie déclarée dans l'espace client (SAV ${d.numero})`, icone: "litige", ton: "ambre", lien: { href: "/dashboard/espace-client/sav", libelle: "Ouvrir le SAV" } };
    case "cartons":
      return { texte: `Livraison de ${d.nb ?? "—"} cartons demandée${d.samedi ? ` pour le ${jourCourt(d.samedi)}` : ""}`, icone: "caisse", ton: "vert" };
    case "paiement_en_ligne":
      return {
        texte: `Paiement en ligne commencé${d.libelle ? ` : ${d.libelle}` : ""} · ${eur(d.montant)}`,
        icone: "carte",
        ton: "vert",
        statut: d.statut === "payee" || d.statut === "reussi" ? { libelle: "Réglé", ton: "vert" } : d.statut ? { libelle: String(d.statut), ton: "gris" } : null,
      };
    default:
      return { texte: d.libelle ?? src, icone: "horloge", ton: "gris" };
  }
}

/** L'icône et la couleur d'une ligne du fil d'un dossier, d'après son type. */
export function habillageActivite(genre: string, libelle: string, suppression = false): Pick<Phrase, "icone" | "ton"> {
  if (suppression || genre === "suppression") return { icone: "corbeille", ton: "rouge" };
  if (/(\bsignée?s?\b|\bacceptée?s?\b)/i.test(libelle)) return { icone: "signature", ton: "vert" };
  switch (genre) {
    case "relance":
      return { icone: "cloche", ton: "ambre" };
    case "message":
      return { icone: /sms/i.test(libelle) ? "sms" : "courrier", ton: "violet" };
    case "devis":
      return { icone: "devis", ton: "indigo" };
    case "facture":
      return { icone: "euro", ton: "indigo" };
    case "rdv":
      return { icone: "calendrier", ton: "indigo" };
    case "espace":
      return { icone: "dossierClient", ton: "indigo" };
    case "exploitation":
      return { icone: /partenaire|annuaire/i.test(libelle) ? "partenaires" : /conteneur|dispatch/i.test(libelle) ? "bateau" : "camion", ton: "indigo" };
    case "reglage":
      return { icone: "reglages", ton: "indigo" };
    case "demande":
      return { icone: "questionnaires", ton: "indigo" };
    default:
      return { icone: "dossierClient", ton: "indigo" };
  }
}
