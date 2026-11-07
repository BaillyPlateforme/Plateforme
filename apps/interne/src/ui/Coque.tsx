"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Applications from "@/composants/Applications";
import { signOut } from "@/lib/actions/auth";
import { Icone } from "./icones";
import { GROUPES, REGLAGES, estActif, type Entree } from "./navigation";
import s from "./coque.module.css";

/*
 * La coque de l'app interne : un menu à gauche, une barre en haut, la page.
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
  const [menuOuvert, setMenuOuvert] = useState(false);
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

  const lien = (e: Entree) => {
    const actif = estActif(e, chemin);
    return (
      <Link
        key={e.href}
        href={e.href}
        className={s.entree}
        aria-current={actif ? "page" : undefined}
        title={e.label}
        onClick={() => setMenuOuvert(false)}
      >
        <span className={s.pictogramme}>
          <Icone nom={e.icone} />
        </span>
        <span className={s.libelle}>{e.label}</span>
        {e.compteur === "nouvelles" && nouvelles > 0 && <span className={s.compteur}>{nouvelles}</span>}
      </Link>
    );
  };

  return (
    <div className={s.coque}>
      {menuOuvert && <button type="button" className={s.voile} aria-label="Fermer le menu" onClick={() => setMenuOuvert(false)} />}
      <aside className={`${s.menu} ${menuOuvert ? s.menuOuvert : ""}`}>
        <Link href="/" className={s.marque} onClick={() => setMenuOuvert(false)}>
          <span className={s.monogramme}>B</span>
          <span>
            <b>Bailly CRM</b>
            <small>Bailly Déménagement</small>
          </span>
        </Link>

        <nav className={s.groupes} aria-label="Menu principal">
          {GROUPES.map((g) => (
            <div key={g.titre}>
              <p className={s.titreGroupe}>{g.titre}</p>
              {g.entrees.map(lien)}
            </div>
          ))}
        </nav>

        <div className={s.pied}>
          {nouvelles > 0 && (
            <Link href="/dashboard?statut=new" className={s.carte} onClick={() => setMenuOuvert(false)}>
              <small>Venues du site</small>
              <b>
                {nouvelles} demande{nouvelles > 1 ? "s" : ""} à ouvrir
              </b>
              <span>
                Les traiter <Icone nom="fleche" taille={13} />
              </span>
            </Link>
          )}
          {lien(REGLAGES)}
          <form action={signOut}>
            <button type="submit" className={s.sortie} title="Se déconnecter">
              <Icone nom="sortie" />
              <span>Déconnexion</span>
            </button>
          </form>
        </div>
      </aside>

      <div className={s.colonne}>
        <header className={s.barre}>
          <button type="button" className={`${s.rond} ${s.burger}`} aria-label="Ouvrir le menu" onClick={() => setMenuOuvert(true)}>
            <Icone nom="menu" />
          </button>
          <form action="/dossiers" className={s.recherche} role="search">
            <Icone nom="recherche" />
            <input ref={recherche} name="q" placeholder="Rechercher un client, un dossier, un devis…" aria-label="Rechercher" />
            <kbd className={s.touche}>/</kbd>
          </form>
          <span className={s.espace} />
          <Link href="/dossiers/nouveau" className={s.action}>
            <Icone nom="plus" taille={17} />
            <span>Nouveau dossier</span>
          </Link>
          <Applications rond />
          <Cloche alertes={alertes} />
          <span className={s.separateur} />
          <Compte utilisateur={utilisateur} />
        </header>
        <main className={s.contenu}>{children}</main>
      </div>
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
              <p className={s.rubrique}>À traiter</p>
              {aFaire.map(ligne)}
            </>
          )}
          <p className={s.rubrique}>Activité récente</p>
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
      <button type="button" className={s.fiche} aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <span className={s.avatar}>{utilisateur.initiales}</span>
        <span>
          <b>{utilisateur.nom}</b>
          <small>{utilisateur.role}</small>
        </span>
        <Icone nom="chevron" taille={15} />
      </button>
      {ouvert && (
        <div className={`${s.panneau} ${s.etroit}`} role="menu">
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
