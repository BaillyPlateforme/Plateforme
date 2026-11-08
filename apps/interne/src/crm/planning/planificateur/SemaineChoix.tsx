"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Ic } from "@/crm/lib/icons";
import type { CreneauPlanning, EvenementPlanning } from "../donnees";
import { couloirs, H0, H1, heure, position, type Bloc } from "../grille";
import { estJourneeVisio, TYPES_RDV, type TypeRdv } from "../types-rdv";
import s from "./planificateur.module.css";

/*
 * La semaine du commercial, dans le planificateur : du lundi au dimanche, de
 * 7 h à 20 h, ses rendez-vous dans les couleurs du planning, ses journées
 * (« journée visio ») au-dessus, et les créneaux qu'il propose à des clients.
 * Un clic sur la grille choisit le créneau, au quart d'heure ; au survol, le
 * créneau se dessine à la durée choisie. Un créneau passé ne se choisit pas.
 */

const HAUT = 40;
const PAS = 15;
const NOMS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export type Choix = { jour: string; min: number };

export default function SemaineChoix({
  jours,
  aujourdhui,
  minutesMaintenant,
  evenements,
  creneaux,
  dossierId,
  type,
  duree,
  journee,
  choix,
  conflit,
  onChoisir,
  chargement,
}: {
  jours: string[];
  aujourdhui: string;
  /** L'heure de Paris, en minutes : avant, aujourd'hui est passé. */
  minutesMaintenant: number;
  evenements: EvenementPlanning[];
  creneaux: CreneauPlanning[];
  dossierId: number | null;
  type: TypeRdv;
  duree: number;
  journee: boolean;
  choix: Choix | null;
  conflit: boolean;
  onChoisir: (c: Choix) => void;
  chargement: boolean;
}) {
  const [survol, setSurvol] = useState<Choix | null>(null);
  const colonnes = { gridTemplateColumns: `44px repeat(${jours.length}, minmax(0, 1fr))` } as CSSProperties;
  const heures = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
  const passe = (jour: string, min: number) => jour < aujourdhui || (jour === aujourdhui && min < minutesMaintenant);

  const lanes = useMemo(() => {
    const m = new Map<number, [number, number]>();
    for (const j of jours) {
      const blocs: Bloc[] = [
        ...evenements.filter((e) => e.jour === j && !e.journee).map((e) => ({ id: e.id, debut: e.debutMin, fin: e.debutMin + Math.max(e.duree, 30) })),
        ...creneaux.filter((c) => c.jour === j).map((c) => ({ id: -c.id, debut: c.debutMin, fin: c.debutMin + c.duree })),
      ];
      for (const [k, v] of couloirs(blocs)) m.set(k, v);
    }
    return m;
  }, [jours, evenements, creneaux]);

  /** Le quart d'heure sous le pointeur, dans une colonne. */
  function sous(el: HTMLElement, y: number): Choix {
    const r = el.getBoundingClientRect();
    let min = H0 * 60 + Math.floor(((y - r.top) / HAUT) * (60 / PAS)) * PAS;
    min = Math.min(Math.max(min, H0 * 60), H1 * 60 - Math.min(duree, 60));
    return { jour: el.dataset.jour!, min };
  }

  const fantome = (c: Choix, survole: boolean) => {
    const pos = position(c.min, duree, HAUT);
    return (
      <div
        key={survole ? "survol" : "choix"}
        className={`ev t-${type} ${s.fantome} ${survole ? s.fantomeSurvol : ""} ${!survole && conflit ? s.fantomeKo : ""}`}
        style={{ top: pos.top, height: pos.height }}
        aria-hidden={survole}
      >
        <span className="ev-top">
          <span className="ev-time">
            {heure(c.min)}–{heure(c.min + duree)}
          </span>
        </span>
        {!survole && (
          <b className="ev-n">
            <Ic n={conflit ? "alert" : TYPES_RDV[type].icone} />
            {conflit ? "Créneau pris" : "Votre choix"}
          </b>
        )}
      </div>
    );
  };

  return (
    <div className={`${s.grille} ${chargement ? s.charge : ""}`} aria-busy={chargement}>
      <div className={s.gTete} style={colonnes}>
        <span />
        {jours.map((j, i) => {
          const visio = evenements.find((e) => e.jour === j && estJourneeVisio(e));
          return (
            <div key={j} className={`${s.gJour} ${j === aujourdhui ? s.gAujourdhui : ""} ${choix?.jour === j ? s.gChoisi : ""}`}>
              <small>{NOMS[i]}</small>
              <b>{Number(j.slice(8))}</b>
              {visio && (
                <i className={`${s.gMarque} t-visio`} title={`Journée visio : ${visio.titre}`}>
                  <Ic n="video" />
                </i>
              )}
            </div>
          );
        })}
      </div>
      <div className={s.gJournee} style={colonnes}>
        <span>Journée</span>
        {jours.map((j) => {
          const items = evenements.filter((e) => e.jour === j && e.journee);
          const choisie = journee && choix?.jour === j;
          return (
            <div
              key={j}
              className={`${s.gCelluleJournee} ${journee && !passe(j, 24 * 60) ? s.gCliquable : ""} ${choisie ? s.gCelluleChoisie : ""}`}
              onClick={journee && !passe(j, 24 * 60) ? () => onChoisir({ jour: j, min: 12 * 60 }) : undefined}
            >
              {items.map((e) => (
                <span key={e.id} className={`${s.gPuce} t-${e.type}`} title={`${e.titre}${e.lieu ? ` · ${e.lieu}` : ""} · journée entière`}>
                  {e.titre}
                </span>
              ))}
              {choisie && <span className={`${s.gPuce} ${s.gPuceChoisie} t-${type}`}>Votre choix</span>}
            </div>
          );
        })}
      </div>
      <div className={s.gCorps} style={colonnes}>
        <div className={s.gHeures} style={{ height: (H1 - H0) * HAUT }}>
          {heures.map((h) => (
            <span key={h} style={{ height: HAUT }}>
              {h}h
            </span>
          ))}
        </div>
        {jours.map((j) => {
          const finPasse = j < aujourdhui ? (H1 - H0) * HAUT : j === aujourdhui ? Math.min(Math.max(((minutesMaintenant - H0 * 60) / 60) * HAUT, 0), (H1 - H0) * HAUT) : 0;
          return (
            <div
              key={j}
              data-jour={j}
              className={`${s.gCol} ${j === aujourdhui ? s.gAujourdhui : ""} ${journee ? s.gColJournee : ""}`}
              style={{ height: (H1 - H0) * HAUT, backgroundSize: `100% ${HAUT}px` }}
              onPointerMove={(ev) => {
                if (journee || ev.pointerType === "touch") return;
                const c = sous(ev.currentTarget, ev.clientY);
                setSurvol(passe(c.jour, c.min) ? null : c);
              }}
              onPointerLeave={() => setSurvol(null)}
              onClick={(ev) => {
                if (journee) {
                  if (!passe(j, 24 * 60)) onChoisir({ jour: j, min: 12 * 60 });
                  return;
                }
                const c = sous(ev.currentTarget, ev.clientY);
                if (!passe(c.jour, c.min)) onChoisir(c);
              }}
            >
              {finPasse > 0 && <i className={s.gPasse} style={{ height: finPasse }} aria-hidden />}
              {creneaux
                .filter((c) => c.jour === j)
                .map((c) => {
                  const [l, n] = lanes.get(-c.id) ?? [0, 1];
                  const sien = dossierId != null && c.dossierId === dossierId;
                  return (
                    <div
                      key={`p${c.id}`}
                      className={`${s.gPropose} ${sien ? s.gProposeSien : ""}`}
                      title={sien ? "Créneau proposé à ce client, en attente de sa réponse" : `Créneau proposé à ${c.client}, en attente de sa réponse`}
                      style={{ ...position(c.debutMin, c.duree, HAUT), left: `calc(${(l / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
                    >
                      <b>{heure(c.debutMin)} · proposé</b>
                      <span>{sien ? "à ce client" : c.client}</span>
                    </div>
                  );
                })}
              {evenements
                .filter((e) => e.jour === j && !e.journee)
                .map((e) => {
                  const [l, n] = lanes.get(e.id) ?? [0, 1];
                  const t = TYPES_RDV[e.type];
                  const devis = e.devisEtabli && (e.type === "phys" || e.type === "visio");
                  return (
                    <div
                      key={e.id}
                      className={`ev t-${e.type} ${e.fait ? "fait" : ""} ${devis ? "devis" : ""} ${e.etat === "sans_suite" ? "sans-suite" : ""} ${s.gBloc} ${n > 1 ? s.gEtroit : ""}`}
                      title={`${t.long} · ${heure(e.debutMin)}–${heure(e.debutMin + e.duree)} · ${e.titre}${e.lieu ? ` · ${e.lieu}` : ""}`}
                      style={{ ...position(e.debutMin, e.duree, HAUT), left: `calc(${(l / n) * 100}% + 2px)`, right: "auto", width: `calc(${100 / n}% - 4px)` }}
                    >
                      {devis && (
                        <i className="ticket-devis" aria-label="Devis établi">
                          <Ic n="check" />
                        </i>
                      )}
                      <span className="ev-top">
                        <span className="ev-time">{heure(e.debutMin)}</span>
                        <span className="ev-ty">
                          <Ic n={e.fait ? "check" : t.icone} />
                          <span className={s.gTypeTexte}>{e.fait ? "Faite" : t.court}</span>
                        </span>
                      </span>
                      <span className="ev-n">{e.titre}</span>
                    </div>
                  );
                })}
              {!journee && survol?.jour === j && !(choix && choix.jour === j && choix.min === survol.min) && fantome(survol, true)}
              {!journee && choix?.jour === j && fantome(choix, false)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
