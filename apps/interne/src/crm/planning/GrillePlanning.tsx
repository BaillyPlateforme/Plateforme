"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Ic } from "@/crm/lib/icons";
import { RDV_TYPES } from "@/crm/lib/format";
import { ETATS_VISITE } from "@/crm/visites/cycle";
import { terminerRdv } from "@/crm/actions";
import { confirmerParSms, deplacerRdv } from "./actions";
import type { CreneauPlanning, EvenementPlanning } from "./donnees";
import { EtatSmsRdv } from "@/crm/rdv/EtatSmsRdv";
import type { EtatAffiche } from "@/crm/rdv/sms";
import s from "./planning.module.css";

/*
 * La grille du planning commercial : sept jours, de 7 h à 20 h, et une
 * rangée « Journée » au-dessus pour les journées entières.
 *
 * Un rendez-vous se déplace au glisser-déposer (souris ou doigt), au quart
 * d'heure : le serveur vérifie la règle des visites (pas de chevauchement
 * avec le planning du commercial ni avec un créneau proposé à un autre
 * client) avant d'enregistrer. Un clic l'ouvre pour le modifier ou le
 * supprimer.
 *
 * Les blocs qui se chevauchent se partagent la colonne en couloirs ; quand
 * un couloir est étroit, le bloc ne garde que l'heure, le nom et l'état, et
 * s'élargit au survol (ou au focus) pour se lire en entier.
 */

export const H0 = 7;
export const H1 = 20;
const HAUT = 52;
const PAS = 15;

type Jour = { cle: string; nom: string; numero: number; aujourdhui: boolean; visites: number };
type Bloc = { id: number; debut: number; fin: number };

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const heure = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}`;

/** Les couloirs d'une journée : un bloc prend le premier couloir libre, et chaque grappe de blocs qui se chevauchent partage la largeur. */
function couloirs(blocs: Bloc[]) {
  const out = new Map<number, [number, number]>();
  const tries = [...blocs].sort((a, b) => a.debut - b.debut || b.fin - a.fin);
  let grappe: Bloc[] = [];
  let fin = -1;
  const fermer = () => {
    const n = Math.max(1, ...grappe.map((b) => out.get(b.id)![0] + 1));
    for (const b of grappe) out.set(b.id, [out.get(b.id)![0], n]);
    grappe = [];
  };
  for (const b of tries) {
    if (grappe.length && b.debut >= fin) fermer();
    const pris = new Set(grappe.filter((x) => x.fin > b.debut).map((x) => out.get(x.id)![0]));
    let l = 0;
    while (pris.has(l)) l++;
    out.set(b.id, [l, 1]);
    grappe.push(b);
    fin = Math.max(fin, b.fin);
  }
  if (grappe.length) fermer();
  return out;
}

/** La position verticale d'un bloc, ramenée dans la grille (un rendez-vous de 6 h ou de 22 h reste visible). */
function position(debutMin: number, duree: number) {
  const haut = Math.min(Math.max(debutMin - H0 * 60, 0), (H1 - H0) * 60 - 30);
  const bas = Math.min(Math.max(debutMin + Math.max(duree, 30) - H0 * 60, haut + 30), (H1 - H0) * 60);
  return { top: (haut / 60) * HAUT, height: Math.max(((bas - haut) / 60) * HAUT - 2, 22) };
}

type Glisse = { id: number; jour: string; debutMin: number; duree: number; prise: number; depart: { x: number; y: number }; actif: boolean };
type Message = { ton: "ok" | "ko"; texte: string; sms?: number };

export default function GrillePlanning({ jours, evenements, creneaux, filtre, etatsSms = {} }: { jours: Jour[]; evenements: EvenementPlanning[]; creneaux: CreneauPlanning[]; filtre: number | null; /** L'état du SMS de chaque rendez-vous (src/crm/rdv). */ etatsSms?: Record<number, EtatAffiche> }) {
  const router = useRouter();
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const glisseRef = useRef<Glisse | null>(null);
  const [enCours, setEnCours] = useState<{ id: number; jour: string; debutMin: number } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const corps = useRef<HTMLDivElement | null>(null);
  const heures = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
  const colonnes = { gridTemplateColumns: `56px repeat(${jours.length}, minmax(0, 1fr))` } as CSSProperties;

  // Les couloirs, jour par jour : rendez-vous et créneaux proposés (identifiants négatifs).
  const lanes = useMemo(() => {
    const m = new Map<number, [number, number]>();
    for (const j of jours) {
      const blocs: Bloc[] = [
        ...evenements.filter((e) => e.jour === j.cle && !e.journee).map((e) => ({ id: e.id, debut: e.debutMin, fin: e.debutMin + Math.max(e.duree, 30) })),
        ...creneaux.filter((c) => c.jour === j.cle).map((c) => ({ id: -c.id, debut: c.debutMin, fin: c.debutMin + c.duree })),
      ];
      for (const [k, v] of couloirs(blocs)) m.set(k, v);
    }
    return m;
  }, [jours, evenements, creneaux]);

  /** Le jour et l'heure sous le pointeur, au quart d'heure. */
  function sousLePointeur(x: number, y: number, prise: number, duree: number) {
    const cible = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-jour]");
    if (!cible) return null;
    const r = cible.getBoundingClientRect();
    let min = H0 * 60 + ((y - r.top - prise) / HAUT) * 60;
    min = Math.round(min / PAS) * PAS;
    min = Math.min(Math.max(min, H0 * 60), H1 * 60 - Math.max(duree, PAS));
    return { jour: cible.dataset.jour!, debutMin: min };
  }

  async function poser(g: Glisse) {
    const e = evenements.find((x) => x.id === g.id);
    if (!e || (g.jour === e.jour && g.debutMin === e.debutMin)) return;
    setEnCours({ id: g.id, jour: g.jour, debutMin: g.debutMin });
    try {
      const r = await deplacerRdv(g.id, g.jour, hhmm(g.debutMin));
      if (r.ok) {
        setMessage({
          ton: "ok",
          texte: r.visite
            ? `${e.titre} : visite déplacée à ${heure(g.debutMin)}. Le rappel de la veille suit le nouvel horaire, et l'espace du client est à jour.`
            : `${e.titre} : déplacé à ${heure(g.debutMin)}.`,
          sms: r.visite && r.telephone ? g.id : undefined,
        });
        router.refresh();
      } else setMessage({ ton: "ko", texte: r.erreur });
    } catch {
      setMessage({ ton: "ko", texte: "Le déplacement n'a pas pu être enregistré : réessayez." });
    } finally {
      setEnCours(null);
    }
  }

  const evts = (j: Jour) => evenements.filter((e) => e.jour === j.cle && !e.journee);

  /**
   * Le geste commence sur un bloc, puis se suit au niveau de la fenêtre : le
   * bloc change de colonne pendant le déplacement, il ne peut pas garder le
   * pointeur pour lui. Un geste qui ne bouge pas est un clic : il ouvre le
   * rendez-vous.
   */
  function demarrer(ev: React.PointerEvent<HTMLElement>, e: EvenementPlanning) {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest("a,button,form")) return;
    ev.preventDefault();
    const r = ev.currentTarget.getBoundingClientRect();
    glisseRef.current = { id: e.id, jour: e.jour, debutMin: e.debutMin, duree: e.duree, prise: ev.clientY - r.top, depart: { x: ev.clientX, y: ev.clientY }, actif: false };
    setGlisse(glisseRef.current);
    const bouger = (m: PointerEvent) => {
      const g = glisseRef.current;
      if (!g) return;
      if (!g.actif && Math.hypot(m.clientX - g.depart.x, m.clientY - g.depart.y) <= 6) return;
      const p = sousLePointeur(m.clientX, m.clientY, g.prise, g.duree);
      glisseRef.current = { ...g, ...(p ?? {}), actif: true };
      setGlisse(glisseRef.current);
    };
    const arreter = () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", finir);
      window.removeEventListener("pointercancel", annuler);
    };
    const finir = () => {
      arreter();
      const g = glisseRef.current;
      glisseRef.current = null;
      setGlisse(null);
      if (!g) return;
      if (g.actif) void poser(g);
      else router.push(`/planning/${e.id}`);
    };
    const annuler = () => {
      arreter();
      glisseRef.current = null;
      setGlisse(null);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", finir);
    window.addEventListener("pointercancel", annuler);
  }

  return (
    <>
      {message && (
        <p className={`${s.message} ${message.ton === "ok" ? s.messageOk : s.messageKo}`} role="status">
          <span>{message.texte}</span>
          {message.sms && (
            <button
              type="button"
              onClick={async () => {
                await confirmerParSms(message.sms!);
                setMessage({ ton: "ok", texte: "SMS de confirmation consigné au dossier." });
              }}
            >
              Consigner le SMS de confirmation
            </button>
          )}
          <button type="button" aria-label="Fermer" onClick={() => setMessage(null)}>
            ×
          </button>
        </p>
      )}
      <div className={s.cal}>
        <div className={s.tete} style={colonnes}>
          <span />
          {jours.map((j) => (
            <div key={j.cle} className={`${s.jour} ${j.aujourdhui ? s.aujourdhui : ""}`}>
              <small>{j.nom}</small>
              <b>{j.numero}</b>
              {j.visites > 0 && (
                <a className={s.imprimer} href={`/imprimer/visites?jour=${j.cle}${filtre ? `&com=${filtre}` : ""}`} target="_blank" rel="noopener" title={`Imprimer les ${j.visites} fiche${j.visites > 1 ? "s" : ""} de visite du jour`}>
                  <Ic n="pdf" />
                  {j.visites}
                </a>
              )}
            </div>
          ))}
        </div>
        <div className={s.journee} style={colonnes}>
          <span>Journée</span>
          {jours.map((j) => (
            <div key={j.cle} className={`${s.celluleJournee} ${j.aujourdhui ? s.aujourdhui : ""}`}>
              {evenements
                .filter((e) => e.jour === j.cle && e.journee)
                .map((e) => (
                  <Link key={e.id} href={`/planning/${e.id}`} className={`${s.puceJournee} t-${e.type}`} title={`${e.titre} · journée entière · ${e.commercial}`}>
                    <b>{e.titre}</b>
                    {!filtre && <small>{e.initiales}</small>}
                  </Link>
                ))}
            </div>
          ))}
        </div>
        <div className={s.corps} style={colonnes} ref={corps}>
          <div className={s.heures} style={{ height: (H1 - H0) * HAUT }}>
            {heures.map((h) => (
              <span key={h} style={{ height: HAUT }}>
                {h}h
              </span>
            ))}
          </div>
          {jours.map((j, ij) => (
            <div key={j.cle} data-jour={j.cle} className={`${s.col} ${j.aujourdhui ? s.aujourdhui : ""}`} style={{ height: (H1 - H0) * HAUT, backgroundSize: `100% ${HAUT}px` }}>
              {creneaux
                .filter((c) => c.jour === j.cle)
                .map((c) => {
                  const [l, n] = lanes.get(-c.id) ?? [0, 1];
                  return (
                    <Link
                      key={`p${c.id}`}
                      href={`/dossiers/${c.dossierId}#visite`}
                      className={s.propose}
                      title={`Créneau proposé · ${c.client} · en attente du client`}
                      style={{ ...position(c.debutMin, c.duree), left: `calc(${(l / n) * 100}% + 3px)`, width: `calc(${100 / n}% - 6px)` }}
                    >
                      <b>{heure(c.debutMin)} · proposé</b>
                      <span>
                        {c.client}
                        {!filtre && ` · ${c.initiales}`}
                      </span>
                    </Link>
                  );
                })}
              {evts(j).map((e) => {
                const [l, n] = lanes.get(e.id) ?? [0, 1];
                const deplace = glisse?.actif && glisse.id === e.id ? glisse : enCours?.id === e.id ? enCours : null;
                if (deplace && deplace.jour !== j.cle) return null;
                const pos = position(deplace?.debutMin ?? e.debutMin, e.duree);
                const compact = n > 1;
                const etat = e.etat ? ETATS_VISITE[e.etat] : null;
                return (
                  <article
                    key={e.id}
                    className={`ev t-${e.type} ${e.termine ? "done" : ""} ${s.bloc} ${compact ? s.compact : ""} ${deplace ? s.glisse : ""}`}
                    data-cote={l >= n / 2 || ij === jours.length - 1 ? "droite" : "gauche"}
                    tabIndex={0}
                    title={`${e.titre}${e.lieu ? ` · ${e.lieu}` : ""} · ${e.commercial}${etat ? ` · ${etat.libelle}` : ""}`}
                    style={{ ...pos, left: `calc(${(l / n) * 100}% + 3px)`, right: "auto", width: `calc(${100 / n}% - 6px)` }}
                    onPointerDown={(ev) => demarrer(ev, e)}
                    onKeyDown={(ev) => ev.key === "Enter" && router.push(`/planning/${e.id}`)}
                  >
                    {/* Couloir étroit, au repos : le nom d'abord, puis l'heure et un point de couleur pour l'état. */}
                    {compact && (
                      <span className={s.resume}>
                        <b>{e.titre}</b>
                        <small>
                          {etat && <i className={s.point} data-ton={etat.ton} aria-label={etat.libelle} />}
                          {heure(deplace?.debutMin ?? e.debutMin)}
                          {!filtre && ` · ${e.initiales}`}
                        </small>
                      </span>
                    )}
                    <span className={s.complet}>
                      <span className="ev-top">
                        <span className="ev-time">
                          {heure(deplace?.debutMin ?? e.debutMin)}–{heure((deplace?.debutMin ?? e.debutMin) + e.duree)}
                          <EtatSmsRdv etat={etatsSms[e.id]} compact />
                        </span>
                        <span className="ev-ty">{RDV_TYPES[e.type]}</span>
                      </span>
                      {e.dossierId ? (
                        <Link href={`/dossiers/${e.dossierId}`} className="ev-n" draggable={false}>
                          {e.titre}
                        </Link>
                      ) : (
                        <strong className="ev-n">{e.titre}</strong>
                      )}
                      <span className="ev-a">
                        {e.lieu}
                        {!filtre && ` · ${e.initiales}`}
                      </span>
                      <span className="ev-tags">
                        {etat && <i className={`st ${etat.ton} ${s.etat}`}>{etat.libelle}</i>}
                        {e.dernier && <i className="tag fl">Passer en dernier</i>}
                        {e.rappel && e.rappel.length > 0 && <i className={`tag ${s.rappel}`} title={`Rappel la veille : ${e.rappel.map((x) => (x === "sms" ? "SMS" : "e-mail")).join(" + ")}`}>Rappel J−1</i>}
                      </span>
                      {e.etat === "planifiee" && !e.termine && (
                        <form action={terminerRdv.bind(null, e.id, false)} className={s.terminer}>
                          <button>Terminé ✓</button>
                        </form>
                      )}
                    </span>
                    {deplace && enCours?.id === e.id && <span className={s.enregistrement}>Enregistrement…</span>}
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
