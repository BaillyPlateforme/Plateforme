"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { Picto } from "./Picto";
import type { BoutonBarre, FenetreFiche, Geste, Ligne, Memo, Onglet, Outil, SectionFiche } from "./types";
import s from "./fiche.module.css";

/*
 * La fiche du dossier façon Créagidem, en version moderne : sous le bandeau
 * commun, une barre (Fiche, Adresses, Inventaire, Suivi, Espace client,
 * Agenda, ordre Chrono / Anti, Tout déplier, Rafraîchir), puis les sections
 * repliables — Déménagements, Garde-meubles, Services, Commun —, chacune avec
 * sa barre d'outils constante, ses onglets à compteur et leurs tableaux.
 *
 * Un clic sur une ligne la sélectionne ; la barre d'outils agit sur elle
 * (flèches haut et bas pour changer de ligne, Entrée ou double-clic pour
 * « Modifier »). Un outil grisé dit pourquoi au survol et au clic.
 *
 * Gardé dans le navigateur (localStorage) : les sections ouvertes et l'ordre
 * des listes, pour toutes les fiches ; l'onglet de chaque section, par
 * dossier. Une ancre (#visite, #espace-client, #commun-reglements…) ouvre
 * la section et l'onglet voulus.
 */

// --- Le stockage du navigateur, lu sans écart d'hydratation -----------------------------------------

const memoire = new Map<string, string>();
const EVENEMENT = "bailly-fiche";
function lireBrut(cle: string): string | null {
  if (memoire.has(cle)) return memoire.get(cle)!;
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}
function abonner(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener("storage", rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener("storage", rappel);
  };
}
function poser(cle: string, valeur: unknown) {
  const brut = JSON.stringify(valeur);
  memoire.set(cle, brut);
  try {
    window.localStorage.setItem(cle, brut);
  } catch {
    // Navigation privée : la mémoire de la page suffit.
  }
  window.dispatchEvent(new Event(EVENEMENT));
}
function useStocke<T>(cle: string): T | null {
  const brut = useSyncExternalStore(abonner, () => lireBrut(cle), () => null);
  return useMemo(() => {
    if (brut == null) return null;
    try {
      return JSON.parse(brut) as T;
    } catch {
      return null;
    }
  }, [brut]);
}

const CLE_SECTIONS = "bailly.fiche.sections";
const CLE_ORDRE = "bailly.fiche.ordre";
const cleOnglets = (dossier: number) => `bailly.fiche.onglets.${dossier}`;

/** Les ancres des pages qui menaient aux cartes de l'ancienne fiche. */
const ANCRES: Record<string, [string, string]> = {
  visite: ["demenagements", "visites"],
  "espace-client": ["commun", "espace"],
  "photos-chantier": ["commun", "documents"],
  facturation: ["commun", "reglements"],
};

// --- Le contexte de la fiche -----------------------------------------------------------------------------

type Ordre = "chrono" | "anti";
type Ctx = {
  ordre: Ordre;
  ouvrirFenetre: (cle: string) => void;
  aller: (section: string, onglet: string, fenetre?: string) => void;
};
const Contexte = createContext<Ctx | null>(null);
const useFiche = () => useContext(Contexte)!;

export default function Fiche({
  dossierId,
  sections,
  fenetres,
  barre,
  identite,
  memo,
  depart,
}: {
  dossierId: number;
  sections: SectionFiche[];
  fenetres: Record<string, FenetreFiche>;
  barre: BoutonBarre[];
  /** Le repère du client, à gauche de la barre (code, segment). */
  identite: React.ReactNode;
  /** Les observations du dossier, sous la barre, quand il y en a. */
  memo?: Memo | null;
  /** L'onglet à montrer d'abord (une page revenue avec un message : visite, espace client…). */
  depart?: { section: string; onglet: string } | null;
}) {
  const router = useRouter();
  const [rafraichit, demarrer] = useTransition();
  const [fenetre, setFenetre] = useState<string | null>(null);

  const ouvertesStockees = useStocke<Record<string, boolean>>(CLE_SECTIONS);
  const ongletsStockes = useStocke<Record<string, string>>(cleOnglets(dossierId));
  const ordre: Ordre = useStocke<Ordre>(CLE_ORDRE) === "anti" ? "anti" : "chrono";

  const ouverte = (x: SectionFiche) => ouvertesStockees?.[x.cle] ?? x.ouverteParDefaut;
  const ongletDe = (x: SectionFiche) => {
    const v = ongletsStockes?.[x.cle];
    return v && x.onglets.some((o) => o.cle === v) ? v : x.ongletParDefaut;
  };
  const toutOuvert = sections.every(ouverte);

  const basculer = (cle: string, valeur: boolean) => poser(CLE_SECTIONS, { ...(lireJson(CLE_SECTIONS) ?? {}), [cle]: valeur });
  const choisirOnglet = useCallback(
    (section: string, onglet: string) => poser(cleOnglets(dossierId), { ...(lireJson(cleOnglets(dossierId)) ?? {}), [section]: onglet }),
    [dossierId],
  );
  const aller = useCallback(
    (section: string, onglet: string, f?: string) => {
      poser(CLE_SECTIONS, { ...(lireJson(CLE_SECTIONS) ?? {}), [section]: true });
      choisirOnglet(section, onglet);
      if (f) setFenetre(f);
      window.requestAnimationFrame(() => document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    [choisirOnglet],
  );

  // Une ancre, ou une page revenue avec un message : la section et l'onglet voulus, ouverts.
  // Les dépendances sont des textes : une mise à jour de la page (après une action) ne refait pas défiler.
  const clesTexte = sections.map((x) => `${x.cle}:${x.onglets.map((o) => o.cle).join(",")}`).join(";");
  const departTexte = depart ? `${depart.section}:${depart.onglet}` : "";
  useEffect(() => {
    const cles = clesTexte.split(";").map((x) => {
      const [sec, ongs] = x.split(":");
      return [sec, ongs.split(",")] as const;
    });
    const suivre = (premiere: boolean) => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      let cible: [string, string] | null = ANCRES[h] ?? null;
      if (!cible) {
        for (const [sec, ongs] of cles) for (const o of ongs) if (h === `${sec}-${o}`) cible = [sec, o];
        if (!cible && cles.some(([sec]) => sec === h)) cible = [h, ""];
      }
      if (cible) {
        const [sec, o] = cible;
        aller(sec, o || (lireJson<Record<string, string>>(cleOnglets(dossierId))?.[sec] ?? cles.find(([x]) => x === sec)![1][0]));
      } else if (premiere && departTexte) {
        const [sec, o] = departTexte.split(":");
        aller(sec, o);
      }
    };
    suivre(true);
    const changement = () => suivre(false);
    window.addEventListener("hashchange", changement);
    return () => window.removeEventListener("hashchange", changement);
  }, [aller, clesTexte, departTexte, dossierId]);

  const ctx = useMemo<Ctx>(() => ({ ordre, ouvrirFenetre: setFenetre, aller }), [ordre, aller]);
  const f = fenetre ? fenetres[fenetre] : null;

  return (
    <Contexte.Provider value={ctx}>
      <div className={s.fiche}>
        <div className={s.barre} role="toolbar" aria-label="Fiche du dossier">
          <div className={s.barreGauche}>
            {identite}
            {barre.map((b) => (
              <BoutonGeste key={b.cle} geste={b.geste} libelle={b.libelle} picto={b.picto} titre={b.titre} classe={`${s.pilule} ${b.accent ? s[`accent_${b.accent}`] : ""}`} />
            ))}
          </div>
          <div className={s.barreDroite}>
            <div className={s.ordre} role="group" aria-label="Ordre des listes">
              <button type="button" aria-pressed={ordre === "chrono"} onClick={() => poser(CLE_ORDRE, "chrono")} title="Les plus anciens d'abord">
                <Picto nom="chrono" taille={16} />
                Chrono
              </button>
              <button type="button" aria-pressed={ordre === "anti"} onClick={() => poser(CLE_ORDRE, "anti")} title="Les plus récents d'abord">
                <Picto nom="anti" taille={16} />
                Anti
              </button>
            </div>
            <button
              type="button"
              className={s.pilule}
              onClick={() => poser(CLE_SECTIONS, Object.fromEntries(sections.map((x) => [x.cle, !toutOuvert])))}
              aria-label={toutOuvert ? "Replier toutes les sections" : "Déplier toutes les sections"}
            >
              <Picto nom={toutOuvert ? "replier" : "deplier"} taille={16} />
              {toutOuvert ? "Tout replier" : "Tout déplier"}
            </button>
            <button type="button" className={`${s.pilule} ${s.rond}`} onClick={() => demarrer(() => router.refresh())} title="Rafraîchir" aria-label="Rafraîchir">
              <Picto nom="rafraichir" taille={16} className={rafraichit ? s.tourne : undefined} />
              <span className={s.libelleLarge}>Rafraîchir</span>
            </button>
          </div>
          {memo && (
            <div className={s.memo}>
              <button type="button" onClick={() => setFenetre(memo.fenetre)} title="Observations et suivi du dossier">
                <Picto nom="suivi" taille={16} />
                <span>{memo.texte ?? "Aucune observation commerciale."}</span>
              </button>
              {memo.drapeaux.map((x) => (
                <span key={x} className={s.drapeau}>
                  {x}
                </span>
              ))}
            </div>
          )}
        </div>

        {sections.map((x) => (
          <Section key={x.cle} section={x} ouverte={ouverte(x)} onglet={ongletDe(x)} basculer={(v) => basculer(x.cle, v)} choisir={(o) => choisirOnglet(x.cle, o)} />
        ))}
      </div>
      {f && fenetre && <Fenetre key={fenetre} f={f} fermer={() => setFenetre(null)} />}
    </Contexte.Provider>
  );
}

function lireJson<T>(cle: string): T | null {
  const b = lireBrut(cle);
  if (!b) return null;
  try {
    return JSON.parse(b) as T;
  } catch {
    return null;
  }
}

// --- Une section ------------------------------------------------------------------------------------------

function Section({ section, ouverte, onglet, basculer, choisir }: { section: SectionFiche; ouverte: boolean; onglet: string; basculer: (v: boolean) => void; choisir: (o: string) => void }) {
  const { ordre } = useFiche();
  const o = section.onglets.find((x) => x.cle === onglet) ?? section.onglets[0];
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [raison, setRaison] = useState<{ texte: string; n: number } | null>(null);

  const lignes = useMemo(() => [...o.lignes].sort((a, b) => (ordre === "chrono" ? a.tri - b.tri : b.tri - a.tri)), [o.lignes, ordre]);
  const choisie = lignes.find((l) => l.id === selections[o.cle]) ?? lignes[0] ?? null;
  const corps = `corps-${section.cle}`;

  useEffect(() => {
    if (!raison) return;
    const t = window.setTimeout(() => setRaison(null), 4200);
    return () => window.clearTimeout(t);
  }, [raison]);

  const outils = [...section.outils, ...(o.extras ?? [])];
  const gesteDe = (cle: string): Geste => choisie?.gestes?.[cle] ?? o.gestes?.[cle] ?? { off: o.lignes.length ? "Sans objet sur cette ligne." : "Rien à sélectionner dans cet onglet." };

  return (
    <section className={s.section} id={`section-${section.cle}`} data-section={section.cle} data-ouverte={ouverte}>
      <h2 className={s.tete}>
        <button type="button" className={s.bascule} aria-expanded={ouverte} aria-controls={corps} onClick={() => basculer(!ouverte)}>
          <i className={s.tuile}>
            <Picto nom={section.picto} taille={20} />
          </i>
          <span className={s.titres}>
            <b>{section.titre}</b>
            <small>{section.resume}</small>
          </span>
          <span className={s.apercu} aria-hidden={ouverte}>
            {section.onglets.map((x) => (
              <em key={x.cle} data-vide={x.compte === 0}>
                {x.libelle}
                <u>{x.compte}</u>
              </em>
            ))}
          </span>
          <i className={s.chevron}>
            <Picto nom="chevron" taille={18} />
          </i>
        </button>
      </h2>

      <div className={s.repli} id={corps} inert={!ouverte}>
        <div className={s.repliInterieur}>
          <div className={s.corps}>
            <div className={s.outils} role="toolbar" aria-label={`Outils · ${section.titre}`}>
              {outils.map((t, i) => (
                <Fragment key={t.cle}>
                  {i === section.outils.length && i > 0 && <i className={s.filet} aria-hidden />}
                  <BoutonGeste
                    geste={gesteDe(t.cle)}
                    libelle={choisie?.libelles?.[t.cle] ?? o.libelles?.[t.cle] ?? t.libelle}
                    picto={t.picto}
                    classe={`${s.outil} ${t.danger ? s.danger : ""}`}
                    expliquer={(texte) => setRaison((r) => ({ texte, n: (r?.n ?? 0) + 1 }))}
                  />
                </Fragment>
              ))}
            </div>
            <p className={s.raison} role="status" data-visible={!!raison} key={raison?.n}>
              {raison?.texte}
            </p>

            <div className={s.onglets} role="tablist" aria-label={section.titre}>
              {section.onglets.map((x) => (
                <button key={x.cle} type="button" role="tab" aria-selected={x.cle === o.cle} className={s.onglet} onClick={() => choisir(x.cle)} id={`onglet-${section.cle}-${x.cle}`}>
                  {x.libelle}
                  <span className={s.compte} data-vide={x.compte === 0}>
                    {x.compte}
                  </span>
                </button>
              ))}
            </div>

            <div className={s.panneau} role="tabpanel" aria-labelledby={`onglet-${section.cle}-${o.cle}`}>
              {o.avant}
              {lignes.length === 0 ? (
                o.vide !== null && <div className={s.vide}>{o.vide}</div>
              ) : (
                <Tableau
                  onglet={o}
                  lignes={lignes}
                  choisie={choisie}
                  choisir={(id) => setSelections((x) => ({ ...x, [o.cle]: id }))}
                  modifier={() => gesteDe("modifier")}
                />
              )}
              {choisie?.detail && <div className={s.detail}>{choisie.detail}</div>}
              {o.apres}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tableau({ onglet, lignes, choisie, choisir, modifier }: { onglet: Onglet; lignes: Ligne[]; choisie: Ligne | null; choisir: (id: string) => void; modifier: () => Geste }) {
  const router = useRouter();
  const { ouvrirFenetre, aller } = useFiche();
  const lancer = (g: Geste) => {
    if ("lien" in g) {
      if (g.nouvelOnglet) window.open(g.lien, "_blank", "noopener");
      else router.push(g.lien);
    } else if ("fenetre" in g) ouvrirFenetre(g.fenetre);
    else if ("aller" in g) aller(g.aller.section, g.aller.onglet, g.aller.fenetre);
  };
  return (
    <div className={s.tableau}>
      <table className={s.table}>
        <thead>
          <tr>
            {onglet.colonnes.map((c) => (
              <th key={c.libelle} className={c.num ? s.num : undefined} scope="col">
                {c.libelle}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr
              key={l.id}
              tabIndex={0}
              aria-selected={choisie?.id === l.id}
              data-ton={l.ton}
              onClick={() => choisir(l.id)}
              onDoubleClick={() => lancer(modifier())}
              onKeyDown={(e) => {
                const tr = e.currentTarget;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const voisin = (e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling) as HTMLTableRowElement | null;
                  if (voisin) {
                    voisin.focus();
                    voisin.click();
                  }
                } else if (e.key === "Enter" && e.target === tr) {
                  e.preventDefault();
                  lancer(modifier());
                } else if (e.key === " " && e.target === tr) {
                  e.preventDefault();
                  choisir(l.id);
                }
              }}
            >
              {l.cellules.map((c, i) => (
                <td key={i} data-label={onglet.colonnes[i]?.libelle} className={onglet.colonnes[i]?.num ? s.num : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Un bouton qui porte un geste -------------------------------------------------------------------------

function BoutonGeste({
  geste,
  libelle,
  picto,
  classe,
  titre,
  expliquer,
}: {
  geste: Geste;
  libelle: string;
  picto: Outil["picto"];
  classe: string;
  titre?: string;
  expliquer?: (texte: string) => void;
}) {
  const { ouvrirFenetre, aller } = useFiche();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const contenu = (
    <>
      <Picto nom={picto} taille={17} />
      <span>{libelle}</span>
    </>
  );
  if ("off" in geste) {
    return (
      <button type="button" className={classe} aria-disabled title={geste.off} onClick={() => expliquer?.(`${libelle} : ${geste.off}`)}>
        {contenu}
      </button>
    );
  }
  if ("lien" in geste) {
    return geste.nouvelOnglet ? (
      <a className={classe} href={geste.lien} target="_blank" rel="noopener" title={titre}>
        {contenu}
      </a>
    ) : (
      <Link className={classe} href={geste.lien} title={titre}>
        {contenu}
      </Link>
    );
  }
  if ("action" in geste) {
    return (
      <form action={geste.action} className={s.formOutil}>
        <Envoyer classe={classe} confirmer={geste.confirmer} titre={titre}>
          {contenu}
        </Envoyer>
      </form>
    );
  }
  if ("fenetre" in geste) {
    return (
      <button type="button" className={classe} onClick={() => ouvrirFenetre(geste.fenetre)} title={titre} aria-haspopup="dialog">
        {contenu}
      </button>
    );
  }
  if ("aller" in geste) {
    return (
      <button type="button" className={classe} title={titre} onClick={() => aller(geste.aller.section, geste.aller.onglet, geste.aller.fenetre)}>
        {contenu}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className={classe}
        title={titre}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(e) => {
          if (menu) return setMenu(null);
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: Math.max(12, Math.min(r.left, window.innerWidth - 292)), y: r.bottom + 6 });
        }}
      >
        {contenu}
        <Picto nom="chevron" taille={14} />
      </button>
      {menu && <MenuChoix position={menu} options={geste.choix} fermer={() => setMenu(null)} />}
    </>
  );
}

/** Un bouton d'envoi : l'action part, il le montre ; avec `confirmer`, un premier clic demande confirmation. */
function Envoyer({ classe, confirmer, titre, children }: { classe: string; confirmer?: string; titre?: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const [arme, setArme] = useState(false);
  useEffect(() => {
    if (!arme) return;
    const t = window.setTimeout(() => setArme(false), 4000);
    return () => window.clearTimeout(t);
  }, [arme]);
  return (
    <button
      type={confirmer && !arme ? "button" : "submit"}
      className={classe}
      data-arme={arme || undefined}
      data-attente={pending || undefined}
      disabled={pending}
      title={titre}
      onClick={(e) => {
        if (confirmer && !arme) {
          e.preventDefault();
          setArme(true);
        }
      }}
    >
      {arme && confirmer ? (
        <>
          <Picto nom="alerte" taille={17} />
          <span>{confirmer}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

function MenuChoix({ position, options, fermer }: { position: { x: number; y: number }; options: { libelle: string; action: () => Promise<void>; danger?: boolean; confirmer?: string }[]; fermer: () => void }) {
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dehors = (e: MouseEvent) => !boite.current?.contains(e.target as Node) && fermer();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    const t = window.setTimeout(() => document.addEventListener("mousedown", dehors), 0);
    document.addEventListener("keydown", echap);
    window.addEventListener("scroll", fermer, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
      window.removeEventListener("scroll", fermer, true);
    };
  }, [fermer]);
  return createPortal(
    <div ref={boite} className={s.menu} role="menu" style={{ top: position.y, left: position.x }}>
      {options.map((o) => (
        <form key={o.libelle} action={o.action} onSubmit={() => window.setTimeout(fermer, 0)}>
          <Envoyer classe={`${s.choix} ${o.danger ? s.danger : ""}`} confirmer={o.confirmer}>
            <span>{o.libelle}</span>
          </Envoyer>
        </form>
      ))}
    </div>,
    document.body,
  );
}

// --- Les fenêtres -----------------------------------------------------------------------------------------

/**
 * Une fenêtre (Fiche, Adresses, Inventaire, une ligne à saisir…), comme
 * celles de Créagidem. Un formulaire envoyé la referme quand la page revient
 * à jour ; un formulaire (ou un bouton) marqué `data-garder` la laisse
 * ouverte — « Ajouter une étape », l'inventaire.
 */
function Fenetre({ f, fermer }: { f: FenetreFiche; fermer: () => void }) {
  const [attente, setAttente] = useState<React.ReactNode | null>(null);
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    const champ = boite.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([readonly]), select, textarea");
    (champ ?? boite.current?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = avant;
      document.removeEventListener("keydown", echap);
    };
  }, [fermer]);

  // La page est revenue à jour après l'envoi : la fenêtre se referme.
  useEffect(() => {
    if (attente && attente !== f.contenu) fermer();
  }, [attente, f.contenu, fermer]);
  useEffect(() => {
    if (!attente) return;
    const t = window.setTimeout(() => setAttente(null), 9000);
    return () => window.clearTimeout(t);
  }, [attente]);

  return createPortal(
    <div
      className={s.voile}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fermer();
      }}
    >
      <div ref={boite} className={s.fenetre} data-large={f.large || undefined} role="dialog" aria-modal="true" aria-label={f.titre} data-attente={!!attente || undefined}>
        <header className={s.fenetreTete}>
          <div>
            {f.surtitre && <small>{f.surtitre}</small>}
            <h3>{f.titre}</h3>
          </div>
          {attente && <span className={s.enregistre}>Enregistrement…</span>}
          <button type="button" className={s.fermer} onClick={fermer} aria-label="Fermer">
            <Picto nom="fermer" taille={18} />
          </button>
        </header>
        <div
          className={s.fenetreCorps}
          onSubmitCapture={(e) => {
            const form = e.target as HTMLFormElement;
            const bouton = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
            if (form.dataset.garder !== undefined || bouton?.dataset.garder !== undefined) return;
            setAttente(f.contenu);
          }}
        >
          {f.contenu}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Le bouton de validation d'un formulaire de fenêtre : il dit que l'envoi est en cours. */
export function Valider({ children = "Enregistrer", garder, nom, valeur, ton = "plein" }: { children?: React.ReactNode; garder?: boolean; nom?: string; valeur?: string; ton?: "plein" | "doux" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${s.valider} ${s[`valider_${ton}`]}`} disabled={pending} data-garder={garder ? "" : undefined} name={nom} value={valeur}>
      {pending ? "Enregistrement…" : children}
    </button>
  );
}
