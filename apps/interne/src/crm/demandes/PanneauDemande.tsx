"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import { Picto } from "@/crm/dispatch/composants/Picto";
import { Toast, type Message } from "@/crm/dispatch/composants/elements";
import { eur, m3, STATUTS } from "@/crm/lib/format";
import { FenetreAccepter, FenetreRefuser } from "@/crm/parcours/DecisionDemande";
import { mettreARappeler } from "./actions";
import { AXES, basePrestige, manques } from "./araignee";
import { estOuverte, NOM_ETAPE } from "./etapes";
import type { Activite, LigneDemande } from "./liste-commun";
import Radar from "./Radar";
import k from "@/crm/kanban/kanban.module.css";
import s from "./liste-detail.module.css";

/*
 * Le panneau d'une demande, à droite de la liste de Demandes (Top demandes,
 * Feed) : en haut l'araignée en couleur, dessous ce qu'il faut savoir pour
 * agir — le client et ses coordonnées (un clic appelle ou écrit), le
 * déménagement, le prestige et sa base, l'évaluation et ce qui manque,
 * l'étape et l'origine, les dernières activités. Les gestes sont sous le
 * nom, toujours à l'écran : ouvrir la demande, la mettre à rappeler, la
 * refuser, l'accepter.
 */

const QUAND = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const RAPPEL: Record<string, string> = { a_rappeler: "Rappel : à rappeler", en_cours: "Rappel : en cours" };

const adresse = (a: string | null, cp: string | null, ville: string | null) => [a, [cp, ville].filter(Boolean).join(" ")].filter((x) => x && x.trim()).join(", ") || null;

export default function PanneauDemande({ ligne, activites, erreur }: { ligne: LigneDemande; activites: Activite[] | null; erreur: boolean }) {
  const { demande: d, araignee: a, etape } = ligne;
  const router = useRouter();
  const [fenetre, setFenetre] = useState<"accepter" | "refuser" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const fermerMessage = useCallback(() => setMessage(null), []);
  const [enCours, demarrer] = useTransition();
  const manque = manques(d);
  const ouverte = estOuverte(d);
  const rappelOuvert = d.rappel && RAPPEL[d.rappel];
  const demande = { id: d.id, client: d.client };

  const aRappeler = () =>
    demarrer(async () => {
      const r = await mettreARappeler(d.id);
      setMessage({ texte: r.message, ton: r.ok ? undefined : "erreur" });
      if (r.ok) router.refresh();
    });

  return (
    <aside className={`${k.racine} ${s.panneau}`} aria-label={`Demande de ${d.client}`}>
      {/* Le nom, l'étape et les gestes restent en haut ; le reste défile dessous. */}
      <div className={s.panneauHaut}>
        <header className={s.panneauTete}>
          <div className={s.titreLigne}>
            <h2>{d.client}</h2>
            <Link href={`/dashboard/${d.id}`} className={s.ouvrir}>
              Ouvrir la demande
              <Icone nom="fleche" taille={14} />
            </Link>
          </div>
          <p>
            <span className={s.etape} data-etape={etape}>
              {etape === "dossier" && d.dossier ? `Dossier ${d.dossier.ref} · ${STATUTS[d.dossier.statut]?.label ?? d.dossier.statut}` : NOM_ETAPE[etape]}
            </span>
            <span>
              {d.source === "email" ? "Mail" : "Formulaire"} · reçue le {QUAND.format(new Date(d.recueLe))}
            </span>
          </p>
        </header>

        {(ouverte || d.dossier) && (
          <div className={s.gestes}>
            {d.dossier && (
              <Link href={`/dossiers/${d.dossier.id}`} className={k.boutonPlein}>
                Ouvrir le dossier
                <Icone nom="fleche" taille={15} />
              </Link>
            )}
            {ouverte && (
              <>
                <button type="button" className={k.boutonPlein} onClick={() => setFenetre("accepter")}>
                  <Icone nom="coche" taille={15} />
                  Accepter
                </button>
                <button type="button" className={k.boutonDanger} onClick={() => setFenetre("refuser")}>
                  Refuser
                </button>
                {rappelOuvert ? (
                  <Link href="/demandes?vue=rappels" className={s.rappel} title="Voir les rappels">
                    <Icone nom="horloge" taille={14} />
                    {rappelOuvert}
                  </Link>
                ) : (
                  <button type="button" className={k.boutonClair} disabled={enCours} onClick={aRappeler}>
                    <Icone nom="horloge" taille={15} />
                    {enCours ? "Un instant…" : "À rappeler"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className={s.panneauCorps}>
        <div className={s.araignee}>
          <Radar araignee={a} taille={300} libelles />
          <p className={s.base}>
            {basePrestige(a.prestige)}
            {a.prestige ? ` · ${a.prestige.ou}` : ""}
          </p>
        </div>

        <section className={s.bloc} aria-label="Le client">
          <h3>Client</h3>
          <div className={s.contacts}>
            {d.telephone ? (
              <a href={`tel:${d.telephone.replace(/\s/g, "")}`} className={s.contact}>
                <Picto nom="telephone" taille={15} />
                {d.telephone}
              </a>
            ) : (
              <span className={s.contactVide}>Pas de téléphone</span>
            )}
            {d.email ? (
              <a href={`mailto:${d.email}`} className={s.contact}>
                <Icone nom="courrier" taille={15} />
                {d.email}
              </a>
            ) : (
              <span className={s.contactVide}>Pas d&apos;e-mail</span>
            )}
          </div>
          {d.societe && <p className={s.note}>{d.societe}</p>}
        </section>

        <section className={s.bloc} aria-label="Le déménagement">
          <h3>Déménagement · {d.parcoursLabel}</h3>
          <dl className={s.faits}>
            <div>
              <dt>Départ</dt>
              <dd>{adresse(d.departAdresse, d.departCp, d.depart) ?? "À préciser"}</dd>
            </div>
            <div>
              <dt>Arrivée</dt>
              <dd>{adresse(d.arriveeAdresse, d.arriveeCp, d.arrivee) ?? "À préciser"}</dd>
            </div>
            <div>
              <dt>Date souhaitée</dt>
              <dd>
                {d.dateSouhaitee ? JOUR.format(new Date(`${d.dateSouhaitee}T12:00:00Z`)) : (d.flexibilite ?? "À fixer")}
                {d.dateSouhaitee && d.flexibilite && <small> · {d.flexibilite}</small>}
              </dd>
            </div>
            <div className={s.deux}>
              <div>
                <dt>Volume</dt>
                <dd>{d.volume != null && d.volume > 0 ? m3(d.volume) : "—"}</dd>
              </div>
              <div>
                <dt>Estimation</dt>
                <dd>{d.estimation != null ? eur(d.estimation) : "—"}</dd>
              </div>
            </div>
          </dl>
        </section>

        <section className={s.bloc} aria-label="L'évaluation">
          <h3>Évaluation</h3>
          <div className={s.jauges}>
            {(["potentiel", "facilite", "completude"] as const).map((cle) => {
              const axe = AXES.find((x) => x.cle === cle)!;
              const v = a.valeurs[cle];
              return (
                <div key={cle} className={s.jauge} style={{ ["--c" as string]: axe.couleur }}>
                  <span className={s.jaugeTitre}>
                    {axe.label}
                    <b>
                      {v ?? "—"}
                      {v != null && <small>{cle === "completude" ? " %" : "/100"}</small>}
                    </b>
                  </span>
                  <span className={s.jaugeBarre}>
                    <i style={{ width: `${v ?? 0}%` }} />
                  </span>
                  {cle === "facilite" && d.difficulte != null && <small>difficulté {d.difficulte}/100</small>}
                </div>
              );
            })}
          </div>
          {manque.length > 0 && <p className={s.manque}>Il manque : {manque.join(", ")}.</p>}
        </section>

        <section className={s.bloc} aria-label="Dernières activités">
          <h3>Dernières activités</h3>
          {activites == null ? (
            <p className={s.note}>{erreur ? "Les activités ne se lisent pas pour le moment." : "Lecture…"}</p>
          ) : activites.length === 0 ? (
            <p className={s.note}>Aucune activité.</p>
          ) : (
            <ol className={s.activites}>
              {activites.map((x) => (
                <li key={x.cle} data-ton={x.ton}>
                  <i aria-hidden>
                    <Icone nom={x.icone} taille={13} />
                  </i>
                  <span>
                    <b>{x.texte}</b>
                    <small>{[x.jour, x.heure, x.acteur].filter(Boolean).join(" · ")}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>


      {fenetre === "accepter" && <FenetreAccepter demande={demande} onFermer={() => setFenetre(null)} />}
      {fenetre === "refuser" && <FenetreRefuser demande={demande} onFermer={() => setFenetre(null)} onRefusee={setMessage} />}
      <Toast message={message} onFermer={fermerMessage} />
    </aside>
  );
}
