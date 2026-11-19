"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import {
  ajouterDevis, ajouterFacture, changerStatutDevis, envoyerAcces, marquerFacturePayee, marquerRealise,
  modifierClient, modifierConteneur, modifierDossier, revoquerSessions,
} from "@/lib/actions/espace-client-equipe";
import { MODELES_MESSAGE, STATUT_DOSSIER, STATUT_LIVRAISON, STATUT_SAV, TYPE_FACTURE } from "@/lib/espace-client/libelles";
import type { StatutDevis } from "@/lib/espace-client/types";
import { LISTE_SEGMENTS } from "@/lib/espace-client/segments";
import ActionsBandeau from "@/ui/ActionsBandeau";
import ChampAdresse from "@/ui/ChampAdresse";
import { Icone } from "@/ui/icones";
import EnTeteSection from "../../EnTeteSection";
import { BandeauMode, Champ, Retour, champ, useAction, usePorte, zoneTexte } from "./socle";
import { Avancement } from "./suivi/Avancement";
import { MenuAncres, type Ancre } from "./suivi/MenuAncres";
import { appareilDe, euros, jourCourt, jourHeure, nomAffiche, periodeCourte, RUBRIQUES, type Apercable, type DonneesFiche } from "./suivi/outils";
import { PiecesJointes } from "./suivi/PiecesJointes";
import { Reponses } from "./suivi/Reponses";
import { Visionneuse } from "./suivi/Visionneuse";
import s from "./suivi/suivi.module.css";

type Ouvrir = (id: string) => void;

/** Les liens signés durent cinq minutes : la fiche se relit toutes les quatre, sans clignoter. */
const RELECTURE_MS = 4 * 60 * 1000;

/**
 * La fiche d'un espace client, vue de l'équipe : une longue page, ses
 * rubriques dans le menu de gauche (Avancement, Pièces jointes, Réponses,
 * Devis et factures, Cartons et SAV, Messages, Client). En haut, où en est le
 * dossier et ce qui manque ; puis tout ce que le client a déposé et rempli,
 * à voir et à télécharger ; les réglages tout en bas, repliés.
 */
export function Fiche({ id, ouvrirApercu }: { id: string; ouvrirApercu: Ouvrir }) {
  const porte = usePorte();
  const { donnees, erreur, recharger } = useRessource<DonneesFiche>(`${porte.base}/dossier/${id}`);
  const cree = useSearchParams().get("cree");
  const action = useAction(recharger);
  // Le droit de super admin, pour proposer « Modifier son espace » (la route d'ouverture le revérifie côté serveur).
  const { donnees: droits } = useRessource<{ superAdmin: boolean }>(porte.demo ? null : "/api/data/droits");
  const [edition, setEdition] = useState<"client" | "dossier" | "conteneur" | null>(null);

  useEffect(() => {
    const t = setInterval(recharger, RELECTURE_MS);
    return () => clearInterval(t);
  }, [recharger]);

  const d = donnees;
  const ancres: Ancre[] = RUBRIQUES.map((r) => ({
    ...r,
    nombre: !d ? undefined : r.id === "avancement" ? d.suivi.points.filter((p) => p.etat === "bloquant" || p.etat === "a_faire").length : r.id === "pieces" ? d.suivi.pieces.manquantes.length || d.fichiers.length : undefined,
    ton: d && ((r.id === "avancement" && d.suivi.points.some((p) => p.etat === "bloquant")) || (r.id === "pieces" && d.suivi.pieces.manquantes.length > 0)) ? "alerte" : undefined,
  }));
  const menu = <MenuAncres titre="Ce dossier" ancres={ancres} retour={{ href: porte.racine, label: "Tous les espaces" }} />;

  if (erreur)
    return (
      <div>
        <EnTeteSection propre surtitre="Espace client" titre="Dossier client" menu={menu} />
        <Echec message={erreur} onRetry={recharger} />
      </div>
    );
  if (!d)
    return (
      <div>
        <EnTeteSection propre surtitre="Espace client" titre="Dossier client" texte="Chargement du dossier…" menu={menu} />
        <Squelette lignes={10} />
      </div>
    );

  const { dossier, client } = d;
  const termine = dossier.statut === "termine";
  const derniere = d.connexions[0];
  const aller = (rubrique: string) => {
    const el = document.getElementById(rubrique);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 184, behavior: "smooth" });
  };
  const lienAcces = () =>
    confirm(`Envoyer un nouveau lien d'accès à ${nomAffiche(client)} ?\n\nUn e-mail à ${client.email}, avec un lien de connexion à son espace.`) &&
    action.lancer(() => envoyerAcces(id), (r) => r.ok && r.apercu && ouvrirApercu(r.apercu));

  return (
    <div className={s.fiche}>
      <EnTeteSection
        propre
        surtitre="Espace client"
        titre={nomAffiche(client)}
        texte={
          <>
            {d.crm != null && !porte.demo ? (
              <Link href={`/dossiers/${d.crm}`} className={s.puceRef} title="Ouvrir le dossier dans le CRM" prefetch={false}>
                {dossier.reference}
                <Icone nom="externe" taille={12} />
              </Link>
            ) : (
              <span className={s.puceRef}>{dossier.reference}</span>
            )}
            {dossier.ville_depart} → {dossier.ville_arrivee} · {periodeCourte(dossier.periode_debut, dossier.periode_fin)}
          </>
        }
        etiquettes={[
          d.segment.libelle,
          STATUT_DOSSIER[dossier.statut],
          derniere ? `Vu le ${jourCourt(derniere.le)}` : !porte.demo && "Jamais connecté",
          (client.masquer_devis || client.masquer_factures) && `${[client.masquer_devis && "Devis", client.masquer_factures && "factures"].filter(Boolean).join(" et ")} masqués`,
        ]}
        menu={menu}
      >
        <ActionsBandeau
          principale={
            porte.demo
              ? { label: "Envoyer le lien d'accès", icone: "envoyer", onClick: lienAcces, disabled: action.enCours }
              : // L'espace tel que le client le voit, en lecture seule. Un <a> et jamais un <Link> : un préchargement noterait une ouverture.
                { label: "Ouvrir l'espace", icone: "oeil", href: `/espace-client-apercu/${id}`, nouvelOnglet: true, titre: "L'espace tel que le client le voit, en lecture seule" }
          }
          variantes={
            !porte.demo && droits?.superAdmin
              ? [
                  { label: "Voir comme le client", aide: "En lecture seule : rien ne change pour lui", icone: "oeil", href: `/espace-client-apercu/${id}`, nouvelOnglet: true },
                  { label: "Modifier son espace", aide: "En édition, au nom du client : chaque geste est noté à votre nom", icone: "crayon", href: `/espace-client-apercu/${id}?mode=edition`, nouvelOnglet: true },
                ]
              : undefined
          }
          icones={[!!d.archive && { label: "Tout télécharger (ZIP)", titre: "Toutes les pièces jointes du dossier, en une archive ZIP", icone: "telecharger", href: d.archive, telecharger: true }]}
          plus={[
            !porte.demo && { label: "Envoyer le lien d'accès", aide: `Un e-mail à ${client.email}, pour entrer dans son espace`, icone: "envoyer", onClick: lienAcces, disabled: action.enCours },
            d.crm != null && !porte.demo && { label: "Ouvrir le dossier du CRM", aide: `${dossier.reference} · devis, factures, planning`, icone: "dossierClient", href: `/dossiers/${d.crm}` },
            {
              label: "Modifier le client",
              aide: "Coordonnées, conseiller, segment",
              icone: "crayon",
              onClick: () => {
                setEdition("client");
                setTimeout(() => aller("client"), 30);
              },
            },
            "-",
            {
              label: "Couper les sessions",
              aide: "Le client devra demander un nouveau lien",
              icone: "connexion",
              danger: true,
              disabled: action.enCours,
              onClick: () => confirm("Couper toutes les sessions ouvertes de ce client ? Il devra demander un nouveau lien d'accès.") && action.lancer(() => revoquerSessions(id)),
            },
            !termine && {
              label: "Fin de chantier signée",
              aide: "Le dossier passe à « terminé » ; la demande d'avis part au client",
              icone: "commande",
              disabled: action.enCours,
              onClick: () => confirm("Marquer le déménagement comme réalisé ? La demande d'avis partira au client.") && action.lancer(() => marquerRealise(id)),
            },
          ]}
        />
      </EnTeteSection>

      <BandeauMode mode={d.mode} />
      {cree && !action.resultat && <p className={s.flash}>Dossier créé : l&apos;espace du client est prêt.</p>}
      <Retour r={action.resultat} apercu={ouvrirApercu} />

      <Avancement d={d} recharger={recharger} lien={(r) => `#${r}`} />

      <Section id="pieces" titre="Pièces jointes" sous={`${d.fichiers.length} fichier${d.fichiers.length > 1 ? "s" : ""} · à voir dans la page, à télécharger un par un ou tous ensemble`}>
        <PiecesJointes d={d} recharger={recharger} />
      </Section>

      <Section id="reponses" titre="Réponses du client" sous="Ce qu'il a rempli et certifié dans son espace">
        <Reponses d={d} />
      </Section>

      <Section
        id="devis"
        titre="Devis et factures"
        sous={d.crm != null ? "Établis dans le CRM, tels que le client les voit" : "Tels que le client les voit"}
        actions={
          d.crm != null &&
          !porte.demo && (
            <Link href={`/dossiers/${d.crm}`} className={s.boutonClair} prefetch={false}>
              Gérer dans le CRM
              <Icone nom="fleche" taille={15} />
            </Link>
          )
        }
      >
        <DevisFactures d={d} recharger={recharger} />
      </Section>

      <Section id="cartons" titre="Cartons et SAV" sous="Les cartons livrés avant le départ, les avaries déclarées après">
        <CartonsSav d={d} />
      </Section>

      <Section id="messages" titre="Messages et connexions" sous="Ce qui est parti au client, ce qu'il a écrit, et quand il est venu">
        <Messages d={d} ouvrirApercu={ouvrirApercu} />
      </Section>

      <Section id="client" titre="Client et réglages" sous="Coordonnées, segment et dossier : repliés, à ouvrir pour modifier">
        <ClientReglages d={d} recharger={recharger} edition={edition} setEdition={setEdition} />
      </Section>
    </div>
  );
}

function Section({ id, titre, sous, actions, children }: { id: string; titre: string; sous?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className={`${s.carte} ${s.section}`} aria-labelledby={`${id}-titre`}>
      <header className={s.sectionTete}>
        <div>
          <h2 id={`${id}-titre`}>{titre}</h2>
          {sous && <p>{sous}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

// --- Devis et factures ---------------------------------------------------------------------------------

const ETAT_DEVIS: Record<StatutDevis, { ton: string; texte: string }> = {
  envoye: { ton: "a_faire", texte: "À accepter" },
  accepte: { ton: "fait", texte: "Signé" },
  refuse: { ton: "neutre", texte: "Non retenu" },
  expire: { ton: "neutre", texte: "Expiré" },
};

/**
 * Les devis et les factures, en lignes : numéro, montant, état, aperçu et
 * téléchargement. Relié au CRM, ils s'y établissent ; sinon, l'équipe les
 * ajoute ici (formulaires repliés).
 */
function DevisFactures({ d, recharger }: { d: DonneesFiche; recharger: () => void }) {
  const action = useAction(recharger);
  const relie = d.crm != null;
  const [vue, setVue] = useState<{ liste: Apercable[]; i: number } | null>(null);
  const [nouveauDevis, setNouveauDevis] = useState(false);
  const [nouvelleFacture, setNouvelleFacture] = useState(false);
  const enJours = (n: number) => new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + n)).toISOString().slice(0, 10);
  const [devis, setDevis] = useState({ formule: d.dossier.formule, lignes: "", inclus: "", arrhes_pourcentage: d.client.type === "particulier" ? "30" : "0", valide_jusqu_au: enJours(30), statut: "envoye" });
  const [facture, setFacture] = useState({ type: "solde", libelle: `Solde du déménagement ${d.dossier.ville_depart} → ${d.dossier.ville_arrivee}`, montant_ttc: "", echeance: enJours(14), periode: "" });
  const erreurs = action.resultat && !action.resultat.ok ? (action.resultat.erreurs ?? {}) : {};

  const pdfs: Apercable[] = [
    ...d.devis.map((v) => ({ cle: `devis:${v.id}`, libelle: `Devis ${v.numero}`, nom: `devis-${v.numero}.pdf`, mime: "application/pdf", lien: v.lien, telecharger: v.telecharger, categorie: "Devis", le: v.emis_le })),
    ...d.factures.map((f) => ({ cle: `facture:${f.id}`, libelle: `${f.crm_paiement_id != null ? "Reçu" : "Facture"} ${f.numero}`, nom: `facture-${f.numero}.pdf`, mime: "application/pdf", lien: f.lien, telecharger: f.telecharger, categorie: TYPE_FACTURE[f.type], le: f.emise_le })),
  ];
  const ouvrir = (cle: string) => setVue({ liste: pdfs, i: pdfs.findIndex((p) => p.cle === cle) });
  const masques = [d.client.masquer_devis && "les devis", d.client.masquer_factures && "les factures"].filter(Boolean).join(" et ");

  const gestes = (cle: string, telecharger: string) => (
    <span className={s.ligneGestes}>
      <button type="button" className={s.lienDiscret} onClick={() => ouvrir(cle)}>
        <Icone nom="oeil" taille={15} />
        Aperçu
      </button>
      <a className={s.boutonIcone} href={telecharger} download title="Télécharger le PDF" aria-label="Télécharger le PDF">
        <Icone nom="telecharger" taille={16} />
      </a>
    </span>
  );

  return (
    <div className={s.devis}>
      {masques && <p className={s.note}>Pour ce client, {masques} ne s&apos;affichent pas dans son espace ({d.segment.cle === "militaire" ? d.segment.libelle : d.segment.libelle.toLowerCase()}). L&apos;équipe les voit ici.</p>}
      <div className={s.colonnesDocs}>
        <div>
          <h3 className={s.sousTitre}>Devis</h3>
          <ul className={s.lignes}>
            {d.devis.map((v) => (
              <li key={v.id} className={s.ligneDoc}>
                <span className={s.picto} data-type="pdf" data-genre="devis">
                  <Icone nom="devis" taille={16} />
                </span>
                <span className={s.ligneTexte}>
                  <b>{v.numero}</b>
                  <small>
                    {v.formule} · émis le {jourCourt(v.emis_le)}
                    {v.arrhes_pourcentage > 0 && ` · arrhes ${v.arrhes_pourcentage} %`}
                  </small>
                </span>
                <span className={s.montant}>{euros(v.montant_ttc)}</span>
                {relie ? (
                  <span className={s.etat} data-etat={ETAT_DEVIS[v.statut].ton}>
                    {ETAT_DEVIS[v.statut].texte}
                    {v.statut === "accepte" && v.accepte_le && ` le ${jourCourt(v.accepte_le)}`}
                  </span>
                ) : (
                  <select value={v.statut} onChange={(e) => action.lancer(() => changerStatutDevis(v.id, e.target.value as StatutDevis))} className={s.selectEtat} aria-label={`Statut du devis ${v.numero}`}>
                    <option value="envoye">Envoyé</option>
                    <option value="accepte">Accepté</option>
                    <option value="refuse">Non retenu</option>
                    <option value="expire">Expiré</option>
                  </select>
                )}
                {gestes(`devis:${v.id}`, v.telecharger)}
              </li>
            ))}
            {d.devis.length === 0 && (
              <li className={s.vide}>{d.client.type === "militaire" ? "Pas de devis : prise en charge par l'administration." : relie ? "Aucun devis envoyé depuis le CRM." : "Aucun devis : le client voit « devis en préparation »."}</li>
            )}
          </ul>
          {!relie && !d.client.masquer_devis && (
            <Repli ouvert={nouveauDevis} basculer={setNouveauDevis} label="Ajouter un devis">
              <div className={s.formulaire}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Champ label="Formule" erreur={erreurs.formule}>
                    <input className={champ} value={devis.formule} onChange={(e) => setDevis({ ...devis, formule: e.target.value })} />
                  </Champ>
                  <Champ label="Arrhes (%)" erreur={erreurs.arrhes_pourcentage}>
                    <input className={champ} inputMode="numeric" value={devis.arrhes_pourcentage} onChange={(e) => setDevis({ ...devis, arrhes_pourcentage: e.target.value })} />
                  </Champ>
                  <Champ label="Valable jusqu'au" erreur={erreurs.valide_jusqu_au}>
                    <input className={champ} type="date" value={devis.valide_jusqu_au} onChange={(e) => setDevis({ ...devis, valide_jusqu_au: e.target.value })} />
                  </Champ>
                </div>
                <Champ label="Prestations, une par ligne : « Libellé ; montant HT ; détail »" erreur={erreurs.lignes ?? Object.entries(erreurs).find(([k]) => k.startsWith("lignes."))?.[1]}>
                  <textarea className={zoneTexte} value={devis.lignes} onChange={(e) => setDevis({ ...devis, lignes: e.target.value })} placeholder={"Déménagement Paris → Lyon ; 2150 ; 32 m³, équipe de 4\nEmballage du fragile ; 290"} />
                </Champ>
                <Champ label="Ce que la formule comprend (séparé par des virgules)">
                  <input className={champ} value={devis.inclus} onChange={(e) => setDevis({ ...devis, inclus: e.target.value })} placeholder="Emballage du fragile, Démontage / remontage" />
                </Champ>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={`${champ} !w-auto`} value={devis.statut} onChange={(e) => setDevis({ ...devis, statut: e.target.value })} aria-label="Statut du nouveau devis">
                    <option value="envoye">À accepter par le client</option>
                    <option value="accepte">Déjà accepté</option>
                  </select>
                  <button type="button" className={s.boutonPlein} disabled={action.enCours} onClick={() => action.lancer(() => ajouterDevis(d.dossier.id, devis), (r) => r.ok && setNouveauDevis(false))}>
                    Ajouter le devis
                  </button>
                </div>
              </div>
            </Repli>
          )}
        </div>

        <div>
          <h3 className={s.sousTitre}>{relie ? "Factures et règlements" : "Factures"}</h3>
          <ul className={s.lignes}>
            {d.factures.map((f) => (
              <li key={f.id} className={s.ligneDoc}>
                <span className={s.picto} data-type="pdf" data-genre="facture">
                  <Icone nom="facture" taille={16} />
                </span>
                <span className={s.ligneTexte}>
                  <b>
                    {f.numero} · {f.crm_paiement_id != null ? "Règlement" : TYPE_FACTURE[f.type]}
                  </b>
                  <small>
                    {f.libelle} · {f.statut === "payee" ? `réglée le ${jourCourt(f.payee_le!)}` : relie ? `émise le ${jourCourt(f.emise_le)}` : `échéance ${jourCourt(f.echeance)}`}
                  </small>
                </span>
                <span className={s.montant}>{euros(f.montant_ttc)}</span>
                <span className={s.etat} data-etat={f.statut === "payee" ? "fait" : f.statut === "en_retard" ? "bloquant" : "a_faire"}>
                  {f.statut === "payee" ? "Payée" : f.statut === "en_retard" ? "En retard" : "À régler"}
                </span>
                {gestes(`facture:${f.id}`, f.telecharger)}
                {f.statut !== "payee" && (!relie || f.crm_facture_id != null) && (
                  <button
                    type="button"
                    className={s.lienDiscret}
                    data-plein=""
                    onClick={() => confirm(`Marquer cette facture comme réglée hors ligne (virement, chèque) ?${relie ? " Elle le sera aussi dans le CRM." : ""}`) && action.lancer(() => marquerFacturePayee(f.id))}
                  >
                    Réglée hors ligne
                  </button>
                )}
              </li>
            ))}
            {d.factures.length === 0 && <li className={s.vide}>{relie ? "Aucune facture ni aucun règlement au CRM." : "Aucune facture."}</li>}
          </ul>
          {!relie && !d.client.masquer_factures && (
            <Repli ouvert={nouvelleFacture} basculer={setNouvelleFacture} label="Émettre une facture">
              <div className={s.formulaire}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Champ label="Type">
                    <select className={champ} value={facture.type} onChange={(e) => setFacture({ ...facture, type: e.target.value })}>
                      <option value="solde">Solde</option>
                      <option value="arrhes">Arrhes</option>
                      <option value="garde_meubles">Garde-meubles</option>
                    </select>
                  </Champ>
                  <Champ label="Montant TTC (€)" erreur={erreurs.montant_ttc}>
                    <input className={champ} inputMode="decimal" value={facture.montant_ttc} onChange={(e) => setFacture({ ...facture, montant_ttc: e.target.value.replace(",", ".") })} />
                  </Champ>
                  <Champ label="Libellé" erreur={erreurs.libelle} className="sm:col-span-2">
                    <input className={champ} value={facture.libelle} onChange={(e) => setFacture({ ...facture, libelle: e.target.value })} />
                  </Champ>
                  <Champ label="Échéance" erreur={erreurs.echeance}>
                    <input className={champ} type="date" value={facture.echeance} onChange={(e) => setFacture({ ...facture, echeance: e.target.value })} />
                  </Champ>
                  {facture.type === "garde_meubles" && (
                    <Champ label="Mois couvert (AAAA-MM)" erreur={erreurs.periode}>
                      <input className={champ} value={facture.periode} onChange={(e) => setFacture({ ...facture, periode: e.target.value })} placeholder="2026-12" />
                    </Champ>
                  )}
                </div>
                <button type="button" className={s.boutonPlein} disabled={action.enCours} onClick={() => action.lancer(() => ajouterFacture(d.dossier.id, facture), (r) => r.ok && setNouvelleFacture(false))}>
                  Émettre la facture
                </button>
              </div>
            </Repli>
          )}
        </div>
      </div>
      <Retour r={action.resultat} />
      {vue && vue.i >= 0 && <Visionneuse fichiers={vue.liste} index={vue.i} changer={(i) => setVue((v) => (v ? { ...v, i } : v))} fermer={() => setVue(null)} />}
    </div>
  );
}

/** Un bloc replié derrière un bouton : les formulaires ne prennent pas la page. */
function Repli({ ouvert, basculer, label, children }: { ouvert: boolean; basculer: (v: boolean) => void; label: string; children: React.ReactNode }) {
  return ouvert ? (
    <div className={s.repli}>
      <div className={s.repliTete}>
        <b>{label}</b>
        <button type="button" className={s.lienDiscret} onClick={() => basculer(false)}>
          Annuler
        </button>
      </div>
      {children}
    </div>
  ) : (
    <button type="button" className={s.ajout} onClick={() => basculer(true)}>
      <Icone nom="plus" taille={15} />
      {label}
    </button>
  );
}

// --- Cartons et SAV ------------------------------------------------------------------------------------

function CartonsSav({ d }: { d: DonneesFiche }) {
  const { racine } = usePorte();
  const [vue, setVue] = useState<{ liste: Apercable[]; i: number } | null>(null);
  return (
    <div className={s.deuxColonnes}>
      <div className={s.panneauDoux}>
        <div className={s.panneauTete}>
          <h3>
            <Icone nom="caisse" taille={16} />
            Cartons
          </h3>
          <Link href={`${racine}/cartons`} className={s.lienFort} prefetch={false}>
            Cartons du samedi
            <Icone nom="fleche" taille={14} />
          </Link>
        </div>
        {d.livraisons.length ? (
          <ul className={s.cartons}>
            {d.livraisons.map((l) => (
              <li key={l.id}>
                <div className={s.cartonsTete}>
                  <Link href={`${racine}/cartons?samedi=${l.date_samedi}`} prefetch={false}>
                    Samedi {jourCourt(l.date_samedi)}
                  </Link>
                  <span className={s.etat} data-etat={STATUT_LIVRAISON[l.statut].ton === "ok" ? "fait" : STATUT_LIVRAISON[l.statut].ton === "todo" ? "a_faire" : "neutre"}>
                    {STATUT_LIVRAISON[l.statut].label}
                  </span>
                </div>
                <dl className={s.mini}>
                  <div>
                    <dt>Cartons</dt>
                    <dd>{l.nb_cartons ?? "À saisir"}</dd>
                  </div>
                  <div>
                    <dt>Créneau</dt>
                    <dd>{l.creneau_debut ? `${l.creneau_debut} – ${l.creneau_fin}` : "Pas encore fixé"}</dd>
                  </div>
                  <div data-large="">
                    <dt>Adresse</dt>
                    <dd>
                      {l.adresse}
                      {l.complement && `, ${l.complement}`}
                      {l.code_acces && <small>Code : {l.code_acces}</small>}
                    </dd>
                  </div>
                  <div data-large="">
                    <dt>Contact sur place</dt>
                    <dd>
                      {l.contact_nom} · {l.contact_tel}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.vide}>{d.dossier.cartons_non_necessaires ? "Le client n'a pas besoin de cartons." : "Pas encore de samedi choisi : le client le choisit dans son espace."}</p>
        )}
      </div>

      <div className={s.panneauDoux}>
        <div className={s.panneauTete}>
          <h3>
            <Icone nom="litige" taille={16} />
            SAV
          </h3>
          <Link href={`${racine}/sav`} className={s.lienFort} prefetch={false}>
            Toutes les déclarations
            <Icone nom="fleche" taille={14} />
          </Link>
        </div>
        {d.sav.length ? (
          <ul className={s.cartons}>
            {d.sav.map((x) => {
              const photos: Apercable[] = x.photos.map((p) => ({ cle: p.id, libelle: `Avarie ${x.numero}`, nom: p.nom, mime: p.mime, lien: p.lien, telecharger: p.telecharger, categorie: `SAV · ${x.numero}`, le: x.created_at, taille: p.taille }));
              return (
                <li key={x.id}>
                  <div className={s.cartonsTete}>
                    <b>
                      {x.numero} · {x.objets}
                    </b>
                    <span className={s.etat} data-etat={x.statut === "cloturee" ? "fait" : x.statut === "en_analyse" ? "a_faire" : "bloquant"}>
                      {STATUT_SAV[x.statut].label}
                    </span>
                  </div>
                  <p className={s.savTexte}>{x.description}</p>
                  <p className={s.savMeta}>
                    Constat du {jourCourt(x.date_constat)} · déclarée le {jourCourt(x.created_at)} · {x.reserves_emises ? "réserves émises à la livraison" : "sans réserves à la livraison"}
                  </p>
                  {photos.length > 0 && (
                    <ul className={s.photosMini}>
                      {photos.map((p, i) => (
                        <li key={p.cle}>
                          <button type="button" onClick={() => setVue({ liste: photos, i })} aria-label={`Voir ${p.nom}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- adresse signée qui redirige vers le stockage */}
                            <img src={p.lien} alt="" loading="lazy" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={s.vide}>Aucune déclaration d&apos;avarie. Le SAV s&apos;ouvre au client une fois la livraison passée.</p>
        )}
        {d.dossier.avis_demande_le && (
          <p className={s.savMeta}>
            <Icone nom="etoile" taille={13} /> Demande d&apos;avis partie le {jourHeure(d.dossier.avis_demande_le)}.
          </p>
        )}
      </div>
      {vue && <Visionneuse fichiers={vue.liste} index={vue.i} changer={(i) => setVue((v) => (v ? { ...v, i } : v))} fermer={() => setVue(null)} />}
    </div>
  );
}

// --- Messages et connexions ---------------------------------------------------------------------------

const STATUT_MESSAGE: Record<string, { ton: string; texte: string }> = {
  journalisee: { ton: "neutre", texte: "Journalisé" },
  envoyee: { ton: "fait", texte: "Envoyé" },
  echec: { ton: "bloquant", texte: "Échec" },
};

const ETAT_CONNEXION = { ouverte: "Ouverte", fermee: "Fermée", expiree: "Expirée" } as const;

function Messages({ d, ouvrirApercu }: { d: DonneesFiche; ouvrirApercu: Ouvrir }) {
  return (
    <div className={s.messages}>
      <div>
        <h3 className={s.sousTitre}>Journal des messages · {d.notifications.length}</h3>
        {d.notifications.length ? (
          <ol className={s.fil}>
            {d.notifications.map((n) => {
              const duClient = n.modele === "message_conseiller";
              const texte = duClient && typeof n.payload.message === "string" ? n.payload.message : null;
              const st = STATUT_MESSAGE[n.statut] ?? { ton: "neutre", texte: n.statut };
              return (
                <li key={n.id} className={s.filItem} data-client={duClient ? "" : undefined}>
                  <span className={s.filPicto} data-canal={n.canal}>
                    <Icone nom={n.canal === "sms" ? "sms" : duClient ? "clients" : "courrier"} taille={15} />
                  </span>
                  <div className={s.filCorps}>
                    <div className={s.filTete}>
                      <button type="button" onClick={() => ouvrirApercu(n.id)} className={s.filTitre}>
                        {duClient ? "Message du client à son conseiller" : (MODELES_MESSAGE[n.modele] ?? n.modele)}
                        {n.canal === "sms" && <em>SMS</em>}
                      </button>
                      <span className={s.etat} data-etat={st.ton}>
                        {st.texte}
                      </span>
                    </div>
                    <p className={s.filMeta}>
                      {jourHeure(n.sent_at)} · {duClient ? `de ${d.client.email}` : `à ${n.destinataire}`}
                    </p>
                    {texte && <blockquote className={s.bulle}>{texte}</blockquote>}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={s.vide}>Aucun message pour l&apos;instant.</p>
        )}
      </div>
      <div>
        <h3 className={s.sousTitre}>Connexions du client</h3>
        {d.connexions.length ? (
          <ul className={s.connexions}>
            {d.connexions.map((c) => {
              const etat = ETAT_CONNEXION[c.etat];
              return (
                <li key={c.le}>
                  <span className={s.filPicto}>
                    <Icone nom="appareil" taille={15} />
                  </span>
                  <span className={s.ligneTexte}>
                    <b>{jourHeure(c.le)}</b>
                    <small>
                      {appareilDe(c.appareil)}
                      {c.ip && ` · IP ${c.ip}`}
                    </small>
                  </span>
                  <span className={s.etat} data-etat={etat === "Ouverte" ? "fait" : "neutre"}>
                    {etat}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={s.vide}>Le client ne s&apos;est pas encore connecté : il entre par le lien d&apos;accès reçu par e-mail.</p>
        )}
      </div>
    </div>
  );
}

// --- Client et réglages --------------------------------------------------------------------------------

function ClientReglages({
  d,
  recharger,
  edition,
  setEdition,
}: {
  d: DonneesFiche;
  recharger: () => void;
  edition: "client" | "dossier" | "conteneur" | null;
  setEdition: (e: "client" | "dossier" | "conteneur" | null) => void;
}) {
  const { demo } = usePorte();
  const c = d.client;
  const x = d.dossier;
  const relie = d.crm != null;
  const lus = (lignes: [string, React.ReactNode][]) => (
    <dl className={s.definitions} data-ligne="">
      {lignes.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
  const basculer = (e: "client" | "dossier" | "conteneur") => (
    <button type="button" className={s.boutonClair} onClick={() => setEdition(edition === e ? null : e)} aria-expanded={edition === e}>
      <Icone nom={edition === e ? "fermer" : "crayon"} taille={15} />
      {edition === e ? "Fermer" : "Modifier"}
    </button>
  );

  return (
    <div className={s.deuxColonnes}>
      <div className={s.panneauDoux}>
        <div className={s.panneauTete}>
          <h3>
            <Icone nom="equipe" taille={16} />
            Le client
          </h3>
          {basculer("client")}
        </div>
        {edition === "client" ? (
          <ReglagesClient d={d} recharger={recharger} />
        ) : (
          <>
            {lus([
              ["Nom", [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ")],
              ...(c.societe ? ([["Société", c.societe]] as [string, string][]) : []),
              ["E-mail", c.email],
              ["Téléphone", c.telephone || "—"],
              ["Conseiller", `${d.conseiller.prenom} ${d.conseiller.nom}`.trim()],
              ["Segment", d.segment.libelle],
              ...(c.masquer_devis || c.masquer_factures ? ([["Masqués", [c.masquer_devis && "Devis", c.masquer_factures && "Factures"].filter(Boolean).join(", ")]] as [string, string][]) : []),
            ])}
            <ul className={s.regles}>
              {d.segment.regles.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className={s.panneauDoux}>
        <div className={s.panneauTete}>
          <h3>
            <Icone nom="dossierClient" taille={16} />
            Le dossier
          </h3>
          {basculer("dossier")}
        </div>
        {edition === "dossier" ? (
          relie ? (
            <InfosDossierLie d={d} recharger={recharger} />
          ) : (
            <InfosDossier d={d} recharger={recharger} />
          )
        ) : (
          <>
            {lus([
              ["Départ", x.adresse_depart || x.ville_depart],
              ["Arrivée", x.adresse_arrivee || x.ville_arrivee],
              ["Période", x.periode_debut === x.periode_fin ? jourCourt(x.periode_debut) : periodeCourte(x.periode_debut, x.periode_fin)],
              ["Volume", `${x.volume_m3} m³${x.logement ? ` · ${x.logement}` : ""}`],
              ["Formule", x.formule],
              ["Statut", STATUT_DOSSIER[x.statut]],
              ["Portée", x.portee === "international" ? `International · ${d.pays[x.pays_destination] ?? x.pays_destination} · ${x.mode_transport === "maritime" ? "maritime" : x.mode_transport === "aerien" ? "aérien" : "route"}` : "National"],
              ...(x.bailleur_nom ? ([["Bailleur", `${x.bailleur_nom}${x.bailleur_email ? ` · ${x.bailleur_email}` : ""}`]] as [string, string][]) : []),
            ])}
            {relie && !demo && <p className={s.note}>Trajet, dates, volume, formule et statut viennent du CRM : ils se modifient dans la fiche du dossier, et l&apos;espace suit.</p>}
          </>
        )}
      </div>

      {d.suiviConteneur && (
        <div className={s.panneauDoux} data-large="">
          <div className={s.panneauTete}>
            <h3>
              <Icone nom="bateau" taille={16} />
              Suivi du conteneur
            </h3>
            {basculer("conteneur")}
          </div>
          {edition === "conteneur" ? (
            <SuiviConteneur d={d} recharger={recharger} />
          ) : (
            lus([
              ["Compagnie", x.compagnie || "—"],
              ["Conteneur", x.numero_conteneur || "—"],
              ["Navire ou vol", x.navire || "—"],
              ["Ports", x.port_depart || x.port_arrivee ? `${x.port_depart || "?"} → ${x.port_arrivee || "?"}` : "—"],
              ["Arrivée prévue", x.eta ? jourCourt(x.eta) : "—"],
              ["Statut affiché", x.statut_conteneur || "—"],
            ])
          )}
        </div>
      )}
    </div>
  );
}

function ReglagesClient({ d, recharger }: { d: DonneesFiche; recharger: () => void }) {
  const action = useAction(recharger);
  const c = d.client;
  const [v, setV] = useState({ civilite: c.civilite ?? "", prenom: c.prenom, nom: c.nom, email: c.email, telephone: c.telephone, type: c.type as string, societe: c.societe ?? "", masquer_devis: c.masquer_devis, masquer_factures: c.masquer_factures, conseiller_id: c.conseiller_id });
  const erreurs = action.resultat && !action.resultat.ok ? (action.resultat.erreurs ?? {}) : {};
  return (
    <div className={s.formulaire}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ label="Prénom" erreur={erreurs.prenom}>
          <input className={champ} value={v.prenom} onChange={(e) => setV({ ...v, prenom: e.target.value })} />
        </Champ>
        <Champ label="Nom" erreur={erreurs.nom}>
          <input className={champ} value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} />
        </Champ>
        <Champ label="E-mail" erreur={erreurs.email} className="sm:col-span-2">
          <input className={champ} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Champ>
        <Champ label="Téléphone" erreur={erreurs.telephone}>
          <input className={champ} value={v.telephone} onChange={(e) => setV({ ...v, telephone: e.target.value })} />
        </Champ>
        <Champ label="Conseiller">
          <select className={champ} value={v.conseiller_id} onChange={(e) => setV({ ...v, conseiller_id: e.target.value })}>
            {d.conseillers.map((k) => (
              <option key={k.id} value={k.id}>
                {k.prenom} {k.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Segment" className="sm:col-span-2">
          <div className="grid grid-cols-2 gap-2">
            {LISTE_SEGMENTS.map((x) => (
              <button key={x.cle} type="button" onClick={() => setV({ ...v, type: x.cle })} className={s.segment} aria-pressed={v.type === x.cle}>
                {x.libelle}
              </button>
            ))}
          </div>
        </Champ>
        {v.type === "militaire" && <p className="text-[11.5px] text-ink-soft sm:col-span-2">CIMOB/DICOM : devis et factures toujours masqués, pas d&apos;arrhes en ligne (prise en charge par l&apos;administration).</p>}
        {d.crm != null && <p className="text-[11.5px] text-ink-soft sm:col-span-2">Relié au CRM : coordonnées et segment s&apos;y enregistrent aussi.</p>}
        {v.type === "grand_compte" && (
          <>
            <Champ label="Société" className="sm:col-span-2">
              <input className={champ} value={v.societe} onChange={(e) => setV({ ...v, societe: e.target.value })} />
            </Champ>
            {(
              [
                ["masquer_devis", "Masquer les devis"],
                ["masquer_factures", "Masquer les factures"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-3 py-2 text-[13px] font-medium">
                {l}
                <input type="checkbox" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
              </label>
            ))}
            <p className="text-[11.5px] text-ink-soft sm:col-span-2">Une rubrique masquée disparaît de l&apos;espace du client et de sa frise.</p>
          </>
        )}
      </div>
      <button type="button" className={s.boutonPlein} disabled={action.enCours} onClick={() => action.lancer(() => modifierClient(d.dossier.id, v))}>
        Enregistrer le client
      </button>
      <Retour r={action.resultat} />
    </div>
  );
}

function InfosDossier({ d, recharger }: { d: DonneesFiche; recharger: () => void }) {
  const action = useAction(recharger);
  const x = d.dossier;
  const [v, setV] = useState({ ville_depart: x.ville_depart, ville_arrivee: x.ville_arrivee, adresse_depart: x.adresse_depart, adresse_arrivee: x.adresse_arrivee, periode_debut: x.periode_debut, periode_fin: x.periode_fin, portee: x.portee as string, mode_transport: x.mode_transport as string, pays_destination: x.pays_destination, statut: x.statut as string, volume_m3: String(x.volume_m3), formule: x.formule, logement: x.logement ?? "", photo: x.photo, request_id: x.request_id ?? "" });
  const erreurs = action.resultat && !action.resultat.ok ? (action.resultat.erreurs ?? {}) : {};
  const champs: [keyof typeof v, string, string?][] = [
    ["ville_depart", "Ville de départ"],
    ["ville_arrivee", "Ville d'arrivée"],
    ["adresse_depart", "Adresse de départ"],
    ["adresse_arrivee", "Adresse d'arrivée"],
    ["periode_debut", "Premier jour", "date"],
    ["periode_fin", "Dernier jour", "date"],
    ["volume_m3", "Volume (m³)"],
    ["formule", "Formule"],
    ["logement", "Logement"],
  ];
  return (
    <div className={s.formulaire}>
      <div className="grid gap-3 sm:grid-cols-2">
        {champs.map(([k, l, type]) => (
          <Champ key={k} label={l} erreur={erreurs[k]}>
            {k === "ville_depart" || k === "ville_arrivee" ? (
              <ChampAdresse mode="ville" className={champ} value={v[k]} onChange={(y) => setV((z) => ({ ...z, [k]: y }))} />
            ) : k === "adresse_depart" || k === "adresse_arrivee" ? (
              // Une adresse choisie dans la liste donne aussi sa ville.
              <ChampAdresse
                className={champ}
                value={v[k]}
                onChange={(y) => setV((z) => ({ ...z, [k]: y }))}
                onChoisir={(a) => setV((z) => ({ ...z, [k === "adresse_depart" ? "ville_depart" : "ville_arrivee"]: a.ville }))}
              />
            ) : (
              <input className={champ} type={type ?? "text"} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            )}
          </Champ>
        ))}
        <Champ label="Statut">
          <select className={champ} value={v.statut} onChange={(e) => setV({ ...v, statut: e.target.value })}>
            {Object.entries(STATUT_DOSSIER).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Portée">
          <select className={champ} value={v.portee} onChange={(e) => setV({ ...v, portee: e.target.value, ...(e.target.value === "national" ? { pays_destination: "FR", mode_transport: "route" } : {}) })}>
            <option value="national">National</option>
            <option value="international">International</option>
          </select>
        </Champ>
        {v.portee === "international" && (
          <>
            <Champ label="Pays" erreur={erreurs.pays_destination}>
              <select className={champ} value={v.pays_destination} onChange={(e) => setV({ ...v, pays_destination: e.target.value })}>
                {Object.entries(d.pays).map(([code, nom]) => (
                  <option key={code} value={code}>
                    {nom}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="Transport">
              <select className={champ} value={v.mode_transport} onChange={(e) => setV({ ...v, mode_transport: e.target.value })}>
                <option value="route">Route</option>
                <option value="maritime">Maritime</option>
                <option value="aerien">Aérien</option>
              </select>
            </Champ>
          </>
        )}
        <Champ label="Photo de la page de garde" className="sm:col-span-2">
          <select className={champ} value={v.photo} onChange={(e) => setV({ ...v, photo: e.target.value })}>
            {d.photos.map((p) => (
              <option key={p.chemin} value={p.chemin}>
                {p.libelle}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <button type="button" className={s.boutonPlein} disabled={action.enCours} onClick={() => action.lancer(() => modifierDossier(d.dossier.id, v))}>
        Enregistrer le dossier
      </button>
      <Retour r={action.resultat} />
    </div>
  );
}

/**
 * Le dossier d'un espace relié au CRM : le trajet, la période, le volume, la
 * formule et le statut viennent du CRM. L'espace règle ce qui lui est
 * propre : le pays et le transport d'un déménagement international, le
 * logement, la photo, le bailleur d'un logement social.
 */
function InfosDossierLie({ d, recharger }: { d: DonneesFiche; recharger: () => void }) {
  const action = useAction(recharger);
  const { demo } = usePorte();
  const x = d.dossier;
  const [v, setV] = useState({ pays_destination: x.pays_destination, mode_transport: x.mode_transport as string, logement: x.logement ?? "", photo: x.photo, bailleur_nom: x.bailleur_nom ?? "", bailleur_email: x.bailleur_email ?? "" });
  const erreurs = action.resultat && !action.resultat.ok ? (action.resultat.erreurs ?? {}) : {};
  const international = x.portee === "international";
  return (
    <div className={s.formulaire}>
      {!demo && d.crm != null && (
        <p className={s.note}>
          Trajet, dates, volume, formule et statut se modifient dans{" "}
          <Link href={`/dossiers/${d.crm}`} prefetch={false}>
            la fiche du dossier du CRM
          </Link>
          . Ici : ce qui est propre à l&apos;espace.
        </p>
      )}
      {international && x.pays_destination === "FR" && <p className={s.erreur}>Pays de destination à préciser : il fixe les pièces que la douane demande.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {international && (
          <>
            <Champ label="Pays de destination" erreur={erreurs.pays_destination}>
              <select className={champ} value={v.pays_destination} onChange={(e) => setV({ ...v, pays_destination: e.target.value })}>
                {Object.entries(d.pays).map(([code, nom]) => (
                  <option key={code} value={code}>
                    {nom}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="Transport">
              <select className={champ} value={v.mode_transport} onChange={(e) => setV({ ...v, mode_transport: e.target.value })}>
                <option value="route">Route</option>
                <option value="maritime">Maritime</option>
                <option value="aerien">Aérien</option>
              </select>
            </Champ>
          </>
        )}
        <Champ label="Logement" erreur={erreurs.logement} aide="Affiché à côté du volume (« T3 · 68 m² »).">
          <input className={champ} value={v.logement} onChange={(e) => setV({ ...v, logement: e.target.value })} />
        </Champ>
        <Champ label="Photo de la page de garde">
          <select className={champ} value={v.photo} onChange={(e) => setV({ ...v, photo: e.target.value })}>
            {d.photos.map((p) => (
              <option key={p.chemin} value={p.chemin}>
                {p.libelle}
              </option>
            ))}
          </select>
        </Champ>
        {d.client.type === "logement_social" && (
          <>
            <Champ label="Bailleur" erreur={erreurs.bailleur_nom}>
              <input className={champ} value={v.bailleur_nom} onChange={(e) => setV({ ...v, bailleur_nom: e.target.value })} placeholder="Nom du bailleur" />
            </Champ>
            <Champ label="E-mail du bailleur (SAV)" erreur={erreurs.bailleur_email} aide="Prévenu de chaque déclaration d'avarie.">
              <input className={champ} type="email" value={v.bailleur_email} onChange={(e) => setV({ ...v, bailleur_email: e.target.value })} />
            </Champ>
          </>
        )}
      </div>
      <button type="button" className={s.boutonPlein} disabled={action.enCours} onClick={() => action.lancer(() => modifierDossier(d.dossier.id, v))}>
        Enregistrer
      </button>
      <Retour r={action.resultat} />
    </div>
  );
}

function SuiviConteneur({ d, recharger }: { d: DonneesFiche; recharger: () => void }) {
  const action = useAction(recharger);
  const x = d.dossier;
  const [v, setV] = useState({ compagnie: x.compagnie ?? "", numero_conteneur: x.numero_conteneur ?? "", url_tracking: x.url_tracking ?? "", statut_conteneur: x.statut_conteneur ?? "", navire: x.navire ?? "", port_depart: x.port_depart ?? "", port_arrivee: x.port_arrivee ?? "", eta: x.eta ?? "" });
  const erreurs = action.resultat && !action.resultat.ok ? (action.resultat.erreurs ?? {}) : {};
  const champs: [keyof typeof v, string, string?][] = [
    ["compagnie", "Compagnie"],
    ["numero_conteneur", "N° de conteneur"],
    ["navire", "Navire ou vol"],
    ["eta", "Arrivée prévue", "date"],
    ["port_depart", "Port de départ"],
    ["port_arrivee", "Port d'arrivée"],
  ];
  return (
    <div className={s.formulaire}>
      <div className="grid gap-3 sm:grid-cols-2">
        {champs.map(([k, l, type]) => (
          <Champ key={k} label={l} erreur={erreurs[k]}>
            <input className={champ} type={type ?? "text"} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </Champ>
        ))}
        <Champ label="Lien de suivi de la compagnie" erreur={erreurs.url_tracking} className="sm:col-span-2">
          <input className={champ} value={v.url_tracking} onChange={(e) => setV({ ...v, url_tracking: e.target.value })} placeholder="https://…" />
        </Champ>
        <Champ label="Statut affiché au client" className="sm:col-span-2">
          <input className={champ} value={v.statut_conteneur} onChange={(e) => setV({ ...v, statut_conteneur: e.target.value })} />
        </Champ>
      </div>
      <button type="button" className={s.boutonPlein} disabled={action.enCours} onClick={() => action.lancer(() => modifierConteneur(d.dossier.id, v))}>
        Enregistrer le suivi
      </button>
      <Retour r={action.resultat} />
    </div>
  );
}
