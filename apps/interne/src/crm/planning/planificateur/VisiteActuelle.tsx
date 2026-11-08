"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ic } from "@/crm/lib/icons";
import { ETATS_VISITE } from "@/crm/visites/cycle";
import { commencerVisite } from "@/crm/visites/actions";
import { jourVisite, momentVisite, plageVisite } from "@/lib/visite/regles";
import { changerEtatVisite } from "../actions";
import { TYPES_RDV } from "../types-rdv";
import { annulerRdv } from "./actions";
import type { RdvPlanif } from "./donnees";
import s from "./planificateur.module.css";

/*
 * Le planificateur en modification, en tête de colonne : le rendez-vous tel
 * qu'il est aujourd'hui au planning (son créneau, qui, où en est la visite, la
 * confirmation du client), et ce qui ne se « modifie » pas : marquer la visite
 * effectuée, l'ouvrir sur la tablette, l'annuler.
 *
 * « Annuler la visite » la retire du planning (annulerRdv) : le créneau se
 * libère, elle quitte l'espace du client, le rappel de la veille n'a plus
 * lieu. Le geste demande confirmation et dit tout cela avant. Une visite faite
 * ou commencée sur la tablette ne s'annule plus : elle se classe sans suite.
 */

const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function VisiteActuelle({ rdv, retour, maintenant }: { rdv: RdvPlanif; retour: string | null; maintenant: number }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [arme, setArme] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const t = TYPES_RDV[rdv.type];
  const visite = rdv.etat !== null;
  const visio = rdv.type === "visio";
  const quand = rdv.journee ? `${maj(jourVisite(rdv.debut))} · journée entière` : `${maj(jourVisite(rdv.debut))} · ${plageVisite(rdv.debut, rdv.duree)}`;
  const passee = new Date(rdv.debut).getTime() + rdv.duree * 60_000 < maintenant;
  // Une visite faite (terminée, compte-rendu signé, devis établi) ou commencée sur la tablette ne s'annule plus.
  const annulable = !visite || (!rdv.tablette && !rdv.termine && rdv.etat !== "effectuee" && rdv.etat !== "devis");
  const libelleAnnuler = visite ? (visio ? "Annuler la visio" : "Annuler la visite") : "Supprimer le rendez-vous";

  const agir = (f: () => Promise<unknown>) =>
    demarrer(async () => {
      setErreur(null);
      try {
        await f();
        router.refresh();
      } catch (e) {
        // Une redirection (tablette, annulation) n'est pas une erreur : Next la suit.
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setErreur("Le geste n'a pas pu être enregistré : réessayez.");
      }
    });

  function annuler() {
    demarrer(async () => {
      setErreur(null);
      const r = await annulerRdv(rdv.id, retour);
      if (r?.erreur) {
        setErreur(r.erreur);
        setArme(false);
      }
    });
  }

  return (
    <section className={`${s.actuelle} t-${rdv.type}`} aria-labelledby="planif-actuelle" data-attente={enCours || undefined}>
      <div className={s.actuelleTete}>
        <i className={s.actuelleIcone} aria-hidden>
          <Ic n={rdv.termine ? "check" : t.icone} />
        </i>
        <div className={s.actuelleTexte}>
          <small id="planif-actuelle">Actuellement au planning</small>
          <b>{quand}</b>
          <span>
            {t.long} avec {rdv.commercial}
          </span>
        </div>
      </div>

      {(rdv.etat || rdv.sms || rdv.tablette) && (
        <div className={s.actuellePastilles}>
          {rdv.etat && <i className={`st ${ETATS_VISITE[rdv.etat].ton}`}>{ETATS_VISITE[rdv.etat].libelle}</i>}
          {rdv.sms ? (
            <i className={`st ${rdv.sms.ton}`} title={rdv.sms.detail}>
              {rdv.sms.libelle}
            </i>
          ) : (
            rdv.etat === "planifiee" && !passee && <i className="st n">Pas encore confirmée au client</i>
          )}
          {rdv.tablette && <i className={`st ${rdv.tablette.statut === "signee" ? "g" : "w"}`}>{rdv.tablette.statut === "signee" ? "Compte-rendu signé" : "Saisie en cours sur la tablette"}</i>}
        </div>
      )}

      {!arme ? (
        <div className={s.actuelleGestes}>
          {visite && rdv.etat === "planifiee" && (
            <button type="button" className={s.geste} disabled={enCours} onClick={() => agir(() => changerEtatVisite(rdv.id, "effectuee"))}>
              <Ic n="check" />
              Marquer effectuée
            </button>
          )}
          {visite && rdv.dossierId && !rdv.tablette && rdv.etat === "planifiee" && (
            <button type="button" className={s.geste} disabled={enCours} onClick={() => agir(() => commencerVisite(rdv.dossierId!, rdv.id))}>
              <Ic n="pen" />
              Tablette
            </button>
          )}
          {rdv.tablette?.statut === "en_cours" && (
            <Link className={s.geste} href={`/tablette/${rdv.tablette.id}`}>
              <Ic n="pen" />
              Reprendre sur la tablette
            </Link>
          )}
          {rdv.tablette?.statut === "signee" && (
            <a className={s.geste} href={`/api/visites/${rdv.tablette.id}/compte-rendu`} target="_blank" rel="noopener">
              <Ic n="pdf" />
              Compte-rendu
            </a>
          )}
          {visite && (rdv.etat === "effectuee" || rdv.etat === "devis") && (
            <button type="button" className={s.geste} disabled={enCours} onClick={() => agir(() => changerEtatVisite(rdv.id, "sans_suite"))}>
              Classer sans suite
            </button>
          )}
          {visite && rdv.sansSuite && (
            <button type="button" className={s.geste} disabled={enCours} onClick={() => agir(() => changerEtatVisite(rdv.id, "reprise"))}>
              Reprendre
            </button>
          )}
          {visite && (
            <a className={s.geste} href={`/imprimer/visites?rdv=${rdv.id}`} target="_blank" rel="noopener">
              <Ic n="pdf" />
              Fiche
            </a>
          )}
          {annulable && (
            <button type="button" className={`${s.geste} ${s.gesteDanger}`} disabled={enCours} onClick={() => setArme(true)}>
              {libelleAnnuler}
            </button>
          )}
        </div>
      ) : (
        <div className={s.confirmer} role="alertdialog" aria-labelledby="planif-annuler-titre" aria-describedby="planif-annuler-texte">
          <b id="planif-annuler-titre">
            {visite
              ? `${visio ? "Annuler la visio" : "Annuler la visite"} du ${momentVisite(rdv.debut)} ?`
              : `Supprimer « ${rdv.titre} » du planning ?`}
          </b>
          <p id="planif-annuler-texte">
            {visite
              ? `Elle quitte le planning de ${rdv.commercial} : le créneau se libère, ${visio ? "la visio" : "la visite"} disparaît de l'espace du client et le rappel de la veille n'a pas lieu. Aucun message ne part au client : prévenez-le vous-même. Une trace reste au fil du dossier.`
              : `Le rendez-vous disparaît du planning de ${rdv.commercial}.`}
          </p>
          <div className={s.confirmerGestes}>
            <button type="button" className={s.confirmerOui} disabled={enCours} onClick={annuler} autoFocus>
              {enCours ? "Annulation…" : visite ? (visio ? "Oui, annuler la visio" : "Oui, annuler la visite") : "Oui, supprimer"}
            </button>
            <button type="button" className={s.geste} disabled={enCours} onClick={() => setArme(false)}>
              {visite ? (visio ? "Garder la visio" : "Garder la visite") : "Garder"}
            </button>
          </div>
        </div>
      )}

      {!annulable && visite && !arme && (
        <p className={s.aide}>
          {rdv.tablette
            ? "La visite a commencé sur la tablette : elle ne s'annule plus. Classez-la sans suite si elle n'a rien donné."
            : "La visite est faite : elle ne s'annule plus. Classez-la sans suite si elle n'a rien donné."}
        </p>
      )}
      {erreur && (
        <p className={s.actuelleErreur} role="alert">
          <Ic n="alert" />
          {erreur}
        </p>
      )}
    </section>
  );
}
