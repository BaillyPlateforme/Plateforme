"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icone } from "@/ui/icones";
import { eur, m3 } from "@/crm/lib/format";
import { activitesDemande } from "./actions";
import { NOM_ETAPE } from "./etapes";
import type { Activite, LigneDemande, Tri } from "./liste-commun";
import PanneauDemande from "./PanneauDemande";
import Radar from "./Radar";
import s from "./liste-detail.module.css";

/*
 * Demandes › Top demandes et Demandes › Feed : une liste à gauche, le détail
 * de la demande choisie à droite (demande de David, 08/11/2026 : « une liste
 * avec les meilleurs éléments mis en avant, dont la top demande, et à droite
 * un diagramme et les infos en dessous » ; « le feed c'est la même chose mais
 * par ordre d'historique »). Un seul composant, deux ordres :
 *
 *  - potentiel (Top demandes) : la n° 1, « Top demande », en vedette ; les
 *    n° 2 et 3 marquées d'une médaille ; puis les autres, en lignes simples ;
 *  - historique (Feed) : les plus récemment reçues d'abord, par jour
 *    (« Aujourd'hui », « Hier », la date), chacune avec sa dernière activité.
 *
 * Un clic choisit une demande ; ↑ et ↓ passent à la voisine. Le choix vit
 * dans l'adresse (?sel=<id>) ; sans choix, la première. Le panneau de droite
 * reste à l'écran (PanneauDemande) : l'araignée en couleur, les infos, les
 * dernières activités (lues à la demande), et les gestes.
 */

const RECUE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

const niveau = (p: number | null) => (p == null ? "vide" : p >= 70 ? "haut" : p >= 40 ? "moyen" : "bas");

export default function ListeDetail({
  lignes,
  tri,
  selection,
  activitesInitiales,
  vide,
}: {
  lignes: LigneDemande[];
  tri: Tri;
  /** La demande choisie dans l'adresse (?sel=), sinon la première. */
  selection: string | null;
  /** Les dernières activités de la demande choisie, lues par la page. */
  activitesInitiales: Record<string, Activite[]>;
  /** Le texte d'une liste vide. */
  vide: string;
}) {
  const [sel, setSel] = useState<string | null>(selection);
  const courante = lignes.find((l) => l.demande.id === sel) ?? lignes[0] ?? null;
  const [activites, setActivites] = useState<Record<string, Activite[]>>(activitesInitiales);
  const [erreurs, setErreurs] = useState<Record<string, boolean>>({});
  const refs = useRef(new Map<string, HTMLElement>());

  const choisir = useCallback((id: string) => {
    setSel(id);
    const u = new URL(window.location.href);
    u.searchParams.set("sel", id);
    window.history.replaceState(null, "", `${u.pathname}${u.search}`);
    refs.current.get(id)?.scrollIntoView({ block: "nearest" });
  }, []);

  // Les dernières activités de la demande choisie, lues une fois, gardées.
  const idCourant = courante?.demande.id ?? null;
  const connues = idCourant ? activites[idCourant] : undefined;
  useEffect(() => {
    if (!idCourant || connues) return;
    let annule = false;
    activitesDemande(idCourant)
      .then((a) => !annule && setActivites((x) => ({ ...x, [idCourant]: a })))
      .catch(() => !annule && setErreurs((x) => ({ ...x, [idCourant]: true })));
    return () => {
      annule = true;
    };
  }, [idCourant, connues]);

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = lignes.findIndex((l) => l.demande.id === courante?.demande.id);
    const j = Math.max(0, Math.min(lignes.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    if (lignes[j]) choisir(lignes[j].demande.id);
  };

  if (!lignes.length) return <p className={s.videListe}>{vide}</p>;

  const rendre = (l: LigneDemande, i: number) => {
    const d = l.demande;
    const choisie = d.id === courante?.demande.id;
    const proprietes = {
      ref: (el: HTMLElement | null) => {
        if (el) refs.current.set(d.id, el);
        else refs.current.delete(d.id);
      },
      role: "option" as const,
      "aria-selected": choisie,
      onClick: () => choisir(d.id),
    };
    const chips = (
      <span className={s.chips}>
        {d.estimation != null && <span className={s.chip}>{eur(d.estimation)}</span>}
        {d.volume != null && d.volume > 0 && <span className={s.chip}>{m3(d.volume)}</span>}
      </span>
    );
    const etape = (
      <span className={s.etape} data-etape={l.etape}>
        {l.etape === "dossier" && d.dossier ? `Dossier ${d.dossier.ref}` : NOM_ETAPE[l.etape]}
      </span>
    );
    const score = (
      <span className={s.score} data-niveau={niveau(d.potentiel)} title="Potentiel, sur 100">
        {d.potentiel ?? "—"}
      </span>
    );
    const trajet = `${d.depart ?? "?"} → ${d.arrivee ?? "?"}`;

    // La n° 1 de Top demandes : en vedette.
    if (tri === "potentiel" && i === 0) {
      return (
        <div key={d.id} {...proprietes} className={s.vedette}>
          <div className={s.vedetteTexte}>
            <p className={s.vedetteTitre}>
              <span className={s.medaille} data-rang="1" aria-hidden>
                1
              </span>
              Top demande
            </p>
            <p className={s.vedetteNom}>{d.client}</p>
            <p className={s.sous}>
              {trajet} · reçue le {RECUE.format(new Date(d.recueLe))}
            </p>
            <div className={s.vedetteBas}>
              {etape}
              {chips}
            </div>
          </div>
          <div className={s.vedetteDroite}>
            <span className={s.scoreGrand} data-niveau={niveau(d.potentiel)} title="Potentiel, sur 100">
              {d.potentiel ?? "—"}
              <small>/100</small>
            </span>
            <Radar araignee={l.araignee} taille={96} />
          </div>
        </div>
      );
    }

    const medaille = tri === "potentiel" && i < 3;
    return (
      <div key={d.id} {...proprietes} className={s.ligne} data-podium={medaille || undefined}>
        <span className={medaille ? s.medaille : s.rang} data-rang={medaille ? i + 1 : undefined}>
          {tri === "potentiel" ? i + 1 : <Icone nom={d.source === "email" ? "courrier" : "globe"} taille={14} />}
        </span>
        <span className={s.milieu}>
          <span className={s.haut}>
            <b className={s.nom}>{d.client}</b>
            {chips}
          </span>
          <span className={s.sous}>
            {trajet} · reçue le {RECUE.format(new Date(d.recueLe))}
          </span>
          {tri === "historique" && l.derniere && (
            <span className={s.derniere}>
              <Icone nom="horloge" taille={12} />
              <span>
                {l.derniere.texte} · {l.derniere.ilYa}
              </span>
            </span>
          )}
        </span>
        <span className={s.droite}>
          {score}
          {etape}
        </span>
      </div>
    );
  };

  // Le Feed : des titres de jour entre les lignes.
  const contenu: React.ReactNode[] = [];
  let jour: string | null = null;
  lignes.forEach((l, i) => {
    if (tri === "historique" && l.jour && l.jour.cle !== jour) {
      jour = l.jour.cle;
      contenu.push(
        <p key={`j${jour}`} className={s.jour} role="presentation">
          <b>{l.jour.libelle}</b>
          {l.jour.sous && <span>{l.jour.sous}</span>}
        </p>,
      );
    }
    contenu.push(rendre(l, i));
  });

  return (
    <div className={s.cadre}>
      <div className={s.liste} role="listbox" tabIndex={0} aria-label={tri === "potentiel" ? "Demandes classées par potentiel" : "Demandes, les plus récentes d'abord"} onKeyDown={clavier}>
        {contenu}
      </div>
      {courante && <PanneauDemande key={courante.demande.id} ligne={courante} activites={activites[courante.demande.id] ?? null} erreur={!!erreurs[courante.demande.id]} />}
    </div>
  );
}
