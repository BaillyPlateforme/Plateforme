"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Ic } from "@/crm/lib/icons";
import { ETATS_VISITE, estVisite } from "@/crm/visites/cycle";
import { terminerRdv } from "@/crm/actions";
import { confirmerParSms, deplacerRdv } from "./actions";
import type { CreneauPlanning, EvenementPlanning } from "./donnees";
import { couloirs, H0, H1, heure, hhmm, position as placer, type Bloc } from "./grille";
import { TYPES_RDV } from "./types-rdv";
import { phraseConfirmationOubliee } from "./planificateur/regles";
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
 * client) avant d'enregistrer.
 *
 * Un clic sur un rendez-vous ouvre sa petite fenêtre : quand, qui, où, où en
 * est la visite, et trois gestes — « Modifier » (le planificateur en
 * modification, /planning/<id>), « Déplacer » (le prochain clic dans la
 * grille le pose, sans glisser), « Ouvrir le dossier ». Le glisser-déposer
 * reste. Échap ferme la fenêtre ou abandonne le déplacement.
 *
 * Les blocs qui se chevauchent se partagent la colonne en couloirs ; quand
 * un couloir est étroit, le bloc ne garde que l'heure, le nom et l'état, et
 * s'élargit au survol (ou au focus) pour se lire en entier.
 */

const HAUT = 52;
const PAS = 15;
const LARGEUR_FENETRE = 300;
const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

type Jour = { cle: string; nom: string; numero: number; aujourdhui: boolean; visites: number };

const position = (debutMin: number, duree: number) => placer(debutMin, duree, HAUT);
/** « 2026-11-10 » → « Mardi 10 novembre ». */
const jourLong = (cle: string) => {
  const d = new Date(`${cle}T12:00:00Z`);
  const t = `${JOURS_FR[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS_FR[d.getUTCMonth()]}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Glisse = { id: number; jour: string; debutMin: number; duree: number; prise: number; depart: { x: number; y: number }; actif: boolean };
type Message = { ton: "ok" | "ko"; texte: string; sms?: number };
/** La petite fenêtre d'un rendez-vous, posée à côté de son bloc (coordonnées de l'écran). */
type Fenetre = { id: number; left: number; top: number };
/** « Déplacer » : le rendez-vous suit le pointeur dans la grille, le prochain clic le pose. */
type Viser = { id: number; jour: string | null; debutMin: number };

export default function GrillePlanning({ jours, evenements, creneaux, filtre, etatsSms = {} }: { jours: Jour[]; evenements: EvenementPlanning[]; creneaux: CreneauPlanning[]; filtre: number | null; /** L'état du SMS de chaque rendez-vous (src/crm/rdv). */ etatsSms?: Record<number, EtatAffiche> }) {
  const router = useRouter();
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const glisseRef = useRef<Glisse | null>(null);
  const [enCours, setEnCours] = useState<{ id: number; jour: string; debutMin: number } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [fenetre, setFenetre] = useState<Fenetre | null>(null);
  const [viser, setViser] = useState<Viser | null>(null);
  const fenetreRef = useRef<HTMLDivElement | null>(null);
  const corps = useRef<HTMLDivElement | null>(null);

  // La fenêtre se ferme à Échap, à un clic ailleurs, quand la page défile ; Échap abandonne aussi « Déplacer ».
  useEffect(() => {
    if (!fenetre && !viser) return;
    const touche = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      setFenetre(null);
      setViser(null);
    };
    const ailleurs = (ev: PointerEvent) => {
      if (fenetreRef.current && !fenetreRef.current.contains(ev.target as Node)) setFenetre(null);
    };
    const fermer = () => setFenetre(null);
    // Un défilement encore en cours au moment du clic (fin d'un défilement doux) ne referme pas la fenêtre aussitôt.
    const ouverteLe = Date.now();
    const defile = () => {
      if (Date.now() - ouverteLe > 250) setFenetre(null);
    };
    window.addEventListener("keydown", touche);
    document.addEventListener("pointerdown", ailleurs, true);
    window.addEventListener("scroll", defile, true);
    window.addEventListener("resize", fermer);
    return () => {
      window.removeEventListener("keydown", touche);
      document.removeEventListener("pointerdown", ailleurs, true);
      window.removeEventListener("scroll", defile, true);
      window.removeEventListener("resize", fermer);
    };
  }, [fenetre, viser]);

  // À l'ouverture, le focus va sur « Modifier » (sans faire défiler : cela fermerait la fenêtre).
  const fenetreId = fenetre?.id ?? null;
  useEffect(() => {
    if (fenetreId != null) fenetreRef.current?.querySelector<HTMLElement>("[data-premier]")?.focus({ preventScroll: true });
  }, [fenetreId]);

  /** Ouvre la petite fenêtre d'un rendez-vous à côté de son bloc, du côté où elle tient. */
  function ouvrir(e: EvenementPlanning, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const tient = r.right + 10 + LARGEUR_FENETRE <= window.innerWidth - 8;
    const left = tient ? r.right + 10 : Math.max(8, r.left - 10 - LARGEUR_FENETRE);
    const top = Math.min(Math.max(8, r.top), Math.max(8, window.innerHeight - 340));
    setFenetre({ id: e.id, left, top });
  }
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

  async function poser(g: { id: number; jour: string; debutMin: number }) {
    const e = evenements.find((x) => x.id === g.id);
    if (!e || (g.jour === e.jour && g.debutMin === e.debutMin)) return;
    setEnCours({ id: g.id, jour: g.jour, debutMin: g.debutMin });
    try {
      const r = await deplacerRdv(g.id, g.jour, hhmm(g.debutMin));
      if (r.ok) {
        const quand = `${g.jour !== e.jour ? `${jourLong(g.jour).toLowerCase()}, ` : ""}${heure(g.debutMin)}`;
        setMessage({
          ton: "ok",
          texte: r.visite
            ? `${e.titre} : visite déplacée (${quand}). Le rappel de la veille suit le nouvel horaire, et l'espace du client est à jour.${
                r.oublie ? ` ${phraseConfirmationOubliee(r.oublie)}` : ""
              }`
            : `${e.titre} : déplacé (${quand}).`,
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
   * pointeur pour lui. Un geste qui ne bouge pas est un clic : il ouvre la
   * petite fenêtre du rendez-vous.
   */
  function demarrer(ev: React.PointerEvent<HTMLElement>, e: EvenementPlanning) {
    if (viser || ev.button !== 0 || (ev.target as HTMLElement).closest("a,button,form")) return;
    ev.preventDefault();
    const bloc = ev.currentTarget;
    const r = bloc.getBoundingClientRect();
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
      else ouvrir(e, bloc);
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

  const evFenetre = fenetre ? evenements.find((x) => x.id === fenetre.id) : undefined;
  const evViser = viser ? evenements.find((x) => x.id === viser.id) : undefined;

  /** « Déplacer » : le bloc suit le pointeur dans la grille, au quart d'heure. */
  function suivre(ev: React.PointerEvent<HTMLElement>) {
    if (!viser || !evViser) return;
    const p = sousLePointeur(ev.clientX, ev.clientY, 0, evViser.duree);
    if (p && (p.jour !== viser.jour || p.debutMin !== viser.debutMin)) setViser({ ...viser, ...p });
  }
  /** Le clic qui pose le rendez-vous visé. */
  function poserVise() {
    if (!viser?.jour) return;
    const v = { id: viser.id, jour: viser.jour, debutMin: viser.debutMin };
    setViser(null);
    void poser(v);
  }

  return (
    <>
      {viser && evViser && (
        <p className={`${s.message} ${s.messageViser}`} role="status">
          <Ic n="cal" />
          <span>
            Déplacer <b>{evViser.titre}</b> : cliquez le nouveau créneau dans la grille.
          </span>
          <button type="button" onClick={() => setViser(null)}>
            Annuler
          </button>
        </p>
      )}
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
      <div className={`${s.cal} ${viser ? s.viser : ""}`}>
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
                  <Link key={e.id} href={`/planning/${e.id}?retour=planning`} className={`${s.puceJournee} t-${e.type}`} title={`${e.titre} · journée entière · ${e.commercial}`}>
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
            <div
              key={j.cle}
              data-jour={j.cle}
              className={`${s.col} ${j.aujourdhui ? s.aujourdhui : ""}`}
              style={{ height: (H1 - H0) * HAUT, backgroundSize: `100% ${HAUT}px` }}
              onPointerMove={viser ? suivre : undefined}
              onClick={viser ? poserVise : undefined}
            >
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
                const vise = viser?.id === e.id && viser.jour ? { jour: viser.jour, debutMin: viser.debutMin } : null;
                const deplace = glisse?.actif && glisse.id === e.id ? glisse : vise ?? (enCours?.id === e.id ? enCours : null);
                if (deplace && deplace.jour !== j.cle) return null;
                const pos = position(deplace?.debutMin ?? e.debutMin, e.duree);
                const compact = n > 1;
                const etat = e.etat ? ETATS_VISITE[e.etat] : null;
                // Les couleurs du planning (réunion du 23/09) : une visite faite change d'habit, un devis établi pose un
                // petit ticket vert dans le coin, une visite sans suite est barrée (crm.css ; légende : Legende.tsx).
                const devis = e.devisEtabli && estVisite(e.type);
                const type = TYPES_RDV[e.type];
                return (
                  <article
                    key={e.id}
                    className={`ev t-${e.type} ${e.fait ? "fait" : ""} ${devis ? "devis" : ""} ${e.etat === "sans_suite" ? "sans-suite" : ""} ${s.bloc} ${compact ? s.compact : ""} ${deplace ? s.glisse : ""} ${fenetre?.id === e.id ? s.ouvert : ""} ${vise ? s.vise : ""}`}
                    data-cote={l >= n / 2 || ij === jours.length - 1 ? "droite" : "gauche"}
                    tabIndex={0}
                    title={`${type.long} · ${e.titre}${e.lieu ? ` · ${e.lieu}` : ""} · ${e.commercial}${etat ? ` · ${etat.libelle}` : ""}`}
                    style={{ ...pos, left: `calc(${(l / n) * 100}% + 3px)`, right: "auto", width: `calc(${100 / n}% - 6px)` }}
                    onPointerDown={(ev) => demarrer(ev, e)}
                    onKeyDown={(ev) => {
                      if (ev.key !== "Enter" || ev.target !== ev.currentTarget) return;
                      ev.preventDefault();
                      ouvrir(e, ev.currentTarget);
                    }}
                  >
                    {devis && (
                      <i className="ticket-devis" role="img" aria-label="Devis établi" title="Devis établi">
                        <Ic n="check" />
                      </i>
                    )}
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
                        <span className="ev-ty" title={e.fait ? `${type.long} faite` : type.long}>
                          <Ic n={e.fait ? "check" : type.icone} />
                          <span className={s.typeTexte}>{e.fait ? "Faite" : type.court}</span>
                        </span>
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
                        {/* L'état se lit à l'habit du bloc ; seule la visite sans suite garde sa pastille. */}
                        {e.etat === "sans_suite" && etat && <i className={`st ${etat.ton} ${s.etat}`}>{etat.libelle}</i>}
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

      {/* La petite fenêtre d'un rendez-vous : quand, qui, où, et les trois gestes. */}
      {fenetre && evFenetre && (
        <FenetreRdv
          e={evFenetre}
          sms={etatsSms[evFenetre.id]}
          refFenetre={fenetreRef}
          style={{ left: fenetre.left, top: fenetre.top, width: LARGEUR_FENETRE }}
          fermer={() => setFenetre(null)}
          deplacer={() => {
            setFenetre(null);
            setViser({ id: evFenetre.id, jour: null, debutMin: evFenetre.debutMin });
          }}
        />
      )}
    </>
  );
}

/** « 570 » → « 9 h 30 ». */
const hFr = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;

function FenetreRdv({
  e,
  sms,
  refFenetre,
  style,
  fermer,
  deplacer,
}: {
  e: EvenementPlanning;
  sms?: EtatAffiche;
  refFenetre: React.RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  fermer: () => void;
  deplacer: () => void;
}) {
  const type = TYPES_RDV[e.type];
  const etat = e.etat ? ETATS_VISITE[e.etat] : null;
  const visite = estVisite(e.type) && !!e.dossierId;
  return (
    <div ref={refFenetre} className={`${s.pop} t-${e.type}`} style={style} role="dialog" aria-label={`${type.long} · ${e.titre}`}>
      <div className={s.popTete}>
        <i className={s.popIcone} aria-hidden>
          <Ic n={e.fait ? "check" : type.icone} />
        </i>
        <div className={s.popTitre}>
          <small>{e.fait && visite ? `${type.long} · faite` : type.long}</small>
          <b>{e.titre}</b>
        </div>
        <button type="button" className={s.popFermer} aria-label="Fermer" onClick={fermer}>
          ×
        </button>
      </div>
      <ul className={s.popInfos}>
        <li>
          <Ic n="cal" />
          {jourLong(e.jour)} · {e.journee ? "journée entière" : `${hFr(e.debutMin)} – ${hFr(e.debutMin + e.duree)}`}
        </li>
        <li>
          <Ic n="users" />
          {e.commercial}
        </li>
        {e.lieu && (
          <li title={e.lieu}>
            <Ic n={e.type === "visio" ? "video" : "pin"} />
            <span>{e.lieu}</span>
          </li>
        )}
        {e.ref && (
          <li>
            <Ic n="doc" />
            Dossier {e.ref}
          </li>
        )}
      </ul>
      {(etat || sms || (e.rappel && e.rappel.length > 0)) && (
        <div className={s.popPastilles}>
          {etat && <i className={`st ${etat.ton}`}>{etat.libelle}</i>}
          {sms && (
            <i className={`st ${sms.ton}`} title={sms.detail}>
              {sms.libelle}
            </i>
          )}
          {e.rappel && e.rappel.length > 0 && <i className="st n">Rappel J−1 · {e.rappel.map((x) => (x === "sms" ? "SMS" : "e-mail")).join(" + ")}</i>}
        </div>
      )}
      <div className={s.popGestes}>
        <Link href={`/planning/${e.id}?retour=planning`} className={s.popModifier} data-premier>
          <Ic n="pen" />
          Modifier
        </Link>
        <button type="button" className={s.popGeste} onClick={deplacer}>
          Déplacer
        </button>
        {e.dossierId && (
          <Link href={`/dossiers/${e.dossierId}`} className={s.popGeste}>
            Ouvrir le dossier
          </Link>
        )}
      </div>
      <small className={s.popAstuce}>« Déplacer » : le prochain clic dans la grille le pose. Le glisser-déposer marche aussi.</small>
    </div>
  );
}
