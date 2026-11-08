"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { envoyerAcces, type Resultat } from "@/lib/actions/espace-client-equipe";
import PanneauEnvoi from "@/crm/relances/PanneauEnvoi";
import { Icone } from "@/ui/icones";
import { Retour, usePorte } from "../socle";
import { type DonneesFiche } from "./outils";
import { apercuAcces, relancesProposees, type PropositionsRelance, type RelanceProposee } from "./relances";
import p from "@/crm/relances/panneau.module.css";
import s from "./suivi.module.css";

/** Ce que deviennent les messages, en une phrase : l'état réel du module d'envoi. */
function phraseEnvoi(mode: string) {
  if (mode === "actif") return "Envoi réel : le client recevra le message.";
  if (mode === "recette") return "Recette : le message ne part que si l'adresse est sur la liste blanche ; sinon il est journalisé.";
  return "Envoi désactivé : le message sera journalisé, rien ne partira.";
}

/** Le libellé court d'une relance, dans la rangée des autres choix. */
const COURT: Record<string, string> = {
  conditions: "Conditions de livraison", pieces: "Pièces", devis: "Devis à signer", solde: "Factures à régler", avis: "Avis",
};

/**
 * « Relancer le client » (David, 08/11/2026 : « j'ai que ça ») : le geste
 * principal est un seul message avec tout « Ce qui manque » — les points du
 * bloc au-dessus, à cocher, à personnaliser et à relire dans l'écran d'envoi.
 * Au choix ensuite, chaque relance qui a un objet maintenant (devis,
 * pièces, conditions, factures, avis), même hors du calendrier de la veille,
 * avec ce qui la bloque s'il y a lieu ; et le lien d'accès, dont l'e-mail
 * s'affiche avant de partir.
 */
export function Relancer({ d, recharger }: { d: DonneesFiche; recharger: () => void }) {
  const { demo } = usePorte();
  const [props, setProps] = useState<PropositionsRelance | null>(d.crm == null || demo ? { espace: null, types: [] } : null);
  const [panneau, setPanneau] = useState<string | null>(null);
  const [acces, setAcces] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const fermerPanneau = useCallback(() => setPanneau(null), []);
  const fermerAcces = useCallback(() => setAcces(false), []);

  useEffect(() => {
    if (d.crm == null || demo) return;
    let vivant = true;
    relancesProposees(d.crm, d.dossier.id)
      .then((r) => vivant && setProps(r))
      .catch(() => vivant && setProps({ espace: null, types: [] }));
    return () => {
      vivant = false;
    };
  }, [d.crm, d.dossier.id, demo]);

  const espace = props?.espace ?? null;
  const bloquees = (props?.types ?? []).filter((t) => t.bloquee);
  const apresEnvoi = (x: { ok: true; message?: string } | { ok: false; erreur: string }) => {
    setResultat(x.ok ? { ok: true, message: x.message } : { ok: false, erreur: x.erreur });
    recharger();
    if (d.crm != null) relancesProposees(d.crm, d.dossier.id).then(setProps).catch(() => undefined);
  };

  return (
    <div className={s.relance}>
      <div className={s.relanceLigne}>
        <button
          type="button"
          className={s.relanceBouton}
          onClick={() => (espace ? setPanneau(espace.cle) : setAcces(true))}
          disabled={props === null || !!espace?.bloquee}
          title={espace?.bloquee ?? undefined}
        >
          <Icone nom="envoyer" taille={17} />
          Relancer le client
        </button>
        <p className={s.relanceQuoi}>
          {props === null
            ? "Recherche de ce qui peut partir…"
            : espace
              ? espace.bloquee
                ? `Relance impossible : ${espace.bloquee}`
                : `Un e-mail avec ce qui manque (${espace.elements} point${espace.elements > 1 ? "s" : ""}), à cocher, personnaliser et relire avant l’envoi${espace.aRediger ? " — texte proposé, à relire" : ""}.`
              : d.crm == null
                ? `Espace sans dossier du CRM : seul un nouveau lien d’accès peut partir, à ${d.client.email}.`
                : `E-mail avec un nouveau lien d’accès à son espace, à ${d.client.email}.`}
          <small>{phraseEnvoi(d.mode.envois.mode)}</small>
        </p>
      </div>
      {props && (props.types.length > 0 || espace) && (
        <div className={s.relanceChoix} aria-label="Relancer seulement une partie">
          <span>Ou seulement :</span>
          {props.types.map((t) => (
            <BoutonRelance key={t.cle} t={t} ouvrir={() => setPanneau(t.cle)} />
          ))}
          <button type="button" className={s.choix} onClick={() => setAcces(true)}>
            <Icone nom="connexion" taille={13} />
            Lien d’accès
          </button>
        </div>
      )}
      {bloquees.length > 0 && (
        <ul className={s.relanceBloquees}>
          {/* Une raison, une ligne : « Conditions, Pièces : dossier marqué ne pas relancer ». */}
          {[...new Set(bloquees.map((t) => t.bloquee!))].map((raison) => (
            <li key={raison}>
              <b>{bloquees.filter((t) => t.bloquee === raison).map((t) => COURT[t.type] ?? t.libelle).join(", ")}</b> : {raison}
            </li>
          ))}
        </ul>
      )}
      <Retour r={resultat} />
      {panneau && <PanneauEnvoi cle={panneau} mode="envoi" fermer={fermerPanneau} envoye={apresEnvoi} />}
      {acces && <ApercuAcces dossierId={d.dossier.id} mode={d.mode.envois.mode} fermer={fermerAcces} envoye={apresEnvoi} />}
    </div>
  );
}

function BoutonRelance({ t, ouvrir }: { t: RelanceProposee; ouvrir: () => void }) {
  const titre = t.bloquee ?? [t.objet, t.horsSuite, t.aRediger ? "Texte proposé, à relire avant l’envoi." : null].filter(Boolean).join(" · ");
  return (
    <button type="button" className={s.choix} onClick={ouvrir} disabled={!!t.bloquee} data-bloquee={t.bloquee ? "" : undefined} title={titre}>
      {COURT[t.type] ?? t.libelle}
      {t.elements > 1 && <em>{t.elements}</em>}
      {t.horsSuite && !t.bloquee && <i title={t.horsSuite}>hors suite</i>}
    </button>
  );
}

/** L'e-mail du lien d'accès, avant qu'il parte : le lien lui-même est créé à l'envoi. */
function ApercuAcces({ dossierId, mode, fermer, envoye }: { dossierId: string; mode: string; fermer: () => void; envoye: (x: { ok: true; message?: string } | { ok: false; erreur: string }) => void }) {
  const [a, setA] = useState<{ sujet: string; html: string; a: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    let vivant = true;
    apercuAcces(dossierId)
      .then((r) => vivant && (r.ok ? setA(r) : setErreur(r.erreur)))
      .catch(() => vivant && setErreur("L’aperçu ne se compose pas."));
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    return () => {
      vivant = false;
      document.removeEventListener("keydown", echap);
    };
  }, [dossierId, fermer]);

  const envoyer = () =>
    demarrer(async () => {
      const r = await envoyerAcces(dossierId);
      if (r.ok) {
        envoye({ ok: true, message: r.message });
        fermer();
      } else setErreur(r.erreur ?? "L’envoi n’a pas abouti.");
    });

  return (
    <div className={p.voile} onClick={fermer} role="presentation">
      <aside className={p.volet} role="dialog" aria-modal="true" aria-label="Lien d’accès à l’espace client" onClick={(e) => e.stopPropagation()}>
        <header className={p.tete}>
          <div className={p.teteTexte}>
            <p className={p.surtitre}>
              <i />
              Lien d’accès à l’espace client
            </p>
            <h2>{a ? a.a : "Préparation…"}</h2>
          </div>
          <button type="button" className={p.fermer} onClick={fermer} aria-label="Fermer">
            <Icone nom="fermer" taille={18} />
          </button>
        </header>
        <div className={p.defile}>
          {erreur ? (
            <p className={p.erreur}>{erreur}</p>
          ) : !a ? (
            <div className={p.chargement} aria-busy="true">
              <span />
            </div>
          ) : (
            <section className={p.section}>
              <div className={p.sectionTete}>
                <div>
                  <h3>Le message, tel que le client le recevra</h3>
                  <p>Le lien du bouton est créé à l’envoi : personnel, à usage unique, valable quelques minutes.</p>
                </div>
              </div>
              <div className={p.enveloppe}>
                <dl>
                  <div>
                    <dt>À</dt>
                    <dd>{a.a}</dd>
                  </div>
                  <div>
                    <dt>Objet</dt>
                    <dd>
                      <b>{a.sujet}</b>
                    </dd>
                  </div>
                </dl>
                <iframe className={p.cadre} title="L’e-mail du lien d’accès" sandbox="" srcDoc={a.html} style={{ height: 900 }} />
              </div>
            </section>
          )}
        </div>
        <footer className={p.pied}>
          <p className={p.mode} data-mode={mode}>
            <i />
            {phraseEnvoi(mode)}
          </p>
          <div className={p.gestes}>
            <button type="button" className={p.secondaire} onClick={fermer}>
              Fermer
            </button>
            <button type="button" className={p.principal} disabled={!a || enCours} onClick={envoyer}>
              <Icone nom="envoyer" taille={16} />
              {enCours ? "Envoi…" : "Envoyer le lien"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
