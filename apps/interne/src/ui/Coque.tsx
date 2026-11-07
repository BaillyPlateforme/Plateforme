"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Applications from "@/composants/Applications";
import { signOut } from "@/lib/actions/auth";
import { Icone } from "./icones";
import { GROUPES, estActif, groupeDe, type Entree } from "./navigation";
import OngletsTravail from "./OngletsTravail";
import s from "./coque.module.css";

/*
 * La coque de l'app interne, dans le design « Quantum » modernisé : en haut,
 * deux étages blancs. Le premier porte le logo, les rubriques (un repère
 * glisse sous celle qu'on regarde), la recherche, « Nouveau dossier », les
 * applications, la cloche et le compte. Le second aligne les pages de la
 * rubrique, à l'horizontale : celle de la page courante, ou celle qu'on
 * survole, avec un fondu. Puis la page, dont l'en-tête se pose sur une bande
 * indigo (voir Bandeau). Sur un écran étroit, les rubriques passent dans un
 * tiroir et le second étage défile.
 *
 * Le CRM et les sections venues de l'espace équipe la posent l'un et l'autre
 * (deux mises en page racines) : le même dessin partout, et un menu unique.
 */

export type Utilisateur = { nom: string; initiales: string; role: string };
export type Alerte = { id: string; aFaire: boolean; titre: string; sous: string; quand?: string; href: string };


export default function Coque({
  utilisateur,
  alertes,
  nouvelles,
  children,
}: {
  utilisateur: Utilisateur;
  alertes: Alerte[];
  /** Les demandes du site pas encore ouvertes. */
  nouvelles: number;
  children: React.ReactNode;
}) {
  const chemin = usePathname();
  const [tiroir, setTiroir] = useState(false);
  const recherche = useRef<HTMLInputElement>(null);

  // « / » met le curseur dans la recherche, comme dans la plupart des outils.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      if (e.key !== "/" || /input|textarea|select/i.test(cible.tagName) || cible.isContentEditable) return;
      e.preventDefault();
      recherche.current?.focus();
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, []);

  const compteur = (e: Entree) => (e.compteur === "nouvelles" && nouvelles > 0 ? nouvelles : 0);

  return (
    <div className={s.coque}>
      <Entete chemin={chemin} compteur={compteur} ouvrirTiroir={() => setTiroir(true)}>
        <form action="/dossiers" className={s.recherche} role="search">
          <Icone nom="recherche" taille={17} />
          <input ref={recherche} name="q" placeholder="Rechercher…" aria-label="Rechercher un client, un dossier, un devis" />
          <kbd className={s.touche}>/</kbd>
        </form>
        <Link href="/dossiers/nouveau" className={s.action} title="Nouveau dossier">
          <Icone nom="plus" taille={17} />
          <span>Nouveau dossier</span>
        </Link>
        <Applications rond />
        <Cloche alertes={alertes} />
        <Compte utilisateur={utilisateur} />
      </Entete>

      {tiroir && <Tiroir chemin={chemin} compteur={compteur} fermer={() => setTiroir(false)} />}

      <main className={s.contenu}>{children}</main>
    </div>
  );
}

/**
 * Les deux étages du haut. La rubrique « montrée » est celle qu'on survole
 * (après un court délai, pour ne pas clignoter en traversant la barre), ou à
 * défaut celle de la page courante ; quitter l'en-tête y revient.
 */
function Entete({
  chemin,
  compteur,
  ouvrirTiroir,
  children,
}: {
  chemin: string;
  compteur: (e: Entree) => number;
  ouvrirTiroir: () => void;
  children: React.ReactNode;
}) {
  const courant = groupeDe(chemin);
  const [apercu, setApercu] = useState<string | null>(null);
  const montre = GROUPES.find((g) => g.titre === apercu) ?? courant;
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onglets = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [repere, setRepere] = useState<{ x: number; l: number } | null>(null);

  const planifier = useCallback((titre: string | null, delai: number) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setApercu(titre), delai);
  }, []);
  useEffect(() => () => void (minuteur.current && clearTimeout(minuteur.current)), []);

  // Changer de page referme l'aperçu.
  const [vu, setVu] = useState(chemin);
  if (vu !== chemin) {
    setVu(chemin);
    setApercu(null);
  }

  // Le repère glisse sous la rubrique montrée.
  useLayoutEffect(() => {
    const placer = () => {
      const el = onglets.current[montre.titre];
      if (el) setRepere({ x: el.offsetLeft, l: el.offsetWidth });
    };
    placer();
    window.addEventListener("resize", placer);
    return () => window.removeEventListener("resize", placer);
  }, [montre.titre]);

  return (
    <header className={s.entete} onMouseLeave={() => planifier(null, 260)}>
      <div className={s.barre}>
        <button type="button" className={`${s.rond} ${s.burger}`} aria-label="Ouvrir le menu" onClick={ouvrirTiroir}>
          <Icone nom="menu" />
        </button>
        <Link href="/" className={s.marque} aria-label="Bailly CRM, tableau de bord">
          {/* eslint-disable-next-line @next/next/no-img-element -- le logo vectoriel de Bailly, servi tel quel */}
          <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={94} height={30} />
          <span className={s.crm}>CRM</span>
        </Link>

        <nav className={s.rubriques} aria-label="Rubriques">
          {GROUPES.map((g) => {
            const total = g.entrees.reduce((n, e) => n + compteur(e), 0);
            return (
              <Link
                key={g.titre}
                ref={(el) => {
                  onglets.current[g.titre] = el;
                }}
                href={g.entrees[0].href}
                className={s.rubrique}
                data-courant={g.titre === courant.titre || undefined}
                data-montre={g.titre === montre.titre || undefined}
                onMouseEnter={() => planifier(g.titre, apercu ? 0 : 90)}
                onFocus={() => planifier(g.titre, 0)}
              >
                {g.titre}
                {total > 0 && <span className={s.nombre}>{total}</span>}
              </Link>
            );
          })}
          {repere && <span className={s.repere} style={{ transform: `translateX(${repere.x}px)`, width: repere.l }} aria-hidden />}
        </nav>

        <span className={s.espace} />
        {children}
      </div>

      <nav className={s.sousBarre} aria-label={montre.titre} onMouseEnter={() => planifier(montre.titre === courant.titre ? null : montre.titre, 0)}>
        <div key={montre.titre} className={s.pages}>
          {montre.entrees.map((e) => (
            <Link key={e.href} href={e.href} className={s.page} aria-current={estActif(e, chemin) ? "page" : undefined}>
              <Icone nom={e.icone} taille={17} />
              <span>{e.label}</span>
              {compteur(e) > 0 && <span className={s.nombre}>{compteur(e)}</span>}
            </Link>
          ))}
        </div>
      </nav>
      <OngletsTravail />
    </header>
  );
}

/** Ferme un panneau au clic à côté et à la touche Échap. */
function useFermeture(ouvert: boolean, fermer: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fermer();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert, fermer]);
  return ref;
}

/** Le menu complet, pour les écrans étroits. */
function Tiroir({ chemin, compteur, fermer }: { chemin: string; compteur: (e: Entree) => number; fermer: () => void }) {
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fermer]);
  const lien = (e: Entree) => (
    <Link key={e.href} href={e.href} className={s.page} aria-current={estActif(e, chemin) ? "page" : undefined} onClick={fermer}>
      <span className={s.pictogramme}>
        <Icone nom={e.icone} taille={18} />
      </span>
      <span className={s.libelle}>{e.label}</span>
      {compteur(e) > 0 && <span className={s.nombre}>{compteur(e)}</span>}
    </Link>
  );
  return (
    <>
      <button type="button" className={s.voile} aria-label="Fermer le menu" onClick={fermer} />
      <aside className={s.tiroir} aria-label="Menu">
        <div className={s.tiroirTete}>
          {/* eslint-disable-next-line @next/next/no-img-element -- le logo vectoriel de Bailly */}
          <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={88} height={28} />
          <b>CRM</b>
          <button type="button" className={s.rond} aria-label="Fermer" onClick={fermer}>
            <Icone nom="plus" taille={18} />
          </button>
        </div>
        {GROUPES.map((g) => (
          <div key={g.titre}>
            <p className={s.titreGroupe}>{g.titre}</p>
            {g.entrees.map(lien)}
          </div>
        ))}
      </aside>
    </>
  );
}

function Cloche({ alertes }: { alertes: Alerte[] }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useFermeture(ouvert, () => setOuvert(false));
  const aFaire = alertes.filter((a) => a.aFaire);
  const activite = alertes.filter((a) => !a.aFaire);
  const ligne = (a: Alerte) => (
    <Link key={a.id} href={a.href} className={`${s.alerte} ${a.aFaire ? s.aFaire : ""}`} onClick={() => setOuvert(false)}>
      <i />
      <span>
        <b>{a.titre}</b>
        <small>{a.sous}</small>
      </span>
      {a.quand && <em>{a.quand}</em>}
    </Link>
  );
  return (
    <div className={s.compte} ref={ref}>
      <button type="button" className={s.rond} aria-label="Notifications" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <Icone nom="cloche" />
        {aFaire.length > 0 && <span className={s.pastille}>{aFaire.length}</span>}
      </button>
      {ouvert && (
        <div className={s.panneau} role="dialog" aria-label="Notifications">
          <div className={s.panneauTete}>
            <b>Notifications</b>
            <small>{aFaire.length} à traiter</small>
          </div>
          {aFaire.length > 0 && (
            <>
              <p className={s.rubriquePanneau}>À traiter</p>
              {aFaire.map(ligne)}
            </>
          )}
          <p className={s.rubriquePanneau}>Activité récente</p>
          {activite.length ? activite.map(ligne) : <p className={s.vide}>Rien pour le moment.</p>}
        </div>
      )}
    </div>
  );
}

function Compte({ utilisateur }: { utilisateur: Utilisateur }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useFermeture(ouvert, () => setOuvert(false));
  return (
    <div className={s.compte} ref={ref}>
      <button type="button" className={s.fiche} aria-expanded={ouvert} aria-label={`Compte : ${utilisateur.nom}`} onClick={() => setOuvert((o) => !o)}>
        <span className={s.avatar}>{utilisateur.initiales}</span>
      </button>
      {ouvert && (
        <div className={`${s.panneau} ${s.etroit}`} role="menu">
          <div className={s.qui}>
            <b>{utilisateur.nom}</b>
            <small>{utilisateur.role}</small>
          </div>
          <div className={s.filetMenu} />
          <Link href="/dashboard/parametres" className={s.ligneMenu} role="menuitem" onClick={() => setOuvert(false)}>
            <Icone nom="reglages" taille={17} /> Réglages
          </Link>
          <Link href="/dashboard/equipe" className={s.ligneMenu} role="menuitem" onClick={() => setOuvert(false)}>
            <Icone nom="equipe" taille={17} /> L&apos;équipe
          </Link>
          <div className={s.filetMenu} />
          <form action={signOut}>
            <button type="submit" className={`${s.ligneMenu} ${s.danger}`} role="menuitem">
              <Icone nom="sortie" taille={17} /> Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
