import { jourFr, type Faits } from "./etapes";

/*
 * La prochaine étape d'un dossier : ce qu'il faut faire maintenant, et le
 * bouton qui le fait. Demande de David (08/11/2026) : « sur un dossier on doit
 * tout de suite voir la prochaine étape à faire ». Déduite des seuls faits du
 * parcours (etapes.ts), dans l'ordre du métier vu en réunion : visite, devis,
 * envoi et signature, arrhes, planification, lettre de voiture, déménagement,
 * facture, solde. Les libellés sont provisoires, à valider par Bailly.
 *
 * Les liens d'ancre (#demenagements-visites…) ouvrent la section et l'onglet
 * de la fiche (Fiche.tsx suit le changement d'ancre).
 */

export type ActionProchaine = { label: string; href: string; principal?: boolean };
export type Prochaine = {
  titre: string;
  detail: string;
  /** faire : une action attend l'équipe ; attendre : rien à faire avant une date ; fini, perdu. */
  ton: "faire" | "attendre" | "fini" | "perdu";
  actions: ActionProchaine[];
};

type Contexte = {
  id: number;
  /** Ce que le client doit encore (vue crm.dossiers_soldes). */
  reste: number;
  /** L'espace client du dossier, s'il est ouvert (pour le SAV et l'avis). */
  espaceId: string | null;
};

const VISITES = "#demenagements-visites";
const DEVIS = "#demenagements-devis";
const COMMANDE = "#demenagements-demenagements";

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const jourLong = (iso: string) => jourFr(iso, { weekday: "long", day: "numeric", month: "long" });
const heure = (iso: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));
const quandRdv = (iso: string) =>
  `${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date(iso))} à ${heure(iso)}`;
/** Le lundi de la semaine d'une date (AAAA-MM-JJ), pour ouvrir le bon planning. */
const lundi = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export function prochaineEtape(f: Faits, c: Contexte): Prochaine {
  const dossier = `/dossiers/${c.id}`;
  if (f.statut === "perdu") {
    return { titre: "Dossier perdu", detail: "Il se rouvre depuis « ⋯ » si le client revient.", ton: "perdu", actions: [] };
  }

  const militaire = f.segment === "militaire";
  const signe = !!f.devis.signe;
  const avantCommande = ["prospect", "visite", "devis"].includes(f.statut) && !signe;

  if (avantCommande) {
    // 1. La visite technique : à planifier, puis à faire.
    const devisEnCours = f.devis.brouillons + f.devis.envoyes > 0;
    const visiteAussi = f.visite.prevue ? ` Visite prévue le ${quandRdv(f.visite.prevue)}.` : "";
    if (!f.visite.faite && !f.visite.prevue && !devisEnCours) {
      return {
        titre: "Planifier la visite technique",
        detail: "Aucune visite prévue. Réservez un créneau sur place ou en visio, ou proposez des créneaux au client.",
        ton: "faire",
        actions: [
          { label: "Planifier la visite", href: `/planning/nouveau?dossier=${c.id}`, principal: true },
          { label: "Proposer des créneaux", href: `${dossier}${VISITES}` },
        ],
      };
    }
    // Une visite prévue alors qu'un devis est déjà en route (repasser vérifier le volume) : le devis reste
    // l'étape à suivre, la visite est rappelée dans son texte.
    if (f.visite.prevue && !f.visite.faite && !devisEnCours) {
      const mode = f.visite.mode === "visio" ? "en visio" : "sur place";
      return {
        titre: "Faire la visite technique",
        detail: `Prévue ${mode} le ${quandRdv(f.visite.prevue)}${f.visite.par ? ` avec ${f.visite.par}` : ""}. Confirmez-la au client, puis faites-la sur la tablette.`,
        ton: "attendre",
        actions: [
          { label: "Voir la visite", href: `${dossier}${VISITES}`, principal: true },
          // Le planificateur en modification, sur la visite annoncée ici (/planning/modifier la retrouve).
          { label: "Modifier la visite", href: `/planning/modifier?dossier=${c.id}` },
          { label: "Planning", href: `/planning?semaine=${lundi(f.visite.prevue)}` },
        ],
      };
    }
    // 2. Militaire : pas de devis, la commande se passe sans.
    if (militaire && !devisEnCours) {
      return {
        titre: "Passer en commande",
        detail: "Dossier CIMOB/DICOM : pas de devis, la commande se passe directement.",
        ton: "faire",
        actions: [{ label: "Commande sans devis", href: `${dossier}${DEVIS}`, principal: true }],
      };
    }
    // 3. Le devis : à établir, à envoyer, à faire signer.
    if (!devisEnCours) {
      return {
        titre: "Établir le devis",
        detail: f.visite.faite ? `Visite faite le ${jourFr(f.visite.faite)}.` : "Pas encore de devis sur ce dossier.",
        ton: "faire",
        actions: [
          { label: "Nouveau devis", href: `/devis?dossier=${c.id}&nouveau=libre`, principal: true },
          { label: "Générer les 3 formules", href: `${dossier}${DEVIS}` },
        ],
      };
    }
    if (f.devis.envoyes === 0) {
      return {
        titre: "Envoyer le devis",
        detail: `${f.devis.brouillons} devis en brouillon, pas encore envoyé${f.devis.brouillons > 1 ? "s" : ""} au client.${visiteAussi}`,
        ton: "faire",
        actions: [
          { label: "Ouvrir les devis", href: `${dossier}${DEVIS}`, principal: true },
          { label: "Liste des devis", href: `/devis?dossier=${c.id}` },
        ],
      };
    }
    return {
      titre: "Obtenir la signature",
      detail: `Devis envoyé${f.devis.premierEnvoi ? ` le ${jourFr(f.devis.premierEnvoi)}` : ""}. Relancez le client, ou validez le devis s'il l'a accepté.${visiteAussi}`,
      ton: "faire",
      actions: [
        { label: "Valider le devis", href: `/devis?dossier=${c.id}`, principal: true },
        { label: "Relances", href: `/relances?dossier=${c.id}` },
      ],
    };
  }

  const termine = f.statut === "termine";
  if (!termine) {
    // 4. Les arrhes du devis signé.
    if (signe && f.paiements.n === 0) {
      return {
        titre: "Encaisser les arrhes",
        detail: `Devis ${f.devis.signe!.numero} signé${f.devis.signe!.le ? ` le ${jourFr(f.devis.signe!.le)}` : ""} : arrhes pas encore reçues.`,
        ton: "faire",
        actions: [{ label: "Encaisser les arrhes", href: `${dossier}?encaisser=arrhes#facturation`, principal: true }],
      };
    }
    // 5. Les dates, puis la lettre de voiture.
    if (!f.chargement) {
      return {
        titre: "Planifier le déménagement",
        detail: "Dates de chargement et de livraison à fixer, puis les équipes au planning d'exploitation.",
        ton: "faire",
        actions: [
          { label: "Fixer les dates", href: `${dossier}${COMMANDE}`, principal: true },
          { label: "Planning d'exploitation", href: "/exploitation" },
        ],
      };
    }
    if (f.lettres.n === 0) {
      return {
        titre: "Préparer la lettre de voiture",
        detail: `Chargement le ${jourLong(f.chargement)}. Équipe, véhicule et consignes sur la lettre de voiture.`,
        ton: "faire",
        actions: [{ label: "Créer la lettre de voiture", href: `${dossier}${COMMANDE}`, principal: true }],
      };
    }
    // 6. Le jour J, puis la facture.
    if (f.chargement.slice(0, 10) > f.aujourdhui.slice(0, 10)) {
      return {
        titre: `Déménagement le ${jourLong(f.chargement)}`,
        detail: "Dates et lettre de voiture prêtes. Ensuite : la facture de solde.",
        ton: "attendre",
        actions: [{ label: "Planning d'exploitation", href: `/exploitation?semaine=${lundi(f.chargement)}`, principal: true }],
      };
    }
    return {
      titre: "Terminer et facturer",
      detail: `Le déménagement a eu lieu le ${jourLong(f.chargement)} : émettez la facture de solde.`,
      ton: "faire",
      actions: [{ label: "Facturer", href: `${dossier}#facturation`, principal: true }],
    };
  }

  // 7. Après le déménagement : le solde, le SAV, l'avis.
  if (c.reste > 0.5) {
    return {
      titre: "Encaisser le solde",
      detail: `Reste à payer : ${eur(c.reste)}.`,
      ton: "faire",
      actions: [{ label: "Encaisser", href: `${dossier}?encaisser=reglement#facturation`, principal: true }],
    };
  }
  if (f.sav.ouverts > 0) {
    return {
      titre: "Traiter le SAV",
      detail: `${f.sav.ouverts} réclamation${f.sav.ouverts > 1 ? "s" : ""} ouverte${f.sav.ouverts > 1 ? "s" : ""} (litige ou SAV).`,
      ton: "faire",
      actions: [
        { label: "Voir les litiges", href: `${dossier}#demenagements-litiges`, principal: true },
        ...(c.espaceId ? [{ label: "SAV de l'espace client", href: `/dashboard/espace-client/dossiers/${c.espaceId}` }] : []),
      ],
    };
  }
  if (!f.avisLe && c.espaceId) {
    return {
      titre: "Demander l'avis du client",
      detail: "Déménagement terminé et soldé : « Fin de chantier signée » envoie la demande d'avis.",
      ton: "faire",
      actions: [{ label: "Espace client", href: `/dashboard/espace-client/dossiers/${c.espaceId}`, principal: true }],
    };
  }
  return { titre: "Dossier terminé", detail: "Déménagement fait, facture soldée.", ton: "fini", actions: [] };
}
