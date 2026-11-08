"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import { marquerAppelFait, remettreAppel, reporterAppel } from "./actions";
import { detailScore, HEURE_REPRISE, ICONE_SOURCE, NOTE_MAX, sourceDe, telAffiche, telLien, trier, type Appel } from "./regles";
import { APPELS_CHANGES, useTri } from "./tri";
import s from "./appels.module.css";

/*
 * La liste des appels, dans le panneau de la barre du haut comme sur la page
 * /appels : pour chaque appel, le client et pourquoi l'appeler, son numéro
 * (un clic pour appeler), depuis quand, la pertinence, le lien vers la
 * demande ou le dossier, et deux gestes — « Fait » (avec une note
 * facultative) et « Plus tard » (demain, ou l'heure choisie).
 *
 * Après un geste, la carte dit ce qui a été noté, puis la liste se relit :
 * le bouton de la barre écoute APPELS_CHANGES (BoutonAppels.tsx).
 */

/** Le même jour à HEURE_REPRISE, n jours plus tard, à l'heure de l'ordinateur (l'équipe est en France). */
function jourA(n: number, heure = HEURE_REPRISE) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(heure, 0, 0, 0);
  return d;
}

/** Les reports proposés en un clic : dans 2 h, demain matin, lundi matin. */
function propositions(): { libelle: string; quand: Date }[] {
  const dans2h = new Date(Date.now() + 2 * 36e5);
  dans2h.setMinutes(Math.ceil(dans2h.getMinutes() / 5) * 5, 0, 0);
  const l = [
    { libelle: "Dans 2 h", quand: dans2h },
    { libelle: `Demain ${HEURE_REPRISE} h`, quand: jourA(1) },
  ];
  const jour = new Date().getDay();
  const jusquaLundi = ((8 - jour) % 7) || 7;
  if (jusquaLundi > 1) l.push({ libelle: `Lundi ${HEURE_REPRISE} h`, quand: jourA(jusquaLundi) });
  return l;
}

/** Une date pour le champ « date et heure » : AAAA-MM-JJTHH:MM, à l'heure locale. */
const pourChamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const niveau = (n: number) => (n >= 70 ? "haut" : n >= 45 ? "moyen" : "bas");

export default function ListeAppels({
  appels,
  utilisateur,
  variante,
  mode = "afaire",
  vide,
  onNaviguer,
}: {
  appels: Appel[];
  utilisateur: number | null;
  variante: "panneau" | "page";
  /** « reportes » : les appels mis à plus tard, rangés par heure de reprise. */
  mode?: "afaire" | "reportes";
  vide?: React.ReactNode;
  /** Un lien suivi (vers la demande, le dossier) : le panneau se referme. */
  onNaviguer?: () => void;
}) {
  const [tri] = useTri(utilisateur);
  const liste = useMemo(() => (mode === "reportes" ? appels : trier(appels, tri)), [appels, tri, mode]);
  if (!liste.length) return <>{vide ?? null}</>;
  return (
    <ol className={s.liste} data-variante={variante}>
      {liste.map((a) => (
        <Carte key={a.cle} appel={a} tri={mode === "reportes" ? null : tri} variante={variante} mode={mode} onNaviguer={onNaviguer} />
      ))}
    </ol>
  );
}

function Carte({
  appel: a,
  tri,
  variante,
  mode,
  onNaviguer,
}: {
  appel: Appel;
  tri: "chrono" | "pertinence" | null;
  variante: "panneau" | "page";
  mode: "afaire" | "reportes";
  onNaviguer?: () => void;
}) {
  const [forme, setForme] = useState<null | "fait" | "report">(null);
  const [note, setNote] = useState("");
  const [choisi, setChoisi] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [fini, setFini] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const source = sourceDe(a.source)!;
  const tel = telAffiche(a.telephone);
  const lien = telLien(a.telephone);

  const agir = (geste: () => Promise<{ ok: boolean; message: string }>) =>
    demarrer(async () => {
      setErreur(null);
      const r = await geste().catch(() => ({ ok: false, message: "Le geste n'a pas abouti : réessayez dans un instant." }));
      if (!r.ok) {
        setErreur(r.message);
        return;
      }
      setForme(null);
      setFini(r.message);
      // Le temps de lire ce qui a été noté, puis la liste se relit (le bouton de la barre écoute).
      setTimeout(() => window.dispatchEvent(new Event(APPELS_CHANGES)), 1100);
    });

  if (fini) {
    return (
      <li className={s.fini} role="status">
        <span>
          <Icone nom="coche" taille={15} />
        </span>
        {fini}
      </li>
    );
  }

  const ouvrir = (f: "fait" | "report") => {
    setErreur(null);
    setForme((x) => (x === f ? null : f));
    if (f === "report" && !choisi) setChoisi(pourChamp(jourA(1)));
  };

  return (
    <li className={s.carte} data-source={a.source} data-ouverte={forme ? "" : undefined} aria-busy={enCours || undefined}>
      <span className={s.pictogramme} data-source={a.source} aria-hidden>
        <Icone nom={ICONE_SOURCE[a.source]} taille={variante === "page" ? 19 : 17} />
      </span>

      <div className={s.tete}>
        <b className={s.client}>{a.client}</b>
        <p className={s.motif}>{a.motif}</p>
      </div>

      <div className={s.corps}>
        {a.detail && <p className={s.detail}>{a.detail}</p>}
        <div className={s.puces}>
          <span className={s.puce} data-source={a.source}>
            {source.court}
          </span>
          {a.marque && <span className={`${s.puce} ${s.neutre}`}>{a.marque}</span>}
          {mode === "reportes" && a.reporteLibelle ? (
            <span className={`${s.puce} ${s.reporte}`}>
              <Icone nom="sablier" taille={12} /> Reporté à {a.reporteLibelle}
            </span>
          ) : (
            <span className={s.quand} title={`À appeler depuis ${a.echeanceLibelle}`}>
              <Icone nom="horloge" taille={13} /> {a.depuis}
            </span>
          )}
        </div>
      </div>

      <div className={s.tel}>
        {lien && tel ? (
          <a href={lien} className={s.appeler} title={`Appeler ${a.client}`}>
            <Icone nom="telephone" taille={15} />
            <span>{tel}</span>
          </a>
        ) : (
          <span className={s.sansTel}>Pas de numéro</span>
        )}
      </div>

      <div className={s.gestes}>
        {mode === "reportes" ? (
          <button type="button" className={s.geste} disabled={enCours} onClick={() => agir(() => remettreAppel(a.cle))}>
            Maintenant
          </button>
        ) : (
          <button type="button" className={s.geste} aria-expanded={forme === "report"} disabled={enCours} onClick={() => ouvrir("report")}>
            <Icone nom="sablier" taille={14} />
            Plus tard
          </button>
        )}
        <button type="button" className={`${s.geste} ${s.fait}`} aria-expanded={forme === "fait"} disabled={enCours} onClick={() => ouvrir("fait")}>
          <Icone nom="coche" taille={15} />
          Fait
        </button>
        <Link href={a.lien.href} className={s.ouvrir} title={a.lien.libelle} aria-label={`${a.lien.libelle} : ${a.client}`} onClick={onNaviguer}>
          <Icone nom="fleche" taille={16} />
        </Link>
      </div>

      <span
        className={s.score}
        data-niveau={niveau(a.score.total)}
        data-avant={tri === "pertinence" || undefined}
        title={`Pertinence ${a.score.total}/100 — ${detailScore(a.score)}`}
        aria-label={`Pertinence ${a.score.total} sur 100`}
      >
        <span className={s.anneau} style={{ "--v": a.score.total } as React.CSSProperties}>
          <b>{a.score.total}</b>
        </span>
        {variante === "page" && <small>pertinence</small>}
      </span>

      {forme === "fait" && (
        <form
          className={s.forme}
          onSubmit={(e) => {
            e.preventDefault();
            agir(() => marquerAppelFait(a.cle, note));
          }}
        >
          <label className={s.formeTitre} htmlFor={`note-${a.cle}`}>
            Appel passé à {a.client}
            {a.source === "rappel" && <small> · le rappel passera à « rappelé »</small>}
          </label>
          <div className={s.formeLigne}>
            <input
              id={`note-${a.cle}`}
              type="text"
              className={s.champ}
              value={note}
              maxLength={NOTE_MAX}
              placeholder="Une note, si besoin : ce qui a été dit, la suite…"
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
            <button type="submit" className={`${s.valider} ${s.validerVert}`} disabled={enCours}>
              {enCours ? "Un instant…" : "Noter l'appel"}
            </button>
          </div>
          {erreur && <p className={s.erreur}>{erreur}</p>}
        </form>
      )}

      {forme === "report" && (
        <div className={s.forme}>
          <p className={s.formeTitre}>Rappeler {a.client} plus tard</p>
          <div className={s.propositions}>
            {propositions().map((p) => (
              <button key={p.libelle} type="button" className={s.proposition} disabled={enCours} onClick={() => agir(() => reporterAppel(a.cle, p.quand.toISOString()))}>
                {p.libelle}
              </button>
            ))}
          </div>
          <form
            className={s.formeLigne}
            onSubmit={(e) => {
              e.preventDefault();
              const d = new Date(choisi);
              if (!Number.isFinite(d.getTime())) return setErreur("Choisissez une date et une heure.");
              agir(() => reporterAppel(a.cle, d.toISOString()));
            }}
          >
            <input type="datetime-local" className={s.champ} value={choisi} min={pourChamp(new Date())} aria-label="Date et heure du rappel" onChange={(e) => setChoisi(e.target.value)} />
            <button type="submit" className={s.valider} disabled={enCours || !choisi}>
              {enCours ? "Un instant…" : "Reporter"}
            </button>
          </form>
          {erreur && <p className={s.erreur}>{erreur}</p>}
        </div>
      )}
    </li>
  );
}
