"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icone, type NomIcone } from "@/ui/icones";
import type { Evenement } from "./donnees";
import { GROUPES, groupesDu, jourFr, resume, type Etape } from "./etapes";
import Frise from "./Frise";
import s from "./ligne.module.css";

/*
 * Le parcours d'un dossier, en tête de sa page, à cheval sur la bande : la
 * ligne de A à Z — les huit grandes étapes, de la demande à l'avis, et sous
 * chacune ses étapes détaillées (treize en tout), datées, avec ce qu'on en
 * sait ou ce qui manque au CRM. Dessous, quelques faits que la fiche ne dit
 * pas d'un coup d'œil (montant signé, payé, prochain rendez-vous, demande du
 * site), et la chronologie complète, dépliable.
 *
 * Lecture seule : on agit depuis la fiche, juste dessous.
 *
 * La même carte ouvre la page d'une demande du site (unification du
 * 08/11/2026) : la demande est la première étape du même parcours. Elle y
 * reçoit son propre pied — la décision, accepter ou refuser (`pied`), à la
 * place des faits — et pas de chronologie (son historique est un onglet de
 * sa page). Elle s'affiche aussi bien sous un bandeau du CRM que dans les
 * pages écrites avec Tailwind (.vue-equipe) : tout son dessin est ici.
 */

const ICONES: NomIcone[] = ["questionnaires", "oeil", "devis", "commande", "calendrier", "camion", "facture", "etoile"];
const ETAT: Record<Etape["etat"], string> = { fait: "Fait", encours: "En cours", avenir: "À venir", manque: "Non enregistré", sansobjet: "Sans objet" };
const STOCKAGE = "bailly.parcours.chronologie";

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const quand = (iso: string, jour: boolean) =>
  jour ? jourFr(iso) : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(iso));

export type FaitsDossier = {
  signe: { montant: number; numero: string; formule: string } | null;
  paye: number;
  facture: number;
  prochainRdv: { debut: string; commercial: string } | null;
  demande: { id: string; statut: string; le: string; source: string | null } | null;
};

export default function LigneParcours({
  etapes,
  perdu,
  faits,
  evenements,
  aujourdhui = "",
  titre = "Parcours du dossier",
  perduTexte = "Dossier perdu",
  pied,
}: {
  etapes: Etape[];
  perdu: boolean;
  /** Les faits du dossier, sous les étapes ; remplacés par `pied` quand il est donné. */
  faits?: FaitsDossier;
  /** La chronologie, dépliable ; sans elle, pas de bouton. */
  evenements?: Evenement[];
  aujourdhui?: string;
  titre?: string;
  /** Ce que dit l'en-tête quand le parcours s'est arrêté. */
  perduTexte?: string;
  /** Le bas de la carte, à la place des faits : la décision sur une demande du site. */
  pied?: React.ReactNode;
}) {
  const [chronologie, setChronologie] = useState(false);
  // La chronologie dépliée ou non, gardée dans ce navigateur (lue après le premier rendu).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(STOCKAGE) === "ouverte") setChronologie(true);
      } catch {
        // stockage indisponible : repliée
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const basculer = () =>
    setChronologie((v) => {
      try {
        localStorage.setItem(STOCKAGE, v ? "repliee" : "ouverte");
      } catch {
        // stockage indisponible : l'état vaut pour la page
      }
      return !v;
    });

  const groupes = groupesDu(etapes);
  const faites = etapes.filter((e) => e.etat === "fait").length;
  const r = resume(etapes);
  const enCours = etapes.some((e) => e.etat === "encours");
  const part = faits?.signe ? Math.min(100, Math.round((faits.paye / faits.signe.montant) * 100)) : null;

  return (
    <>
      <section className={`chevauche ${s.carte}`} aria-label={`${titre}, de la demande à l'avis`}>
        <header className={s.tete}>
          <span className={s.teteIcone}>
            <Icone nom="parcours" taille={17} />
          </span>
          <div className={s.titres}>
            <h2>{titre}</h2>
            <p>{perdu ? perduTexte : enCours ? <>En cours : <b>{r.etape}</b></> : <b>Parcours complet</b>}</p>
          </div>
          <div className={s.jauge} role="img" aria-label={`${faites} étapes faites sur ${etapes.length}`}>
            <span className={s.barres} aria-hidden>
              {etapes.map((e) => (
                <i key={e.cle} data-etat={e.etat} />
              ))}
            </span>
            <span className={s.jaugeTexte}>
              <b>{faites}</b> sur {etapes.length}
            </span>
          </div>
          {evenements && (
            <button type="button" className={s.bascule} aria-expanded={chronologie} aria-controls="chronologie-dossier" onClick={basculer}>
              <Icone nom="horloge" taille={15} />
              Chronologie
              <em>{evenements.length}</em>
              <Icone nom="chevron" taille={14} className={s.chevron} />
            </button>
          )}
        </header>

        <ol className={s.stations}>
          {GROUPES.map((nom, g) => {
            const sous = etapes.filter((e) => e.groupe === g);
            const etat = groupes[g].etat;
            const manque = sous.some((e) => e.etat === "manque");
            return (
              <li key={nom} className={s.station} data-etat={etat} aria-current={etat === "encours" ? "step" : undefined}>
                <div className={s.noeud}>
                  <span className={s.rond}>{etat === "fait" ? <Icone nom="coche" taille={16} /> : <Icone nom={ICONES[g]} taille={16} />}</span>
                  {manque && (
                    <span className={s.alerte} title="Une étape n'est pas enregistrée au CRM">
                      !
                    </span>
                  )}
                </div>
                <b className={s.nom}>{nom}</b>
                <ul className={s.sous}>
                  {sous.map((e) => {
                    const date = e.date ? quand(e.date, e.jour) : null;
                    const detail = e.detail || (e.etat === "avenir" ? "" : ETAT[e.etat]);
                    const ligne = [date, detail].filter(Boolean).join(" · ");
                    return (
                      <li key={e.cle} data-etat={e.etat} title={[e.label, ETAT[e.etat], date, e.detail].filter(Boolean).join(" · ")}>
                        <span className={s.libelle}>
                          <i aria-hidden />
                          {e.label}
                        </span>
                        {ligne && <small>{ligne}</small>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>

        {pied ? (
          <div className={s.pied}>{pied}</div>
        ) : (
          faits && (
            <dl className={s.faits}>
            <div>
              <dt>Montant signé</dt>
              <dd>
                {faits.signe ? <b>{eur(faits.signe.montant)}</b> : <span className={s.vide}>Pas de devis signé</span>}
                {faits.signe && (
                  <small>
                    {faits.signe.numero} · {faits.signe.formule}
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>Payé</dt>
              <dd>
                <b className={faits.paye > 0 ? s.vert : undefined}>{eur(faits.paye)}</b>
                {part != null ? (
                  <span className={s.barre} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={part} aria-label="Part du montant signé déjà payée">
                    <i style={{ width: `${part}%` }} />
                  </span>
                ) : (
                  <small>Facturé : {eur(faits.facture)}</small>
                )}
              </dd>
            </div>
            <div>
              <dt>Prochain rendez-vous</dt>
              <dd>
                {faits.prochainRdv ? (
                  <>
                    <b>
                      {new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(
                        new Date(faits.prochainRdv.debut),
                      )}
                    </b>
                    <small>avec {faits.prochainRdv.commercial}</small>
                  </>
                ) : (
                  <span className={s.vide}>—</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Demande du site</dt>
              <dd>
                {faits.demande ? (
                  <Link href={`/dashboard/${faits.demande.id}`} className={s.lien}>
                    {faits.demande.source === "email" ? "E-mail" : "Formulaire"} du {quand(faits.demande.le, false)}
                    <Icone nom="fleche" taille={13} />
                  </Link>
                ) : (
                  <span className={s.vide}>Saisi au CRM</span>
                )}
                {/* Pas le statut de la demande : acceptée, elle n'a plus d'autre étape que celle du dossier (unification du 08/11/2026). */}
              </dd>
            </div>
          </dl>
          )
        )}
      </section>

      {chronologie && evenements && (
        <div id="chronologie-dossier" className={s.chronologie}>
          <Frise evenements={evenements} aujourdhui={aujourdhui} />
        </div>
      )}
    </>
  );
}
