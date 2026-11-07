"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Applications from "@/composants/Applications";
import { signOut } from "@/lib/actions/auth";
import { Icone } from "./icones";
import { GROUPES, REGLAGES, estActif, type Entree, type Groupe } from "./navigation";
import s from "./coque.module.css";

/*
 * La coque de l'app interne, dans le design « Quantum » modernisé : une barre
 * blanche en haut — la marque, les rubriques (menus déroulants par groupe),
 * la recherche, « Nouveau dossier », les applications, la cloche, le compte —
 * puis la page, dont l'en-tête se pose sur une bande indigo (voir Bandeau).
 * Sur un écran étroit, les rubriques passent dans un tiroir.
 *
 * Le CRM et les sections venues de l'espace équipe la posent l'un et l'autre
 * (deux mises en page racines) : le même dessin partout, et un menu unique.
 */

export type Utilisateur = { nom: string; initiales: string; role: string };
export type Alerte = { id: string; aFaire: boolean; titre: string; sous: string; quand?: string; href: string };

/** Le groupe « Démarrer » s'affiche en liens directs ; les autres en menus. */
const DIRECTS = GROUPES[0].entrees;
const MENUS = GROUPES.slice(1).map((g) => (g.titre === "Gestion" ? { ...g, entrees: [...g.entrees, REGLAGES] } : g));

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
      <header className={s.barre}>
        <button type="button" className={`${s.rond} ${s.burger}`} aria-label="Ouvrir le menu" onClick={() => setTiroir(true)}>
          <Icone nom="menu" />
        </button>
        <Link href="/" className={s.marque} aria-label="Bailly CRM, accueil">
          <span className={s.monogramme}>B</span>
          <b>Bailly</b>
        </Link>

        <nav className={s.rubriques} aria-label="Menu principal">
          {DIRECTS.map((e) => (
            <Link key={e.href} href={e.href} className={s.rubrique} aria-current={estActif(e, chemin) ? "page" : undefined}>
              <Icone nom={e.icone} taille={18} />
              <span>{e.label}</span>
            </Link>
          ))}
          {MENUS.map((g) => (
            <MenuGroupe key={g.titre} groupe={g} chemin={chemin} compteur={compteur} />
          ))}
        </nav>

        <span className={s.espace} />
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
      </header>

      {tiroir && <Tiroir chemin={chemin} compteur={compteur} fermer={() => setTiroir(false)} />}

      <main className={s.contenu}>{children}</main>
    </div>
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

/** Une rubrique du haut qui ouvre la liste de ses pages. */
function MenuGroupe({ groupe, chemin, compteur }: { groupe: Groupe; chemin: string; compteur: (e: Entree) => number }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useFermeture(ouvert, () => setOuvert(false));
  const actif = groupe.entrees.some((e) => estActif(e, chemin));
  const total = groupe.entrees.reduce((n, e) => n + compteur(e), 0);
  // Changer de page referme le menu.
  const [vu, setVu] = useState(chemin);
  if (vu !== chemin) {
    setVu(chemin);
    setOuvert(false);
  }
  return (
    <div className={s.groupe} ref={ref}>
      <button
        type="button"
        className={`${s.rubrique} ${actif ? s.actif : ""}`}
        aria-expanded={ouvert}
        aria-haspopup="menu"
        onClick={() => setOuvert((o) => !o)}
      >
        <span>{groupe.titre}</span>
        {total > 0 && <span className={s.nombre}>{total}</span>}
        <Icone nom="chevron" taille={14} />
      </button>
      {ouvert && (
        <div className={s.deroulant} role="menu" aria-label={groupe.titre}>
          {groupe.entrees.map((e) => (
            <Link key={e.href} href={e.href} role="menuitem" className={s.page} aria-current={estActif(e, chemin) ? "page" : undefined}>
              <span className={s.pictogramme}>
                <Icone nom={e.icone} taille={18} />
              </span>
              <span className={s.libelle}>{e.label}</span>
              {compteur(e) > 0 && <span className={s.nombre}>{compteur(e)}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
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
          <span className={s.monogramme}>B</span>
          <b>Bailly CRM</b>
          <button type="button" className={s.rond} aria-label="Fermer" onClick={fermer}>
            <Icone nom="plus" taille={18} />
          </button>
        </div>
        {[...GROUPES.slice(0, 1), ...MENUS].map((g) => (
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
