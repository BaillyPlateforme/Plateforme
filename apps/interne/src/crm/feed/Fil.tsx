"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import { detailFeed, suiteFeed } from "./actions";
import type { Detail, Evenement } from "./donnees";
import type { Curseur } from "./sources";
import s from "./feed.module.css";

/*
 * Le fil : les événements du plus récent au plus ancien, par jour, et la
 * suite chargée à la demande — au bouton « Voir plus » ou quand le bas de la
 * liste approche. Un clic sur un événement ouvre son détail, lu à ce
 * moment-là (le texte d'un message n'est jamais dans la page avant).
 */

type EtatDetail = { etat: "charge" } | { etat: "pret"; detail: Detail | null };

export default function Fil({
  initial,
  suite: suiteInitiale,
  params,
  filtre,
}: {
  initial: Evenement[];
  suite: Curseur | null;
  /** Les filtres de l'adresse, renvoyés tels quels pour la suite. */
  params: Record<string, string>;
  /** Un filtre est-il actif (pour le texte de la liste vide) ? */
  filtre: boolean;
}) {
  const [evenements, setEvenements] = useState(initial);
  const [suite, setSuite] = useState(suiteInitiale);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [ouverts, setOuverts] = useState<Record<string, EtatDetail>>({});
  const bas = useRef<HTMLDivElement>(null);

  // De nouveaux filtres : une nouvelle liste (le serveur a rendu la première page).
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setEvenements(initial);
    setSuite(suiteInitiale);
    setOuverts({});
    setErreur(null);
  }

  const charger = useCallback(() => {
    if (!suite || enCours) return;
    demarrer(async () => {
      try {
        const r = await suiteFeed(params, suite);
        setEvenements((avant) => {
          const vus = new Set(avant.map((e) => e.cle));
          return [...avant, ...r.evenements.filter((e) => !vus.has(e.cle))];
        });
        setSuite(r.suite);
        setErreur(null);
      } catch {
        setErreur("La suite n’a pas pu être chargée.");
      }
    });
  }, [suite, enCours, params]);

  // Le bas de la liste approche : la suite se charge d'elle-même.
  useEffect(() => {
    const el = bas.current;
    if (!el || !suite) return;
    const o = new IntersectionObserver((entrees) => entrees.some((x) => x.isIntersecting) && charger(), { rootMargin: "600px 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, [suite, charger]);

  const basculer = (e: Evenement) => {
    if (ouverts[e.cle]) {
      setOuverts((o) => {
        const reste = { ...o };
        delete reste[e.cle];
        return reste;
      });
      return;
    }
    setOuverts((o) => ({ ...o, [e.cle]: { etat: "charge" } }));
    detailFeed(e.src, e.id)
      .then((detail) => setOuverts((o) => (o[e.cle] ? { ...o, [e.cle]: { etat: "pret", detail } } : o)))
      .catch(() => setOuverts((o) => (o[e.cle] ? { ...o, [e.cle]: { etat: "pret", detail: null } } : o)));
  };

  if (!evenements.length)
    return (
      <div className={s.vide}>
        <span className={s.videIcone}>
          <Icone nom="fil" taille={26} />
        </span>
        <p className={s.videTitre}>Rien à montrer{filtre ? " pour ces filtres" : " pour l’instant"}.</p>
        <p>Chaque geste de l’équipe, chaque action d’un client et chaque envoi apparaît ici dès qu’il a lieu.</p>
      </div>
    );

  // Les jours, dans l'ordre du fil.
  const jours: { jour: string; libelle: string; sous: string | null; items: Evenement[] }[] = [];
  for (const e of evenements) {
    const dernier = jours[jours.length - 1];
    if (dernier && dernier.jour === e.jour) dernier.items.push(e);
    else jours.push({ jour: e.jour, libelle: e.jourLibelle, sous: e.jourSous, items: [e] });
  }

  return (
    <div className={s.fil}>
      {jours.map((j) => (
        <section key={j.jour} className={s.jour} aria-label={j.libelle}>
          <h2 className={s.jourTitre}>
            <span>{j.libelle}</span>
            {j.sous && <small>{j.sous}</small>}
          </h2>
          <ol className={s.liste}>
            {j.items.map((e) => {
              const o = ouverts[e.cle];
              return (
                <li
                  key={e.cle}
                  className={s.item}
                  data-ton={e.ton}
                  data-ouvert={o ? "" : undefined}
                  onClick={(ev) => {
                    // Les liens de la ligne mènent à leur page ; le reste ouvre ou ferme le détail.
                    if ((ev.target as HTMLElement).closest("a, button")) return;
                    basculer(e);
                  }}
                >
                  <span className={s.heure}>{e.heure ?? "—"}</span>
                  <span className={s.pastille} aria-hidden>
                    <Icone nom={e.icone} taille={16} />
                  </span>
                  <div className={s.corps}>
                    <button type="button" className={s.texte} aria-expanded={!!o} onClick={() => basculer(e)}>
                      {e.texte}
                    </button>
                    <div className={s.meta}>
                      <Acteur acteur={e.acteur} />
                      {e.contexte && (
                        <Link href={e.contexte.href} className={s.contexte} title={e.contexte.sous ?? undefined}>
                          <b>{e.contexte.libelle}</b>
                          {e.contexte.sous && e.contexte.sous !== e.acteur.nom && <span>{e.contexte.sous}</span>}
                        </Link>
                      )}
                      {e.statut && (
                        <span className={s.statut} data-ton={e.statut.ton}>
                          {e.statut.libelle}
                        </span>
                      )}
                    </div>
                    {o && <PanneauDetail etat={o} lien={e.lien} />}
                  </div>
                  {e.lien ? (
                    <Link href={e.lien.href} className={s.ouvrir} title={e.lien.libelle} aria-label={e.lien.libelle}>
                      <Icone nom="fleche" taille={15} />
                    </Link>
                  ) : (
                    <span className={s.chevron} aria-hidden>
                      <Icone nom="chevron" taille={15} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <div ref={bas} className={s.suite}>
        {erreur && <p className={s.erreur}>{erreur}</p>}
        {suite ? (
          <button type="button" className={s.voirPlus} onClick={charger} disabled={enCours}>
            {enCours ? "Chargement…" : "Voir plus"}
          </button>
        ) : (
          <p className={s.fin}>C’est le début du fil.</p>
        )}
      </div>
    </div>
  );
}

function Acteur({ acteur }: { acteur: Evenement["acteur"] }) {
  if (acteur.type === "auto")
    return (
      <span className={s.acteur} data-type="auto">
        <i>
          <Icone nom="reglages" taille={12} />
        </i>
        Automatique
      </span>
    );
  if (acteur.type === "client")
    return (
      <span className={s.acteur} data-type="client">
        <em>Client</em>
        {acteur.nom}
      </span>
    );
  return (
    <span className={s.acteur} data-type="staff">
      <i>{acteur.initiales}</i>
      {acteur.nom}
    </span>
  );
}

function PanneauDetail({ etat, lien }: { etat: EtatDetail; lien: Evenement["lien"] }) {
  if (etat.etat === "charge") return <div className={s.detail} data-charge="">Chargement du détail…</div>;
  const d = etat.detail;
  if (!d) return <div className={s.detail}>Le détail n’est plus disponible : l’élément a peut-être été supprimé depuis.</div>;
  return (
    <div className={s.detail}>
      {d.lignes.length > 0 && (
        <dl className={s.champs}>
          {d.lignes.map((l, i) => (
            <div key={`${l.libelle}-${i}`}>
              <dt>{l.libelle}</dt>
              <dd>{l.valeur}</dd>
            </div>
          ))}
        </dl>
      )}
      {d.extrait && (
        <figure className={s.extrait}>
          <figcaption>{d.extrait.titre}</figcaption>
          <blockquote>{d.extrait.texte}</blockquote>
        </figure>
      )}
      {(d.liens.length > 0 || lien) && (
        <div className={s.liens}>
          {lien && !d.liens.some((x) => x.href === lien.href) && <Link href={lien.href}>{lien.libelle} →</Link>}
          {d.liens.map((x) => (
            <Link key={x.href} href={x.href}>
              {x.libelle} →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
