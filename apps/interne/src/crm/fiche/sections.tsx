import Link from "next/link";
import { cloneElement, isValidElement, type ReactNode } from "react";
import type { Row } from "@/crm/lib/db";
import * as A from "@/crm/actions";
import * as B from "@/crm/actions2";
import { EspaceClient } from "@/crm/components/EspaceClient";
import { dateFr, eur, initiales, m3, nomClient, RDV_TYPES, TYPES } from "@/crm/lib/format";
import { changerEtatVisite } from "@/crm/planning/actions";
import { EtatSmsRdv } from "@/crm/rdv/EtatSmsRdv";
import type { EtatAffiche } from "@/crm/rdv/sms";
import { commencerVisite } from "@/crm/visites/actions";
import SectionVisite from "@/crm/visites/composants/SectionVisite";
import VisitePlanifiee from "@/crm/planning/planificateur/VisitePlanifiee";
import { estTypeRdv, TYPES_RDV } from "@/crm/planning/types-rdv";
import { estVisite, etatVisite, ETATS_VISITE } from "@/crm/visites/cycle";
import { libelleStatut, type StatutEnvoi } from "@/lib/envois";
import { hhmmParis, jourParis, plageVisite } from "@/lib/visite/regles";
import GalerieChantier from "@/terrain/composants/GalerieChantier";
import * as F from "./actions";
import CarteFacturation from "@/crm/facturation/CarteFacturation";
import { FormulaireDupliquerDevis } from "@/crm/duplication/composants/DupliquerDevis";
import type { FicheDonnees } from "./donnees";
import {
  FenetreAdresses,
  FenetreContact,
  FenetreCopieRdv,
  FenetreIdentite,
  FenetreInventaire,
  FenetreLettre,
  FenetreLitige,
  FenetrePlanifier,
  FenetreService,
  FenetreSuivi,
  STATUTS_SERVICE,
} from "./fenetres";
import { Picto } from "./Picto";
import type { BoutonBarre, FenetreFiche, Geste, Ligne, Memo, Onglet, Outil, SectionFiche } from "./types";
import s from "./fiche.module.css";

/*
 * La fiche du dossier façon Créagidem, décrite pour Fiche.tsx : les sections,
 * leurs onglets et leurs lignes, ce que fait chaque outil sur chaque ligne,
 * et les fenêtres. Tout ce que portait l'ancienne fiche y est rangé :
 *
 * - Déménagements : Visites (rendez-vous, visite technique, SMS), Devis,
 *   Déménagements (commande, planification, lettres de voiture, suivi de la
 *   commande), Factures arrhes, Factures client, Litiges ;
 * - Garde-meubles : Devis, GM/Self (les contrats), Factures client payeur,
 *   Factures client ;
 * - Services : les services complémentaires (modèle provisoire) ;
 * - Commun : Règlements, Factures, Contacts, E-mails et SMS (journal des
 *   envois, lecture seule), Courriers, Documents (espace client, photos de
 *   chantier), Espace client, Historique.
 *
 * L'identité du client, les adresses et accès, l'inventaire et le suivi
 * (commercial, observations) s'ouvrent en fenêtres depuis la barre de la
 * fiche, comme dans Créagidem.
 */

/** Le formulaire de création des contrats de garde-meuble (construit à part) : son adresse, à ajuster à la fusion. */
export const LIEN_NOUVEAU_CONTRAT_GM = (dossierId: number) => `/garde-meuble/nouveau?dossier=${dossierId}`;

const O = {
  nouveau: { cle: "nouveau", libelle: "Nouveau", picto: "nouveau" },
  modifier: { cle: "modifier", libelle: "Modifier", picto: "modifier" },
  // « Dupliquer » : un seul mot pour la même chose, partout dans le CRM (src/crm/duplication/textes.ts).
  copier: { cle: "copier", libelle: "Dupliquer", picto: "copier" },
  confirmer: { cle: "confirmer", libelle: "Confirmer", picto: "confirmer" },
  imprimer: { cle: "imprimer", libelle: "Imprimer", picto: "imprimer" },
  transfert: { cle: "transfert", libelle: "Transfert", picto: "transfert" },
  signer: { cle: "signer", libelle: "Signer", picto: "signer" },
  supprimer: { cle: "supprimer", libelle: "Supprimer", picto: "supprimer", danger: true },
} satisfies Record<string, Outil>;

const TYPE_D: Record<string, string> = { national: "National", international: "International", maritime: "Maritime", aerien: "Aérien", gm: "Garde-meuble", bureau: "Bureau" };
const DEVIS_ST: Record<string, [string, string]> = { brouillon: ["Brouillon", "i"], envoye: ["Envoyé", "w"], signe: ["Signé", "g"], refuse: ["Non retenu", "r"] };
const LV_ST: Record<string, [string, string]> = { a_planifier: ["À planifier", "w"], planifiee: ["Planifiée", "i"], en_cours: ["En cours", "p"], livree: ["Livrée", "g"] };
const FACT_ST: Record<string, [string, string]> = { emise: ["Émise", "w"], payee: ["Payée", "g"], retard: ["En retard", "r"] };
const LITIGE_ST: Record<string, [string, string]> = { ouvert: ["Ouvert", "r"], en_cours: ["En cours", "w"], clos: ["Clos", "g"] };
const ENVOI_TON: Record<string, string> = { envoye: "g", journalise: "i", bloque: "w", fictif: "i", bac_a_sable: "p", echec: "r", incertain: "w", en_cours: "i" };
const FORMULES: Record<string, string> = { premium: "Premium", standard: "Standard", economique: "Économique" };
const formule = (cle: string) => FORMULES[cle] ?? cle;
const FORMULE_SOUS: Record<string, string> ={ premium: "Le client ne fait rien", standard: "Emballe ce qui casse", economique: "Le client fait tout" };

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);
const jj = (d: Date | string | null | undefined) => dateFr(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const jjhh = (d: Date | string | null | undefined) =>
  dateFr(d, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const Etat = ({ v }: { v: [string, string] }) => <i className={`st ${v[1]}`}>{v[0]}</i>;
const Ref = ({ children }: { children: ReactNode }) => <span className={s.reference}>{children}</span>;
const Long = ({ children, titre }: { children: ReactNode; titre?: string }) => (
  <span className={s.long} title={titre}>
    {children}
  </span>
);
const off = (raison: string): Geste => ({ off: raison });

export type Contexte = {
  d: Row;
  data: FicheDonnees;
  utilisateurs: Row[];
  litiges: Row[];
  etatsSms: Map<number, EtatAffiche>;
  espaceOuvert: boolean;
  /** Son client a déjà un espace client, où ce dossier n'est pas encore : « à ajouter à son espace ». */
  aAjouter?: boolean;
  /** Les espaces pro auxquels le client peut être rattaché (fenêtre « Fiche ») ; vide si la liste ne se lit pas. */
  entreprises?: { id: string; nom: string; actif: boolean }[];
  /**
   * `planifie` : le rendez-vous que le planificateur vient de poser (retour de /planning/nouveau), ou de
   * modifier (`modifie=1`, retour de /planning/<id>).
   */
  sp: { espace?: string; m?: string; visite?: string; vm?: string; vc?: string; vd?: string; vt?: string; planifie?: string; modifie?: string };
  solde: number;
  /** L'instant de la page (ms) : une visite passée ne se confirme plus par SMS. */
  maintenant: number;
};

/** « Visite le … » : la prochaine visite, sinon la dernière (comme le sous-titre de la fiche Créagidem). */
export const maintenant = () => Date.now();

export function visiteDuSousTitre(rdvs: Row[], maintenant: number) {
  const visites = rdvs.filter((r) => estVisite(r.type) && !r.journee);
  const v = visites.find((r) => new Date(r.debut).getTime() >= maintenant) ?? visites[visites.length - 1];
  return v ? `Visite le ${new Date(v.debut).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" })}` : null;
}

export function construireFiche(c: Contexte) {
  const fenetres: Record<string, FenetreFiche> = {};
  const { d } = c;
  fenetres.fiche = { surtitre: `Client n° ${d.client_id}`, titre: `Fiche · ${nomClient(d)}`, contenu: <FenetreIdentite d={d} espaceOuvert={c.espaceOuvert} entreprises={c.entreprises} /> };
  fenetres.adresses = { surtitre: "Fenêtre de visite", titre: "Adresses et accès", contenu: <FenetreAdresses d={d} />, large: true };
  fenetres.inventaire = { surtitre: `Inventaire · ${m3(d.volume)}`, titre: "Inventaire du logement", contenu: <FenetreInventaire d={d} />, large: true };
  fenetres.suivi = { surtitre: `Dossier ${d.ref}`, titre: "Suivi et observations", contenu: <FenetreSuivi d={d} utilisateurs={c.utilisateurs} /> };

  const sections = [demenagements(c, fenetres), gardeMeubles(c), services(c, fenetres), commun(c, fenetres)];
  // Vers le client, les cellules voyagent en tableau, et un fragment sans clé devient un tableau lui aussi :
  // chaque cellule reçoit sa clé (sa colonne), chaque fragment la sienne.
  const cle = (v: ReactNode, k: string | number): ReactNode => (isValidElement(v) && v.key == null ? cloneElement(v, { key: k }) : v);
  for (const x of sections)
    for (const o of x.onglets) {
      o.vide = cle(o.vide, "vide");
      o.avant = cle(o.avant, "avant");
      o.apres = cle(o.apres, "apres");
      for (const l of o.lignes) {
        l.cellules = l.cellules.map(cle);
        l.detail = cle(l.detail, "detail");
      }
    }

  const barre: BoutonBarre[] = [
    { cle: "fiche", libelle: "Fiche", picto: "fiche", geste: { fenetre: "fiche" }, titre: "L'identité du client" },
    { cle: "adresses", libelle: "Adresses", picto: "adresses", geste: { fenetre: "adresses" }, titre: "Adresses, accès et période" },
    { cle: "inventaire", libelle: "Inventaire", picto: "inventaire", geste: { fenetre: "inventaire" } },
    { cle: "suivi", libelle: "Suivi", picto: "suivi", geste: { fenetre: "suivi" }, titre: "Commercial, observations, options du dossier" },
    {
      cle: "espace",
      // L'état se lit à la couleur (vert : ouvert, ambre : inactif) : le libellé reste court pour tenir sur une ligne.
      libelle: "Espace client",
      picto: "espace",
      titre: c.espaceOuvert ? "Espace client ouvert" : c.aAjouter ? "Son espace client existe : ce dossier est à y ajouter" : "Espace client inactif",
      geste: { aller: { section: "commun", onglet: "espace" } },
      accent: c.espaceOuvert ? "ok" : "attente",
    },
    { cle: "agenda", libelle: "Agenda", picto: "agenda", geste: { lien: `/planning/nouveau?dossier=${d.id}` }, titre: "Planifier un rendez-vous" },
  ];

  const drapeaux = [d.passer_en_dernier && "Passer en dernier", d.vehicule && "Carte grise + assurance à fournir"].filter(Boolean) as string[];
  const memo: Memo | null = d.observations || drapeaux.length ? { texte: d.observations ?? null, drapeaux, fenetre: "suivi" } : null;

  const identite = (
    <Link href={`/clients/${d.client_id}`} className={s.repere} title={`Ouvrir la fiche du client n° ${d.client_id} : tous ses dossiers`}>
      <i>{initiales(nomClient(d) || "?")}</i>
      <span>
        <b>Client n° {d.client_id}</b>
        <small>
          {TYPES[d.type] ?? d.type} · {d.ref}
        </small>
      </span>
    </Link>
  );

  // Une page revenue avec un message (visite, espace client) : l'onglet concerné d'abord.
  const depart = c.sp.visite || c.sp.vc || c.sp.vd || c.sp.planifie ? { section: "demenagements", onglet: "visites" } : c.sp.espace ? { section: "commun", onglet: "espace" } : null;

  return { sections, fenetres, barre, identite, memo, depart };
}

// ─────────────────────────────── Déménagements ───────────────────────────────

function demenagements(c: Contexte, fenetres: Record<string, FenetreFiche>): SectionFiche {
  const { d, data } = c;
  const id = d.id as number;
  const signe = d.devis.find((v: Row) => v.statut === "signe");
  const apresCommande = ["commande", "planifie", "termine"].includes(d.statut);
  const perdu = d.statut === "perdu";
  const brouillons = d.devis.some((v: Row) => v.statut === "brouillon");
  const arrhes = d.paiements.filter((p: Row) => /arrhes/i.test(p.libelle));
  const totalArrhes = arrhes.reduce((a: number, p: Row) => a + Number(p.montant ?? 0), 0);
  const facturesDem = d.factures.filter((f: Row) => !data.idsGmFactures.has(f.id));

  // --- Visites : les rendez-vous du dossier, et les visites sur la tablette sans rendez-vous.
  const planifie = /^\d+$/.test(c.sp.planifie ?? "") ? data.rdvs.find((r) => r.id === Number(c.sp.planifie)) : undefined;
  const transfertDevis: Geste =
    d.type === "militaire"
      ? off("Dossier militaire : pas de devis.")
      : signe
        ? off("Un devis est déjà signé.")
        : d.volume <= 0
          ? off("Renseignez d'abord l'inventaire.")
          : { action: A.genererDevis.bind(null, id), confirmer: brouillons ? "Remplacer les brouillons ?" : undefined };

  const lignesVisites: Ligne[] = data.rdvs.map((r) => {
    const visite = estVisite(r.type) && !r.journee;
    const e = visite
      ? etatVisite({ termine: r.termine, devis_etabli: r.devis_etabli, sans_suite: r.sans_suite, dossier_statut: d.statut, compte_rendu_signe: r.visite_statut === "signee" })
      : null;
    const sms = c.etatsSms.get(r.id);
    const prochaine = new Date(new Date(r.debut).getTime() + 7 * 864e5);
    fenetres[`copier-rdv-${r.id}`] = {
      surtitre: "Dupliquer la visite",
      titre: r.titre,
      contenu: <FenetreCopieRdv d={d} r={r} jour={jourParis(prochaine)} heure={r.journee ? "09:00" : hhmmParis(r.debut)} />,
    };
    const tablette: Geste =
      r.visite_statut === "en_cours"
        ? { lien: `/tablette/${r.visite_id}` }
        : visite && r.visite_statut !== "signee"
          ? { action: commencerVisite.bind(null, id, r.id) }
          : off(r.visite_statut === "signee" ? "Le compte-rendu de cette visite est signé." : "Sans objet pour ce rendez-vous.");
    return {
      id: `r${r.id}`,
      tri: ms(r.debut),
      ton: e === "sans_suite" ? "attenue" : undefined,
      cellules: [
        e ? <Etat v={[ETATS_VISITE[e].libelle, ETATS_VISITE[e].ton]} /> : <Etat v={[r.termine ? "Faite" : "Prévue", "i"]} />,
        <b key="d">{maj(dateFr(r.debut, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }))}</b>,
        r.journee ? "Journée" : plageVisite(r.debut, r.duree_min),
        // Le type dans la couleur du planning (src/crm/planning/types-rdv.ts).
        <span key="ty" className={`type-rdv t-${r.type}`}>
          {estTypeRdv(r.type) ? TYPES_RDV[r.type].court : (RDV_TYPES[r.type] ?? r.type)}
        </span>,
        <span key="c" title={r.commercial}>
          <b>{r.initiales}</b>
          <small>{r.commercial}</small>
        </span>,
        <Long key="t" titre={[r.titre, r.lieu].filter(Boolean).join(" · ")}>
          {r.titre}
          {r.lieu && <small>{r.lieu}</small>}
        </Long>,
        sms ? <i className={`st ${sms.ton}`} title={sms.detail}>{sms.libelle}</i> : <span style={{ color: "#b4b1c4" }}>—</span>,
        // « Modifier » sur chaque rendez-vous : le planificateur en modification (/planning/<id>).
        <Link key="m" href={`/planning/${r.id}`} className={s.modifierLigne} title={visite ? "Modifier la visite : personne, sur place ou visio, créneau" : "Modifier le rendez-vous"}>
          <Picto nom="modifier" taille={14} />
          Modifier
        </Link>,
      ],
      gestes: {
        modifier: { lien: `/planning/${r.id}` },
        copier: { fenetre: `copier-rdv-${r.id}` },
        confirmer: !visite
          ? off("Le SMS de confirmation concerne les visites.")
          : r.termine || ms(r.debut) < c.maintenant
            ? off("La visite est passée.")
            : { action: B.envoyerSms.bind(null, id, r.id), confirmer: "Envoyer le SMS ?" },
        signer:
          r.visite_statut === "signee" && r.visite_id
            ? { lien: `/api/visites/${r.visite_id}/compte-rendu`, nouvelOnglet: true }
            : r.visite_statut === "en_cours"
              ? { lien: `/tablette/${r.visite_id}` }
              : off("Le compte-rendu se signe sur la tablette, à la fin de la visite."),
        tablette,
      },
      libelles: { signer: r.visite_statut === "signee" ? "Compte-rendu" : "Signer", tablette: r.visite_statut === "en_cours" ? "Reprendre" : "Tablette" },
      detail: (
        <>
          <h4>
            <Picto nom="visite" taille={16} />
            {r.titre}
          </h4>
          <div className={s.ligneInfos}>
            <span>
              <small>Quand</small>
              {r.journee ? "Journée entière" : `${maj(dateFr(r.debut, { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }))} · ${plageVisite(r.debut, r.duree_min)}`}
            </span>
            <span>
              <small>Commercial</small>
              {r.commercial}
            </span>
            {r.lieu && (
              <span>
                <small>Lieu</small>
                {r.lieu}
              </span>
            )}
            {r.notes && (
              <span style={{ flexBasis: "100%" }}>
                <small>Commentaire</small>
                {r.notes}
              </span>
            )}
          </div>
          <div className={s.actionsDetail}>
            <Link className="btn primary sm" href={`/planning/${r.id}`}>
              {visite ? (r.type === "visio" ? "Modifier la visio" : "Modifier la visite") : "Modifier le rendez-vous"}
            </Link>
            {visite && (
              <EtatSmsRdv etat={sms} confirmer={B.reponseRdv.bind(null, id, r.id, "confirme")} annuler={B.reponseRdv.bind(null, id, r.id, "annule")} />
            )}
            {visite && e === "planifiee" && (
              <form action={changerEtatVisite.bind(null, r.id, "effectuee")}>
                <button className="btn ghost sm">Marquer effectuée</button>
              </form>
            )}
            {visite && e !== "sans_suite" && (
              <form action={changerEtatVisite.bind(null, r.id, "sans_suite")}>
                <button className="btn ghost sm">Classer sans suite</button>
              </form>
            )}
            {visite && r.sans_suite && (
              <form action={changerEtatVisite.bind(null, r.id, "reprise")}>
                <button className="btn ghost sm">Reprendre</button>
              </form>
            )}
            {/* Une deuxième visite (le client a retiré du volume, une visio puis une visite sur place) : le planificateur
                repart de celle-ci, type, lieu et observations compris (réunion du 23/09). */}
            {visite && (
              <Link className="btn ghost sm" href={`/planning/nouveau?dossier=${id}&depuis=${r.id}`}>
                Nouvelle visite à partir de celle-ci
              </Link>
            )}
            <Link className="btn ghost sm" href={`/planning?semaine=${jourParis(r.debut)}&com=${r.commercial_id}`}>
              Voir au planning
            </Link>
          </div>
        </>
      ),
    };
  });
  for (const v of data.visitesSansRdv) {
    const signee = v.statut === "signee";
    lignesVisites.push({
      id: `v${v.id}`,
      tri: ms(v.signe_le ?? v.commencee_le),
      cellules: [
        <Etat key="e" v={signee ? ["Compte-rendu signé", "g"] : ["Saisie en cours", "w"]} />,
        <b key="d">{maj(dateFr(v.signe_le ?? v.commencee_le, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }))}</b>,
        "—",
        "Sans rendez-vous",
        v.commercial ?? "—",
        signee ? `Signé par ${v.signataire}` : "Visite technique sur la tablette",
        "—",
        "",
      ],
      gestes: {
        modifier: { lien: signee ? `/tablette/${v.id}/signature` : `/tablette/${v.id}` },
        signer: signee ? { lien: `/api/visites/${v.id}/compte-rendu`, nouvelOnglet: true } : { lien: `/tablette/${v.id}` },
        tablette: signee ? off("Le compte-rendu de cette visite est signé.") : { lien: `/tablette/${v.id}` },
        copier: off("Une visite sans rendez-vous ne se duplique pas."),
        confirmer: off("Pas de rendez-vous à confirmer."),
      },
      libelles: { signer: signee ? "Compte-rendu" : "Signer", tablette: signee ? "Tablette" : "Reprendre" },
    });
  }
  const visitesOnglet: Onglet = {
    cle: "visites",
    libelle: "Visites",
    compte: lignesVisites.length,
    colonnes: [{ libelle: "État" }, { libelle: "Date" }, { libelle: "Heure" }, { libelle: "Type" }, { libelle: "Com." }, { libelle: "Description" }, { libelle: "SMS" }, { libelle: "" }],
    lignes: lignesVisites,
    vide: (
      <>
        <b>Aucun rendez-vous</b>« Nouveau » pose une visite au planning ; on peut aussi proposer des créneaux au client ci-dessous.
      </>
    ),
    // Au retour du planificateur : la visite posée (ou modifiée), et la suite (prévenir le client).
    avant: planifie ? (
      <VisitePlanifiee dossierId={id} rdvId={planifie.id} sms={c.etatsSms.get(planifie.id)} maintenant={c.maintenant} modifiee={c.sp.modifie === "1"} />
    ) : undefined,
    gestes: {
      nouveau: { lien: `/planning/nouveau?dossier=${id}` },
      imprimer: { lien: `/imprimer/${id}?doc=fiche` },
      transfert: transfertDevis,
      tablette: { action: commencerVisite.bind(null, id, null) },
      adresses: { fenetre: "adresses" },
      inventaire: { fenetre: "inventaire" },
    },
    libelles: { imprimer: "Fiche visite", tablette: "Sans RDV" },
    extras: [
      { cle: "adresses", libelle: "Adresses", picto: "adresses" },
      { cle: "inventaire", libelle: "Invent.", picto: "inventaire" },
      { cle: "tablette", libelle: "Tablette", picto: "tablette" },
    ],
    apres: (
      <div className={s.imbrique}>
        {/* La visite technique (§3.2) : créneaux, rendez-vous, saisie sur la tablette, comptes-rendus signés. */}
        <SectionVisite d={d} commerciaux={c.utilisateurs.filter((u) => u.role === "commercial")} sp={c.sp} />
      </div>
    ),
  };

  // --- Devis
  const salut = d.civilite === "Madame" ? "Madame" : d.civilite === "Monsieur" ? "Monsieur" : "Bonjour";
  const mailto = `mailto:${d.email ?? ""}?subject=${encodeURIComponent(`Votre devis de déménagement ${d.ref}`)}&body=${encodeURIComponent(
    `${salut} ${d.nom},\n\nSuite à notre rencontre, veuillez trouver nos propositions pour votre déménagement de ${d.stops[0]?.adresse ?? ""} vers ${d.stops[d.stops.length - 1]?.adresse ?? ""} (${m3(d.volume)}) :\n\n` +
      d.devis.map((v: Row) => `• ${formule(v.formule)} : ${eur(v.montant)}`).join("\n") +
      `\n\nLes arrhes s'élèvent à 30 % de la formule retenue. Je reste à votre disposition.\n\nCordialement,\n${d.commercial ?? "Bailly Déménagement"}`,
  )}`;
  const lignesDevis: Ligne[] = d.devis.map((v: Row) => {
    const ouvert = ["brouillon", "envoye"].includes(v.statut) && !signe;
    const date = v.signe_le ?? v.envoye_le ?? data.devisCreeLe.get(v.id);
    // « Dupliquer » : dans ce dossier ou dans un autre (src/crm/duplication), un brouillon numéroté à la suite.
    fenetres[`dupliquer-devis-${v.id}`] = {
      surtitre: `Devis ${v.numero} · dossier ${d.ref}`,
      titre: "Dupliquer le devis",
      contenu: <FormulaireDupliquerDevis devis={{ id: v.id, numero: v.numero, dossierId: id, ref: d.ref, client: nomClient(d), volume: Number(d.volume) || 0 }} />,
    };
    return {
      id: `d${v.id}`,
      tri: ms(data.devisCreeLe.get(v.id)) || v.id,
      ton: v.statut === "refuse" ? "attenue" : undefined,
      cellules: [
        <Ref key="n">{v.numero}</Ref>,
        <Etat key="e" v={DEVIS_ST[v.statut] ?? [v.statut, "i"]} />,
        jj(date),
        <span key="f">
          <b>{formule(v.formule)}</b>
          <small>{FORMULE_SOUS[v.formule]}</small>
        </span>,
        TYPE_D[d.type_demenagement] ?? "National",
        d.commercial ? <span title={d.commercial}>{initiales(d.commercial)}</span> : "—",
        m3(d.volume),
        eur(Number(v.montant) / 1.2),
        <b key="t">{eur(v.montant)}</b>,
        jj(v.validite),
      ],
      gestes: {
        modifier: { lien: `/dossiers/${id}/devis/${v.id}` },
        copier: { fenetre: `dupliquer-devis-${v.id}` },
        confirmer:
          v.statut === "brouillon" && !signe
            ? { action: A.envoyerDevis.bind(null, id, v.id), confirmer: "Envoyer au client ?" }
            : off(v.statut === "envoye" ? `Déjà envoyé le ${jj(v.envoye_le)}.` : v.statut === "signe" ? "Ce devis est signé." : "Ce devis ne s'envoie plus."),
        transfert: perdu
          ? { choix: [{ libelle: "Rouvrir le dossier", action: A.rouvrir.bind(null, id) }] }
          : ouvert
            ? {
                choix: [
                  { libelle: "Signé par le client · passer en commande", action: A.signerDevis.bind(null, id, v.id), confirmer: "Confirmer la signature" },
                  { libelle: "Marquer le dossier perdu", action: A.marquerPerdu.bind(null, id), danger: true, confirmer: "Confirmer : dossier perdu" },
                ],
              }
            : off(signe ? "Un devis est signé : le dossier est en commande." : "Ce devis n'est plus ouvert."),
        signer: ouvert ? { action: B.envoyerPourSignature.bind(null, id, v.id), confirmer: "Envoyer le lien de signature ?" } : off("Ce devis n'est plus ouvert à la signature."),
      },
      libelles: { confirmer: "Envoyer" },
      detail: (
        <>
          <h4>
            <Picto nom="document" taille={16} />
            Devis {v.numero} · formule {formule(v.formule)} · {eur(v.montant)}
            {v.formule === "standard" && <i className="st p">Recommandé</i>}
          </h4>
          <ul className={s.lignesDevis}>
            {(v.lignes as Row[]).map((l, i) => (
              <li key={i} data-client={l.charge === "client"}>
                <span>{l.libelle}</span>
                <span>{l.charge === "client" ? "client" : eur(l.prix)}</span>
              </li>
            ))}
          </ul>
          <div className={s.actionsDetail}>
            <Link className="btn ghost sm" href={`/dossiers/${id}/devis/${v.id}`}>
              Détail du devis
            </Link>
            {v.token && v.statut === "envoye" && (
              <Link className="btn ghost sm" href={`/signature/${v.token}`}>
                <Picto nom="lien" taille={14} />
                Lien de signature client
              </Link>
            )}
            {v.statut === "signe" && <span className="sub">Signé le {jj(v.signe_le)}</span>}
          </div>
        </>
      ),
    };
  });
  const devisOnglet: Onglet = {
    cle: "devis",
    libelle: "Devis",
    compte: d.devis.length,
    colonnes: [
      { libelle: "Devis" },
      { libelle: "État" },
      { libelle: "Date" },
      { libelle: "Catégorie" },
      { libelle: "Type" },
      { libelle: "Com." },
      { libelle: "Vol.", num: true },
      { libelle: "HT", num: true },
      { libelle: "TTC", num: true },
      { libelle: "Validité" },
    ],
    lignes: lignesDevis,
    vide:
      d.type === "militaire" ? (
        <>
          <b>Dossier militaire : pas de devis</b>Le client dépose ses documents et le dossier passe directement en commande.
        </>
      ) : (
        <>
          <b>Pas encore de devis</b>
          {d.volume <= 0 ? "Renseignez d’abord l’inventaire, ou partez d’un devis libre (« Nouveau »)." : "« Nouveau » : devis libre, formules au choix ou duplication d’un devis ; « 3 formules » les génère d’un coup."}
        </>
      ),
    gestes: {
      // « Nouveau » : la page des devis du dossier, ouverte sur ses trois départs (libre, formules choisies, duplication d'un devis).
      nouveau: d.type === "militaire" ? off("Dossier militaire : pas de devis.") : signe ? off("Un devis est déjà signé.") : { lien: `/devis?dossier=${id}&nouveau=libre` },
      formules: transfertDevis,
      imprimer: d.devis.length ? { lien: `/imprimer/${id}?doc=devis` } : off("Pas encore de devis."),
      email: d.email && d.devis.length ? { lien: mailto } : off(d.email ? "Pas encore de devis." : "Pas d'adresse e-mail sur la fiche client."),
      ...(d.type === "militaire"
        ? { sansdevis: apresCommande ? off("Le dossier est déjà en commande.") : { action: A.commandeSansDevis.bind(null, id), confirmer: "Passer en commande ?" } }
        : {}),
    },
    libelles: { imprimer: "Aperçu client" },
    extras: [
      { cle: "formules", libelle: "3 formules", picto: "rafraichir" },
      { cle: "email", libelle: "E-mail", picto: "mail" },
      ...(d.type === "militaire" ? [{ cle: "sansdevis", libelle: "Commande sans devis", picto: "coche" } as Outil] : []),
    ],
    apres: signe ? (
      <p className="sub" style={{ margin: 0 }}>
        Arrhes {String(data.arrhesPct.get(signe.id) ?? data.arrhesDefaut).replace(".", ",")} % : <b>{eur(Math.round((signe.montant * (data.arrhesPct.get(signe.id) ?? data.arrhesDefaut)) / 100))}</b>
        {totalArrhes > 0 ? ` · reçues : ${eur(totalArrhes)}` : " · pas encore reçues (onglet Facturation)"}
      </p>
    ) : undefined,
  };

  // --- Déménagements : la commande, sa planification et ses lettres de voiture.
  fenetres.planifier = { surtitre: `Dossier ${d.ref}`, titre: "Planification du déménagement", contenu: <FenetrePlanifier d={d} /> };
  const lignesLv: Ligne[] = d.lettres.map((l: Row) => {
    fenetres[`lettre-${l.id}`] = { surtitre: `Lettre de voiture · ${LV_ST[l.statut]?.[0] ?? l.statut}`, titre: l.numero, contenu: <FenetreLettre d={d} l={l} />, large: true };
    return {
      id: `l${l.id}`,
      tri: ms(l.date_chargement ?? l.date_livraison) || l.id,
      cellules: [
        <Ref key="n">{l.numero}</Ref>,
        signe?.numero ?? "—",
        <Etat key="e" v={LV_ST[l.statut] ?? [l.statut, "i"]} />,
        jj(l.date_chargement),
        jj(l.date_livraison),
        <Long key="t" titre={l.trajet}>
          {l.trajet}
        </Long>,
        l.prestataire,
        l.equipe ?? "—",
        l.montant > 0 ? <b key="m">{eur(l.montant)}</b> : <span key="m" style={{ color: "#9a97ae" }}>0 €</span>,
      ],
      gestes: {
        modifier: { fenetre: `lettre-${l.id}` },
        copier: { action: F.copierLettre.bind(null, id, l.id) },
        imprimer: { lien: `/imprimer/${id}?doc=lettre&lv=${l.id}` },
        soustraitance: { lien: `/imprimer/${id}?doc=soustraitance&lv=${l.id}` },
        supprimer: { action: F.supprimerLettre.bind(null, id, l.id), confirmer: "Supprimer la lettre ?" },
      },
      detail: (
        <>
          <h4>
            <Picto nom="camion" taille={16} />
            {l.numero} · {l.trajet}
          </h4>
          <div className={s.ligneInfos}>
            <span>
              <small>Prestataire</small>
              {l.prestataire}
              {l.prix_sous_traitance != null ? ` · ${eur(l.prix_sous_traitance)} HT` : ""}
            </span>
            <span>
              <small>Équipe</small>
              {l.equipe ?? "—"}
            </span>
            <span>
              <small>Camion</small>
              {l.immatriculation ?? "—"}
            </span>
            <span style={{ flex: "1 1 280px" }}>
              <small>Instructions</small>
              {l.instructions ?? "—"}
            </span>
          </div>
        </>
      ),
    };
  });
  const suivi: [string, boolean][] = [
    ["Devis signé par le client", !!signe],
    ["Arrhes versées", totalArrhes > 0],
    ["Chargement : date posée au planning", !!d.date_chargement],
    ["Livraison : date posée au planning", !!d.date_livraison],
    // Coché sur la demande de stationnement (module des visites), plus sur un simple texte d'accès (faux positif relevé par l'audit).
    ["Demande de stationnement renseignée", d.stops.some((x: Row) => x.stationnement === "autorisation" || x.stationnement === "reserve_client")],
    ["Proposition de sous-traitance éditée", d.lettres.some((l: Row) => l.prix_sous_traitance != null)],
    ["Personnel affecté", d.lettres.some((l: Row) => l.equipe)],
    ["Véhicule affecté", d.lettres.some((l: Row) => l.immatriculation)],
    ["Instructions rédigées", d.lettres.some((l: Row) => l.instructions)],
    ["Matériel (emballages) prévu", d.volume > 0],
    // Coché seulement si le SMS est vraiment parti (pas journalisé ni bloqué : voir crm/envois.ts).
    ["SMS de confirmation envoyé", d.activite.some((a: Row) => /^SMS de confirmation (envoyé|déjà envoyé)/.test(String(a.libelle)))],
    ["Lettres de voiture créées", d.lettres.length > 0],
  ];
  const faits = suivi.filter((x) => x[1]).length;
  const lvOnglet: Onglet = {
    cle: "demenagements",
    libelle: "Déménagements",
    compte: d.lettres.length,
    colonnes: [
      { libelle: "LV" },
      { libelle: "Devis" },
      { libelle: "État" },
      { libelle: "Chargement" },
      { libelle: "Livraison" },
      { libelle: "Trajet" },
      { libelle: "Prestataire" },
      { libelle: "Équipe" },
      { libelle: "Montant", num: true },
    ],
    lignes: lignesLv,
    vide: apresCommande ? (
      <>
        <b>Pas encore de lettre de voiture</b>Une lettre de voiture est créée par rupture de charge (ex. Paris → garde-meuble, puis garde-meuble → arrivée). « Nouveau » les crée.
      </>
    ) : (
      <>
        <b>Pas encore de commande</b>Les lettres de voiture se créent une fois le dossier en commande.
      </>
    ),
    gestes: {
      nouveau: !apresCommande
        ? off("Le dossier n'est pas encore en commande.")
        : d.lettres.length === 0
          ? { action: A.creerLettres.bind(null, id) }
          : { action: F.ajouterLettre.bind(null, id) },
      confirmer: apresCommande ? { fenetre: "planifier" } : off("Le dossier n'est pas encore en commande."),
      transfert:
        d.type === "compte"
          ? off("Client « compte » : pas de facture ni de paiement en ligne côté client (parcours dédié).")
          : apresCommande
            ? { aller: { section: "demenagements", onglet: "facturation" } }
            : off("Le dossier n'est pas encore en commande."),
      signer: off("La signature des lettres de voiture n'existe pas encore dans le CRM."),
      conteneur: { lien: "/conteneurs" },
    },
    libelles: { confirmer: d.date_chargement ? "Dates" : "Planifier", imprimer: "Let. voit.", transfert: "Facturer" },
    extras: [
      { cle: "soustraitance", libelle: "Sous-traitance", picto: "partenaire" },
      { cle: "conteneur", libelle: "Contain.", picto: "conteneur" },
      O.supprimer,
    ],
    avant: apresCommande ? (
      <div className={s.ligneInfos} style={{ padding: "2px 4px" }}>
        <span>
          <small>Chargement</small>
          {d.date_chargement ? dateFr(d.date_chargement, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Pas de date : voir Planifier"}
        </span>
        <span>
          <small>Livraison</small>
          {d.date_livraison ? dateFr(d.date_livraison, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"}
        </span>
        {!d.date_chargement && (
          <span>
            <small>Mois du CA</small>Sans date, le CA se rattache au mois prévu ({d.periode ?? "à préciser"}).
          </span>
        )}
      </div>
    ) : undefined,
    apres: apresCommande ? (
      <div className={s.volet}>
        <h4>
          <Picto nom="commun" taille={16} />
          Suivi de la commande
          <span className={s.jauge}>
            <span>
              <i style={{ width: `${Math.round((faits / suivi.length) * 100)}%` }} />
            </span>
            {faits} / {suivi.length} actions faites
          </span>
        </h4>
        <div className={s.suivi}>
          {suivi.map(([l, ok]) => (
            <div key={l} className={ok ? s.fait : s.reste}>
              <i>{ok ? "✓" : "✗"}</i>
              {l}
            </div>
          ))}
        </div>
      </div>
    ) : undefined,
  };

  // --- Facturation : le module d'encaissement et de facturation (src/crm/facturation) — règlements,
  // factures d'arrhes, de solde et libres, avoirs, client payeur, situation du dossier. La carte lit ses
  // données elle-même et porte ses fenêtres ; `?encaisser=arrhes#facturation` ouvre l'encaissement.
  const facturationOnglet: Onglet = {
    cle: "facturation",
    libelle: "Facturation",
    compte: facturesDem.length + d.paiements.length,
    colonnes: [],
    lignes: [],
    vide: null,
    gestes: {
      nouveau: off("Encaisser et facturer : les boutons de la carte ci-dessous."),
      imprimer: off("Chaque facture s'imprime depuis sa ligne, dans la carte ci-dessous."),
    },
    avant: <CarteFacturation dossierId={id} />,
  };

  // --- Litiges
  fenetres["litige-nouveau"] = { surtitre: `Dossier ${d.ref}`, titre: "Ouvrir un litige", contenu: <FenetreLitige d={d} /> };
  const litigesOnglet: Onglet = {
    cle: "litiges",
    libelle: "Litiges",
    compte: c.litiges.length,
    colonnes: [{ libelle: "N°" }, { libelle: "État" }, { libelle: "Ouvert le" }, { libelle: "Objet" }, { libelle: "Montant", num: true }],
    lignes: c.litiges.map((l) => {
      fenetres[`litige-${l.id}`] = { surtitre: `Litige n° ${l.id}`, titre: l.objet, contenu: <FenetreLitige d={d} l={l} /> };
      return {
        id: `g${l.id}`,
        tri: ms(l.ouvert_le) || l.id,
        ton: l.statut === "ouvert" ? "alerte" : l.statut === "clos" ? "attenue" : undefined,
        cellules: [<Ref key="n">{l.id}</Ref>, <Etat key="e" v={LITIGE_ST[l.statut] ?? [l.statut, "i"]} />, jj(l.ouvert_le), <Long key="o">{l.objet}</Long>, l.montant ? eur(l.montant) : "—"],
        gestes: {
          modifier: { fenetre: `litige-${l.id}` },
          confirmer: l.statut === "clos" ? off("Le litige est clos.") : { action: B.changerLitige.bind(null, id, l.id, l.statut === "ouvert" ? "en_cours" : "clos") },
        },
        libelles: { confirmer: l.statut === "ouvert" ? "Prendre en charge" : l.statut === "en_cours" ? "Clore" : "Confirmer" },
      };
    }),
    vide: <b>Aucun litige sur ce dossier.</b>,
    gestes: { nouveau: { fenetre: "litige-nouveau" } },
  };

  const parStatut: Record<string, string> = { prospect: "visites", visite: "visites", devis: "devis", perdu: "devis", commande: "demenagements", planifie: "demenagements", termine: facturesDem.length ? "facturation" : "demenagements" };
  return {
    cle: "demenagements",
    titre: "Déménagements",
    picto: "camion",
    // Le trajet est dans le bandeau : ici, ce que le bandeau ne montre plus (type, commercial, qui traite le dossier).
    resume: [TYPE_D[d.type_demenagement] ?? "National", `Commercial : ${d.commercial ?? "—"}`, `Traité par : ${d.traite_par ?? "—"}`].join(" · "),
    outils: [O.nouveau, O.modifier, O.copier, O.confirmer, O.imprimer, O.transfert, O.signer],
    onglets: [visitesOnglet, devisOnglet, lvOnglet, facturationOnglet, litigesOnglet],
    ongletParDefaut: parStatut[d.statut] ?? "visites",
    ouverteParDefaut: true,
  };
}

/** Une facture en ligne de tableau. `reglable` : une facture du déménagement (« Payée » termine le dossier planifié). */
function ligneFacture(dossierId: number, f: Row, reglable: boolean): Ligne {
  const etat = FACT_ST[f.statut] ?? [f.statut, "i"];
  // Les factures lues par getDossier sont celles du dossier ; celles du garde-meuble disent le leur (ou aucun).
  const duDossier = f.dossier_id === undefined || f.dossier_id === dossierId;
  return {
    id: `f${f.id}`,
    tri: ms(f.emise_le) || f.id,
    ton: f.statut === "retard" ? "alerte" : undefined,
    cellules: [
      <Ref key="n">{f.numero}</Ref>,
      <Long key="o">{f.objet}</Long>,
      jj(f.emise_le),
      <b key="m">{eur(f.montant)}</b>,
      <Etat key="e" v={etat as [string, string]} />,
      f.payee_le ? jj(f.payee_le) : "—",
    ],
    gestes: {
      modifier: off("Une facture émise ne se modifie pas."),
      // Dupliquer : une facture à émettre, depuis la carte Facturation (la fiche ouvre sa fenêtre directement, onglet Commun › Factures).
      copier: String(f.numero).startsWith("AV-")
        ? off("Un avoir ne se duplique pas : il annule une facture.")
        : duDossier
          ? { aller: { section: "demenagements", onglet: "facturation" } }
          : off("Facture sans dossier : elle ne se duplique pas encore dans le CRM (la facture à émettre est celle d'un dossier)."),
      imprimer: duDossier ? { lien: `/imprimer/${dossierId}?doc=facture&f=${f.id}` } : off("Facture sans dossier : elle s'imprime depuis la page Factures."),
      confirmer:
        f.statut === "payee"
          ? off("Facture déjà payée.")
          : reglable
            ? { action: A.facturePayee.bind(null, dossierId, f.id), confirmer: "Marquer payée ?" }
            : duDossier
              // Une facture de garde-meuble du dossier se règle dans la carte Facturation (« Encaisser »).
              ? { aller: { section: "demenagements", onglet: "facturation" } }
              : off("Facture sans dossier : son règlement ne se saisit pas encore dans le CRM (la carte Facturation est celle d'un dossier)."),
      // L'avoir se fait dans la carte Facturation (src/crm/facturation), qui tient la numérotation AV- et le reste à payer.
      transfert:
        f.statut === "annulee"
          ? off("Facture déjà annulée par un avoir.")
          : duDossier
            ? { aller: { section: "demenagements", onglet: "facturation" } }
            : off("Facture sans dossier : son avoir ne se fait pas encore dans le CRM (la carte Facturation est celle d'un dossier)."),
      signer: off("Sans objet pour une facture."),
    },
    libelles: { confirmer: "Marquer payée", transfert: "Avoir" },
  };
}

// ─────────────────────────────── Garde-meubles ───────────────────────────────

function gardeMeubles(c: Contexte): SectionFiche {
  const { d, data } = c;
  const id = d.id as number;
  const maintenant = Date.now();
  const contrats: Row[] = data.gm.map((g) => {
    const base = new Date(g.derniere_facture ?? g.debut);
    const mois = g.periodicite === "trimestrielle" ? 3 : 1;
    const echeance = new Date(base);
    echeance.setMonth(echeance.getMonth() + mois);
    const retard = Math.floor((maintenant - +echeance) / 864e5);
    return { ...g, montant: g.loyer * mois, echeance, retard, afacturer: g.actif && retard >= 0 };
  });
  const nouveauContrat: Geste = { lien: LIEN_NOUVEAU_CONTRAT_GM(id) };
  const gmOnglet: Onglet = {
    cle: "gm",
    libelle: "GM/Self",
    compte: contrats.length,
    colonnes: [
      { libelle: "Contrat" },
      { libelle: "Client" },
      { libelle: "Caisses", num: true },
      { libelle: "Numéros" },
      { libelle: "Périodicité" },
      { libelle: "Loyer mensuel", num: true },
      { libelle: "Début" },
      { libelle: "Dernière facture" },
      { libelle: "Échéance" },
    ],
    lignes: contrats.map((g) => ({
      id: `gm${g.id}`,
      tri: ms(g.debut) || g.id,
      ton: !g.actif ? "attenue" : g.retard > 20 ? "alerte" : undefined,
      cellules: [
        <Ref key="n">GM {g.id}</Ref>,
        <span key="c">
          <b>{g.client}</b>
          <small>{g.assurance ? "Assuré" : "Non assuré"}</small>
        </span>,
        g.nb_caisses,
        <Long key="x">{g.numeros ?? "—"}</Long>,
        maj(g.periodicite),
        eur(g.loyer),
        jj(g.debut),
        jj(g.derniere_facture),
        !g.actif ? (
          <Etat key="e" v={["Terminé", "i"]} />
        ) : g.afacturer ? (
          <Etat key="e" v={[g.retard > 20 ? `Non facturé depuis ${g.retard} j` : "À facturer", g.retard > 20 ? "r" : "w"]} />
        ) : (
          <Etat key="e" v={[jj(g.echeance), "g"]} />
        ),
      ],
      gestes: {
        // Le contrat (caisses une par une, photos, loyer, clôture) se modifie sur sa page, module garde-meuble.
        modifier: { lien: `/garde-meuble/${g.id}` },
        copier: off("Un contrat ne se duplique pas : « Nouveau » en ouvre un autre, prérempli avec le dossier."),
        transfert: g.afacturer
          ? { action: B.facturerGardeMeuble.bind(null, g.id, g.montant), confirmer: `Facturer ${eur(g.montant)} ?` }
          : off(g.actif ? `Prochaine échéance le ${jj(g.echeance)}.` : "Contrat terminé."),
      },
    })),
    vide: (
      <>
        <b>Aucun contrat de garde-meuble sur ce dossier</b>
        {d.stops.some((x: Row) => x.genre === "garde_meuble") ? "Le trajet passe par le garde-meuble." : "« Nouveau » ouvre le formulaire de contrat."}
      </>
    ),
    gestes: {
      nouveau: nouveauContrat,
      imprimer: off("Le CRM n'édite pas encore de devis de garde-meuble."),
      signer: off("La signature d'un contrat de garde-meuble n'existe pas encore dans le CRM."),
      liste: { lien: "/garde-meuble" },
    },
    libelles: { transfert: "Facturer", imprimer: "Devis" },
    extras: [{ cle: "liste", libelle: "Tous les contrats", picto: "entrepot" }],
    apres: (
      // Le formulaire de création des contrats (module garde-meuble), prérempli avec le dossier.
      <div className={s.emplacement} data-emplacement="contrat-gm">
        <div>
          <b>Nouveau contrat de garde-meuble</b>
          <br />
          Caisses, numéros, périodicité, loyer, assurance.
        </div>
        <Link className="btn primary sm" href={LIEN_NOUVEAU_CONTRAT_GM(id)}>
          <Picto nom="nouveau" taille={15} />
          Nouveau contrat
        </Link>
      </div>
    ),
  };
  const devisGm: Onglet = {
    cle: "devis",
    libelle: "Devis",
    compte: 0,
    colonnes: [],
    lignes: [],
    vide: <b>Les devis de garde-meuble ne sont pas encore gérés dans le CRM.</b>,
    gestes: { nouveau: off("Les devis de garde-meuble ne sont pas encore gérés dans le CRM."), imprimer: off("Pas de devis de garde-meuble.") },
    libelles: { imprimer: "Devis" },
  };
  const payeur: Onglet = {
    cle: "payeur",
    libelle: "Factures client payeur",
    compte: 0,
    colonnes: [],
    lignes: [],
    vide: (
      <>
        <b>Aucune facture à un client payeur</b>Le client payeur (un autre client que celui du dossier) se choisit dans l’onglet Facturation, section Déménagements.
      </>
    ),
    gestes: { nouveau: { aller: { section: "demenagements", onglet: "facturation" } } },
  };
  const facturesGm: Onglet = {
    cle: "factures",
    libelle: "Factures client",
    compte: data.facturesGm.length,
    colonnes: [{ libelle: "Facture" }, { libelle: "Objet" }, { libelle: "Émise le" }, { libelle: "Montant", num: true }, { libelle: "État" }, { libelle: "Payée le" }],
    lignes: data.facturesGm.map((f) => ligneFacture(id, f, false)),
    vide: <b>Aucune facture de garde-meuble.</b>,
    gestes: { nouveau: off("Une facture de garde-meuble s'émet depuis son contrat (onglet GM/Self, « Facturer »).") },
    libelles: { transfert: "Avoir" },
  };
  const avecGm = contrats.length > 0 || d.stops.some((x: Row) => x.genre === "garde_meuble") || d.type_demenagement === "gm";
  const actifs = contrats.filter((g) => g.actif);
  return {
    cle: "garde-meubles",
    titre: "Garde-meubles",
    picto: "entrepot",
    resume: actifs.length ? `${actifs.length} contrat${actifs.length > 1 ? "s" : ""} en cours · ${actifs.reduce((a, g) => a + g.nb_caisses, 0)} caisse(s)` : "Contrats, caisses et factures de garde-meuble",
    outils: [O.nouveau, O.modifier, O.copier, O.imprimer, O.transfert, O.signer],
    onglets: [devisGm, gmOnglet, payeur, facturesGm],
    ongletParDefaut: "gm",
    ouverteParDefaut: avecGm,
  };
}

// ─────────────────────────────── Services ───────────────────────────────

function services(c: Contexte, fenetres: Record<string, FenetreFiche>): SectionFiche {
  const { d, data } = c;
  const id = d.id as number;
  fenetres["service-nouveau"] = { surtitre: "Services · section provisoire", titre: "Nouveau service", contenu: <FenetreService d={d} /> };
  const suivant: Record<string, string> = { prevu: "confirme", confirme: "realise" };
  const onglet: Onglet = {
    cle: "services",
    libelle: "Services",
    compte: data.services.length,
    colonnes: [{ libelle: "Service" }, { libelle: "Date prévue" }, { libelle: "Montant", num: true }, { libelle: "Statut" }, { libelle: "Notes" }],
    lignes: data.services.map((v) => {
      fenetres[`service-${v.id}`] = { surtitre: "Services · section provisoire", titre: v.libelle, contenu: <FenetreService d={d} v={v} /> };
      const st = STATUTS_SERVICE[v.statut] ?? { libelle: v.statut, ton: "i" };
      const prochain = suivant[v.statut];
      return {
        id: `s${v.id}`,
        tri: ms(v.date_prevue ?? v.cree_le) || v.id,
        ton: v.statut === "annule" ? "attenue" : undefined,
        cellules: [<b key="l">{v.libelle}</b>, jj(v.date_prevue), v.montant != null ? eur(v.montant) : "—", <Etat key="e" v={[st.libelle, st.ton]} />, <Long key="n">{v.notes ?? "—"}</Long>],
        gestes: {
          modifier: { fenetre: `service-${v.id}` },
          copier: { action: F.copierService.bind(null, id, v.id) },
          confirmer: prochain ? { action: F.statutService.bind(null, id, v.id, prochain) } : off(v.statut === "realise" ? "Service réalisé." : "Service annulé."),
          transfert:
            v.statut === "annule"
              ? { choix: [{ libelle: "Remettre en prévu", action: F.statutService.bind(null, id, v.id, "prevu") }] }
              : { choix: [{ libelle: "Annuler le service", action: F.statutService.bind(null, id, v.id, "annule"), danger: true, confirmer: "Confirmer l'annulation" }] },
          supprimer: { action: F.supprimerService.bind(null, id, v.id), confirmer: "Supprimer le service ?" },
        },
        libelles: { confirmer: prochain === "realise" ? "Réalisé" : "Confirmer" },
      };
    }),
    vide: (
      <>
        <b>Aucun service complémentaire</b>« Nouveau » ajoute un service : un libellé, une date, un montant, un statut.
      </>
    ),
    gestes: {
      nouveau: { fenetre: "service-nouveau" },
      imprimer: off("Pas encore de document pour les services."),
      signer: off("Pas encore de signature pour les services."),
    },
    avant: <p className={s.aide}>Section provisoire : le modèle des services reste à valider avec Bailly.</p>,
  };
  return {
    cle: "services",
    titre: "Services",
    picto: "service",
    resume: data.services.length ? `${data.services.length} service${data.services.length > 1 ? "s" : ""} · ${eur(data.services.reduce((a, v) => a + (v.statut === "annule" ? 0 : Number(v.montant ?? 0)), 0))}` : "Services complémentaires (provisoire)",
    outils: [O.nouveau, O.modifier, O.copier, O.confirmer, O.imprimer, O.transfert, O.signer],
    onglets: [{ ...onglet, extras: [O.supprimer] }],
    ongletParDefaut: "services",
    ouverteParDefaut: data.services.length > 0,
  };
}

// ─────────────────────────────── Commun ───────────────────────────────

function commun(c: Contexte, fenetres: Record<string, FenetreFiche>): SectionFiche {
  const { d, data } = c;
  const id = d.id as number;
  const totalRegle = d.paiements.reduce((a: number, p: Row) => a + Number(p.montant ?? 0), 0);
  const versFacturation: Geste = { aller: { section: "demenagements", onglet: "facturation" } };
  const lectureSeule = off("Journal en lecture seule.");

  // Règlements
  const reglements: Onglet = {
    cle: "reglements",
    libelle: "Règlements",
    compte: d.paiements.length,
    colonnes: [{ libelle: "Règlement" }, { libelle: "Reçu le" }, { libelle: "Montant", num: true }, { libelle: "État" }],
    lignes: d.paiements.map((p: Row) => ({
      id: `p${p.id}`,
      tri: ms(p.recu_le) || p.id,
      cellules: [<b key="l">{p.libelle}</b>, jj(p.recu_le), <b key="m">{eur(p.montant)}</b>, <Etat key="e" v={["Reçu", "g"]} />],
      gestes: {
        modifier: off("Un règlement enregistré ne se modifie pas ici."),
        copier: off("Un règlement ne se duplique pas."),
        supprimer: off("Un règlement enregistré ne se supprime pas ici."),
      },
    })),
    vide: <b>Aucun règlement reçu.</b>,
    gestes: { nouveau: versFacturation, imprimer: off("Pas encore de reçu imprimable."), signer: off("Sans objet pour un règlement.") },
    avant: (
      <div className={s.ligneInfos} style={{ padding: "2px 4px" }}>
        <span>
          <small>Total réglé</small>
          <b>{eur(totalRegle)}</b>
        </span>
        <span>
          <small>Solde</small>
          <b style={{ color: c.solde > 0 ? "#b45309" : "#0b7a4e" }}>{eur(c.solde)}</b>
        </span>
      </div>
    ),
  };

  // Factures (déménagement et garde-meuble)
  const toutes = [...d.factures.filter((f: Row) => !data.idsGmFactures.has(f.id)).map((f: Row) => ({ ...f, origine: "Déménagement" })), ...data.facturesGm.map((f) => ({ ...f, origine: "Garde-meuble" }))];
  const factures: Onglet = {
    cle: "factures",
    libelle: "Factures",
    compte: toutes.length,
    colonnes: [{ libelle: "Facture" }, { libelle: "Objet" }, { libelle: "Émise le" }, { libelle: "Montant", num: true }, { libelle: "État" }, { libelle: "Payée le" }],
    lignes: toutes.map((f) => {
      const l = ligneFacture(id, f, f.origine === "Déménagement");
      return { ...l, cellules: [l.cellules[0], <span key="o"><span className={s.long}>{f.objet}</span><small>{f.origine}</small></span>, ...l.cellules.slice(2)], gestes: { ...l.gestes, supprimer: off("Une facture émise ne se supprime pas.") } };
    }),
    vide: <b>Aucune facture.</b>,
    gestes: { nouveau: versFacturation },
  };

  // Contacts : le client lui-même, puis les autres personnes à joindre.
  fenetres["contact-nouveau"] = { surtitre: `Client n° ${d.client_id}`, titre: "Nouveau contact", contenu: <FenetreContact d={d} /> };
  const telClient = [d.telephone, d.telephone2].filter(Boolean).join(" · ");
  const lignesContacts: Ligne[] = [
    {
      id: "principal",
      tri: 0,
      cellules: [
        <span key="n">
          <b><Link href={`/clients/${d.client_id}`}>{[d.civilite, d.prenom, d.nom].filter(Boolean).join(" ") || nomClient(d)}</Link></b>
          <small>Contact principal</small>
        </span>,
        d.societe ?? TYPES[d.type] ?? "Client",
        telClient || "—",
        d.email ?? "—",
        "—",
      ],
      gestes: {
        modifier: { fenetre: "fiche" },
        copier: off("Le contact principal est le client du dossier."),
        supprimer: off("Le contact principal est le client du dossier."),
        appeler: d.telephone ? { lien: `tel:${String(d.telephone).replace(/\s/g, "")}` } : off("Pas de téléphone."),
        ecrire: d.email ? { lien: `mailto:${d.email}` } : off("Pas d'adresse e-mail."),
      },
    },
    ...data.contacts.map((k) => {
      fenetres[`contact-${k.id}`] = { surtitre: "Contact", titre: [k.prenom, k.nom].filter(Boolean).join(" "), contenu: <FenetreContact d={d} c={k} /> };
      return {
        id: `k${k.id}`,
        tri: ms(k.cree_le) || k.id,
        cellules: [
          <b key="n">{[k.civilite, k.prenom, k.nom].filter(Boolean).join(" ")}</b>,
          k.fonction ?? "—",
          k.telephone ?? "—",
          k.email ?? "—",
          <Long key="x">{k.notes ?? "—"}</Long>,
        ],
        gestes: {
          modifier: { fenetre: `contact-${k.id}` },
          copier: { action: F.copierContact.bind(null, id, k.id) },
          supprimer: { action: F.supprimerContact.bind(null, id, k.id), confirmer: "Supprimer le contact ?" },
          appeler: k.telephone ? { lien: `tel:${String(k.telephone).replace(/\s/g, "")}` } : off("Pas de téléphone."),
          ecrire: k.email ? { lien: `mailto:${k.email}` } : off("Pas d'adresse e-mail."),
        },
      } satisfies Ligne;
    }),
  ];
  const contacts: Onglet = {
    cle: "contacts",
    libelle: "Contacts",
    compte: lignesContacts.length,
    colonnes: [{ libelle: "Contact" }, { libelle: "Fonction" }, { libelle: "Téléphone" }, { libelle: "E-mail" }, { libelle: "Notes" }],
    lignes: lignesContacts,
    vide: null,
    gestes: { nouveau: { fenetre: "contact-nouveau" }, imprimer: off("Pas de fiche contact imprimable."), signer: off("Sans objet pour un contact.") },
    extras: [
      { cle: "appeler", libelle: "Appeler", picto: "telephone" },
      { cle: "ecrire", libelle: "Écrire", picto: "mail" },
    ],
  };

  // E-mails et SMS : le journal des envois de la plateforme (public.envois), en lecture seule.
  const envois: Onglet = {
    cle: "envois",
    libelle: "E-mails et SMS",
    compte: data.envois.length,
    colonnes: [{ libelle: "Date" }, { libelle: "Canal" }, { libelle: "Message" }, { libelle: "Destinataire" }, { libelle: "Objet" }, { libelle: "Statut" }],
    lignes: data.envois.map((e) => ({
      id: `e${e.id}`,
      tri: ms(e.cree_le),
      ton: e.statut === "echec" ? "alerte" : undefined,
      cellules: [
        jjhh(e.cree_le),
        <span key="c" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Picto nom={e.canal === "sms" ? "message" : "mail"} taille={15} />
          {e.canal === "sms" ? "SMS" : "E-mail"}
        </span>,
        e.modele ?? "—",
        <Long key="d">{e.destinataire}</Long>,
        <Long key="o" titre={e.sujet ?? e.apercu ?? ""}>
          {e.sujet ?? e.apercu ?? "—"}
        </Long>,
        <i key="s" className={`st ${ENVOI_TON[e.statut] ?? "i"}`} title={e.motif ?? undefined}>
          {maj(libelleStatut({ statut: e.statut as StatutEnvoi, doublon: false }))}
        </i>,
      ],
      detail:
        e.apercu || e.motif ? (
          <div className={s.ligneInfos}>
            {e.apercu && (
              <span style={{ flex: "1 1 420px" }}>
                <small>Texte du SMS</small>
                {e.apercu}
              </span>
            )}
            {e.motif && (
              <span style={{ flex: "1 1 300px" }}>
                <small>Motif</small>
                {e.motif}
              </span>
            )}
          </div>
        ) : undefined,
    })),
    vide: (
      <>
        <b>Aucun e-mail ni SMS pour ce dossier</b>Le journal des envois de la plateforme, en lecture seule.
      </>
    ),
    gestes: { nouveau: lectureSeule, modifier: lectureSeule, imprimer: lectureSeule, copier: lectureSeule, supprimer: lectureSeule, signer: lectureSeule },
    avant: data.envois.length ? (
      <p className={s.aide}>
        Le journal des envois de la plateforme (dossier {d.ref}
        {data.espace && data.espace.reference !== d.ref ? ` et espace ${data.espace.reference}` : ""}), en lecture seule.
      </p>
    ) : undefined,
  };

  // Courriers : les documents du dossier prêts à imprimer.
  const docs: { id: string; libelle: string; pour: string; date: Date | string | null; lien: string; nouvel?: boolean }[] = [
    { id: "fiche", libelle: "Fiche de visite", pour: "Dossier", date: d.maj_le, lien: `/imprimer/${id}?doc=fiche` },
    ...(d.devis.length ? [{ id: "devis", libelle: `Devis (${d.devis.length} formule${d.devis.length > 1 ? "s" : ""})`, pour: "Client", date: d.devis[0] && data.devisCreeLe.get(d.devis[0].id), lien: `/imprimer/${id}?doc=devis` }] : []),
    ...d.lettres.flatMap((l: Row) => [
      { id: `lv${l.id}`, libelle: `Lettre de voiture ${l.numero}`, pour: "Équipe", date: l.date_chargement ?? l.date_livraison, lien: `/imprimer/${id}?doc=lettre&lv=${l.id}` },
      { id: `st${l.id}`, libelle: `Proposition de sous-traitance ${l.numero}`, pour: l.prestataire, date: l.date_chargement ?? l.date_livraison, lien: `/imprimer/${id}?doc=soustraitance&lv=${l.id}` },
    ]),
    ...d.factures.map((f: Row) => ({ id: `fa${f.id}`, libelle: `Facture ${f.numero}`, pour: "Client", date: f.emise_le, lien: `/imprimer/${id}?doc=facture&f=${f.id}` })),
    ...data.rdvs
      .filter((r) => r.visite_statut === "signee" && r.visite_id)
      .map((r) => ({ id: `cr${r.visite_id}`, libelle: "Compte-rendu de visite signé", pour: "Client", date: r.debut, lien: `/api/visites/${r.visite_id}/compte-rendu`, nouvel: true })),
    ...data.visitesSansRdv
      .filter((v) => v.statut === "signee")
      .map((v) => ({ id: `cr${v.id}`, libelle: "Compte-rendu de visite signé", pour: "Client", date: v.signe_le, lien: `/api/visites/${v.id}/compte-rendu`, nouvel: true })),
  ];
  const courriers: Onglet = {
    cle: "courriers",
    libelle: "Courriers",
    compte: docs.length,
    colonnes: [{ libelle: "Document" }, { libelle: "Pour" }, { libelle: "Date" }],
    lignes: docs.map((x, i) => ({
      id: x.id,
      tri: ms(x.date) || i,
      cellules: [
        <span key="l" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Picto nom="document" taille={15} />
          <b>{x.libelle}</b>
        </span>,
        x.pour,
        jj(x.date),
      ],
      gestes: { imprimer: { lien: x.lien, nouvelOnglet: x.nouvel } },
    })),
    vide: null,
    gestes: {
      nouveau: off("Les courriers types se règlent dans « Courriers et SMS »."),
      modifier: off("Un document se modifie depuis sa ligne (devis, lettre de voiture, facture)."),
      copier: off("Sans objet pour un document."),
      supprimer: off("Sans objet pour un document."),
      signer: off("Sans objet pour un document."),
    },
  };

  // Documents : ceux de l'espace client, puis les photos de chantier.
  const documents: Onglet = {
    cle: "documents",
    libelle: "Documents",
    compte: data.documents.length,
    colonnes: [{ libelle: "Document" }, { libelle: "Source" }, { libelle: "Fichier" }, { libelle: "Déposé le" }],
    lignes: data.documents.map((x) => ({
      id: `doc${x.id}`,
      tri: ms(x.created_at),
      cellules: [
        <span key="l">
          <b>{x.libelle}</b>
          {x.piece && x.piece !== x.libelle && <small>{x.piece}</small>}
        </span>,
        <i key="s" className={`st ${x.source === "equipe" ? "p" : "i"}`}>
          {x.source === "equipe" ? "Équipe" : "Client"}
        </i>,
        <Long key="f">
          {x.nom_fichier}
          <small>{x.taille ? `${Math.max(1, Math.round(x.taille / 1024))} Ko` : ""}</small>
        </Long>,
        jj(x.created_at),
      ],
      gestes: { imprimer: { lien: x.lien, nouvelOnglet: true } },
    })),
    vide: data.espace ? (
      <>
        <b>Aucun document déposé</b>Les pièces du client et les documents de l’équipe arrivent par l’espace client.
      </>
    ) : (
      <>
        <b>Pas d’espace client</b>Les documents se déposent dans l’espace client : il n’est pas encore ouvert.
      </>
    ),
    gestes: {
      nouveau: data.espace ? { lien: `/dashboard/espace-client/dossiers/${data.espace.id}` } : { aller: { section: "commun", onglet: "espace" } },
      modifier: off("Un document se gère depuis la fiche de l'espace client."),
      copier: off("Sans objet pour un document."),
      supprimer: data.espace ? { lien: `/dashboard/espace-client/dossiers/${data.espace.id}` } : off("Pas d'espace client."),
      signer: off("Sans objet pour un document."),
    },
    libelles: { imprimer: "Ouvrir", supprimer: "Retirer" },
    apres: (
      <div className={s.imbrique}>
        {/* Outil terrain : les photos envoyées par les déménageurs (src/terrain). */}
        <GalerieChantier dossierId={id} />
      </div>
    ),
  };

  // Espace client : la carte de l'ancienne fiche.
  const espace: Onglet = {
    cle: "espace",
    libelle: "Espace client",
    compte: c.espaceOuvert ? 1 : 0,
    colonnes: [],
    lignes: [],
    vide: null,
    gestes: {
      nouveau: c.espaceOuvert
        ? off("L'espace client est déjà ouvert.")
        : off(c.aAjouter ? "Le dossier s'ajoute à son espace depuis le formulaire ci-dessous." : "L'espace s'ouvre depuis le formulaire ci-dessous."),
      imprimer: off("Sans objet ici."),
    },
    avant: (
      <div className={s.imbrique}>
        <EspaceClient d={d} commerciaux={c.utilisateurs.filter((u) => u.role === "commercial")} espace={c.sp.espace} message={c.sp.m} />
      </div>
    ),
  };

  // Historique : le journal d'activité du dossier.
  const historique: Onglet = {
    cle: "historique",
    libelle: "Historique",
    compte: data.activite.length,
    colonnes: [{ libelle: "Date" }, { libelle: "Par" }, { libelle: "Libellé" }],
    lignes: data.activite.map((a) => ({
      id: `a${a.id}`,
      tri: ms(a.cree_le) * 1000 + (a.id % 1000),
      cellules: [jjhh(a.cree_le), <span key="p" title={a.nom ?? undefined}>{a.initiales ?? "—"}</span>, <Long key="l" titre={a.libelle}>{a.libelle}</Long>],
    })),
    vide: <b>Aucune activité.</b>,
    gestes: { nouveau: lectureSeule, modifier: lectureSeule, imprimer: lectureSeule, copier: lectureSeule, supprimer: lectureSeule, signer: lectureSeule },
  };

  return {
    cle: "commun",
    titre: "Commun",
    picto: "commun",
    resume: "Règlements, factures, contacts, messages, documents et espace client",
    outils: [O.nouveau, O.modifier, O.imprimer, O.copier, O.supprimer, O.signer],
    onglets: [reglements, factures, contacts, envois, courriers, documents, espace, historique],
    ongletParDefaut: "reglements",
    ouverteParDefaut: true,
  };
}
