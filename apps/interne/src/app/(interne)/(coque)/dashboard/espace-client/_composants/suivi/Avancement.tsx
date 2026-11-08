"use client";

import type { PointSuivi } from "@/lib/espace-client/progression";
import { Icone, type NomIcone } from "@/ui/icones";
import { Relancer } from "./Relancer";
import { initiales, jourCourt, jourHeure, nomAffiche, periodeCourte, type DonneesFiche, type IdRubrique } from "./outils";
import s from "./suivi.module.css";

/*
 * Le haut de la fiche d'un espace client : qui est le client, puis où en est
 * son dossier — le pourcentage, ce qui manque (et de quoi le relancer), ce
 * qui attend Bailly, ce qui est fait. Chaque point mène à sa rubrique.
 */

const ICONE: Record<PointSuivi["etat"], NomIcone> = { fait: "coche", a_faire: "horloge", bloquant: "alerte", en_attente: "horloge" };
const ETAT: Record<PointSuivi["etat"], string> = { fait: "Fait", a_faire: "À faire", bloquant: "Bloquant", en_attente: "En attente" };
const RUBRIQUE: Record<PointSuivi["rubrique"], IdRubrique> = { pieces: "pieces", reponses: "reponses", devis: "devis", cartons: "cartons", messages: "messages" };

/** Un anneau de progression : la part faite, en indigo ; vert à 100 %. */
function Anneau({ pourcent, taille = 148 }: { pourcent: number; taille?: number }) {
  const r = (taille - 16) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={s.anneau} style={{ width: taille, height: taille }} data-complet={pourcent >= 100 ? "" : undefined}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden>
        <defs>
          <linearGradient id="anneau-indigo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7a52ff" />
            <stop offset="100%" stopColor="#4b2fe0" />
          </linearGradient>
        </defs>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" strokeWidth="11" className={s.anneauFond} />
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          className={s.anneauPart}
          strokeDasharray={`${(c * Math.min(pourcent, 100)) / 100} ${c}`}
          transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
        />
      </svg>
      <span className={s.anneauValeur}>
        <b>{pourcent}</b>
        <i>%</i>
      </span>
    </div>
  );
}

/** Un point du dossier, lien vers sa rubrique. `sansEtat` : dans un groupe dont le titre dit déjà l'état. */
function Point({ p, lien, sansEtat = false }: { p: PointSuivi; lien: (r: IdRubrique) => string; sansEtat?: boolean }) {
  return (
    <li>
      <a className={s.point} data-etat={p.etat} href={lien(RUBRIQUE[p.rubrique])}>
        <span className={s.pointIcone}>
          <Icone nom={ICONE[p.etat]} taille={15} />
        </span>
        <span className={s.pointTexte}>
          <b>
            {p.titre}
            {p.facultatif && <em>facultatif</em>}
          </b>
          <small>{p.detail}</small>
        </span>
        <span className={s.pointFin}>
          {p.etat === "fait" ? (p.le ? jourCourt(p.le) : "Fait") : sansEtat ? null : (
            <span className={s.etat} data-etat={p.etat}>
              {ETAT[p.etat]}
            </span>
          )}
        </span>
        <Icone nom="droite" taille={15} className={s.pointChevron} />
      </a>
    </li>
  );
}

/** Qui est le client : avatar, coordonnées, trajet, conseiller, dernière connexion. */
function Identite({ d }: { d: DonneesFiche }) {
  const c = d.client;
  const x = d.dossier;
  const derniere = d.connexions[0];
  return (
    <div className={s.identite}>
      <div className={s.qui}>
        <span className={s.avatar} aria-hidden>
          {initiales(nomAffiche(c))}
        </span>
        <div className={s.quiTexte}>
          <p className={s.quiNom}>
            {c.civilite ? `${c.civilite} ` : ""}
            {c.prenom} {c.nom}
            {c.societe && <span> · {c.societe}</span>}
          </p>
          <p className={s.quiContact}>
            <a href={`mailto:${c.email}`}>
              <Icone nom="courrier" taille={14} />
              {c.email}
            </a>
            {c.telephone && (
              <a href={`tel:${c.telephone.replace(/\s/g, "")}`}>
                <Icone nom="telephone" taille={13} />
                {c.telephone}
              </a>
            )}
          </p>
        </div>
      </div>
      <dl className={s.faits}>
        <div>
          <dt>Trajet</dt>
          <dd>
            {x.ville_depart} → {x.ville_arrivee}
            <small>{periodeCourte(x.periode_debut, x.periode_fin)}</small>
          </dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>
            {x.volume_m3} m³
            <small>{[x.formule, x.logement].filter(Boolean).join(" · ") || "—"}</small>
          </dd>
        </div>
        <div>
          <dt>Conseiller</dt>
          <dd>
            {`${d.conseiller.prenom} ${d.conseiller.nom}`.trim()}
            <small>{d.conseiller.telephone || d.conseiller.email || "—"}</small>
          </dd>
        </div>
        <div>
          <dt>Dernière connexion</dt>
          <dd>
            {derniere ? jourHeure(derniere.le) : "Jamais connecté"}
            <small>{d.connexions.length ? `${d.connexions.length}${d.connexions.length >= 12 ? "+" : ""} session${d.connexions.length > 1 ? "s" : ""} ouverte${d.connexions.length > 1 ? "s" : ""}` : "Il entre par le lien de son e-mail"}</small>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * L'avancement du dossier. `lien` : l'adresse d'une rubrique — une ancre
 * dans la page, ou la fiche de l'espace depuis le CRM. `compact` : sans
 * l'identité du client (l'onglet du CRM l'a déjà).
 */
export function Avancement({ d, recharger, lien, compact = false }: { d: DonneesFiche; recharger: () => void; lien: (r: IdRubrique) => string; compact?: boolean }) {
  const { points, faits, total, pourcent } = d.suivi;
  const manque = points.filter((p) => p.etat === "bloquant" || p.etat === "a_faire").sort((a, b) => Number(b.etat === "bloquant") - Number(a.etat === "bloquant"));
  const attente = points.filter((p) => p.etat === "en_attente");
  const fait = points.filter((p) => p.etat === "fait");
  const bloquants = manque.filter((p) => p.etat === "bloquant").length;
  const termine = d.dossier.statut === "termine";

  return (
    <section id={compact ? undefined : "avancement"} className={`${s.carte} ${s.hero}`} data-compact={compact ? "" : undefined} aria-label="Avancement du dossier">
      {!compact && <Identite d={d} />}
      <div className={s.heroCorps}>
        <div className={s.jauge}>
          <Anneau pourcent={pourcent} taille={compact ? 120 : 148} />
          <p className={s.jaugeTitre}>
            Dossier complété à <b>{pourcent} %</b>
          </p>
          <p className={s.jaugeSous}>
            {faits} point{faits > 1 ? "s" : ""} fait{faits > 1 ? "s" : ""} sur {total}
          </p>
          <ul className={s.compteurs}>
            {bloquants > 0 && (
              <li data-ton="bloquant">
                <i />
                {bloquants} bloquant{bloquants > 1 ? "s" : ""}
              </li>
            )}
            {manque.length - bloquants > 0 && (
              <li data-ton="a_faire">
                <i />
                {manque.length - bloquants} à faire
              </li>
            )}
            {attente.length > 0 && (
              <li data-ton="en_attente">
                <i />
                {attente.length} en attente
              </li>
            )}
            <li data-ton="fait">
              <i />
              {fait.length} fait{fait.length > 1 ? "s" : ""}
            </li>
          </ul>
          {d.suivi.pieces.demandees > 0 && (
            <a className={s.jaugePieces} href={lien("pieces")}>
              <span>
                Pièces <b>{d.suivi.pieces.recues}</b>/{d.suivi.pieces.demandees}
              </span>
              <span className={s.barre}>
                <i style={{ width: `${(d.suivi.pieces.recues / d.suivi.pieces.demandees) * 100}%` }} data-complet={d.suivi.pieces.recues === d.suivi.pieces.demandees ? "" : undefined} />
              </span>
            </a>
          )}
          {/* « Mes tutos » : les tutoriels que le client a vus — une information, pas un point du dossier. */}
          {d.tutos.total > 0 && (
            <p className={s.jaugePieces} title={d.tutos.titres.length ? `Vus : ${d.tutos.titres.join(", ")}` : "Aucun tutoriel vu pour l'instant"}>
              <span>
                Tutos vus <b>{d.tutos.vus}</b>/{d.tutos.total}
              </span>
              <span className={s.barre}>
                <i style={{ width: `${(d.tutos.vus / d.tutos.total) * 100}%` }} data-complet={d.tutos.vus === d.tutos.total ? "" : undefined} />
              </span>
            </p>
          )}
        </div>

        <div className={s.points}>
          {manque.length > 0 ? (
            <div className={s.manque} data-bloquant={bloquants ? "" : undefined}>
              <div className={s.manqueTete}>
                <span className={s.manquePicto}>
                  <Icone nom="alerte" taille={17} />
                </span>
                <h3>Ce qui manque</h3>
                <span className={s.manqueCompte}>
                  {manque.length} point{manque.length > 1 ? "s" : ""}
                  {bloquants > 0 && ` · ${bloquants} bloquant${bloquants > 1 ? "s" : ""}`}
                </span>
              </div>
              <ul className={s.listePoints}>
                {manque.map((p) => (
                  <Point key={p.cle} p={p} lien={lien} />
                ))}
              </ul>
              {!termine && <Relancer d={d} recharger={recharger} />}
            </div>
          ) : (
            <div className={s.complet}>
              <span className={s.manquePicto}>
                <Icone nom="coche" taille={17} />
              </span>
              <p>
                <b>Rien ne manque.</b> Le client a fait tout ce qui dépendait de lui{attente.length ? " ; le reste attend Bailly ou la date du déménagement." : "."}
              </p>
            </div>
          )}

          {/* Ce qui attend Bailly ou la date, puis ce qui est fait : côte à côte quand la place le permet, en retrait. */}
          <div className={s.groupes}>
            {attente.length > 0 && (
              <div className={s.groupe}>
                <h4>En attente</h4>
                <ul className={s.listePoints}>
                  {attente.map((p) => (
                    <Point key={p.cle} p={p} lien={lien} sansEtat />
                  ))}
                </ul>
              </div>
            )}
            {fait.length > 0 && (
              <div className={s.groupe} data-fait="">
                <h4>Fait</h4>
                <ul className={s.listePoints}>
                  {fait.map((p) => (
                    <Point key={p.cle} p={p} lien={lien} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
