"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icone } from "@/ui/icones";
import c from "@/ui/coque.module.css";
import Interrupteur from "./Interrupteur";
import ListeAppels from "./ListeAppels";
import { RAFRAICHIR_SECONDES, type Appel } from "./regles";
import { APPELS_CHANGES } from "./tri";
import s from "./appels.module.css";

/*
 * Le bouton « Appels » de la barre du haut, à côté de la cloche : un
 * téléphone, et le nombre d'appels à passer maintenant (ni faits, ni
 * reportés). Il ouvre un panneau à droite — la liste, son ordre
 * (Chronologique | Pertinence), « Tout voir » vers /appels — qu'on garde
 * ouvert le temps des appels.
 *
 * La liste est relue par /api/appels : à l'ouverture du panneau, à chaque
 * changement de page (pas plus d'une fois toutes les 15 s), toutes les
 * minutes quand l'onglet est visible, et après chaque geste.
 */

type Reponse = { moi: number; aFaire: Appel[]; reportes: number; erreur?: boolean };

const ESPACEMENT_MS = 15_000;

export default function BoutonAppels() {
  const chemin = usePathname();
  const router = useRouter();
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const derniere = useRef(0);
  const enVol = useRef(false);

  const charger = useCallback(async (force = false) => {
    if (enVol.current || (!force && Date.now() - derniere.current < ESPACEMENT_MS)) return;
    enVol.current = true;
    try {
      const r = await fetch("/api/appels", { cache: "no-store" });
      if (r.ok) {
        setDonnees((await r.json()) as Reponse);
        derniere.current = Date.now();
      }
    } catch {
      /* Hors ligne, ou session expirée : le compte reste celui d'avant. */
    } finally {
      enVol.current = false;
    }
  }, []);

  // À chaque page (et au premier affichage), une fois la page posée : la lecture ne la retarde pas.
  useEffect(() => {
    const t = setTimeout(() => void charger(), 250);
    return () => clearTimeout(t);
  }, [chemin, charger]);

  // Toutes les minutes, onglet visible ; et au retour sur l'onglet.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void charger(true), RAFRAICHIR_SECONDES * 1000);
    const visible = () => document.visibilityState === "visible" && void charger();
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [charger]);

  // Un geste sur un appel (ici ou sur la page /appels) : la liste se relit, la page aussi.
  useEffect(() => {
    const change = () => {
      void charger(true);
      if (chemin === "/appels") router.refresh();
    };
    window.addEventListener(APPELS_CHANGES, change);
    return () => window.removeEventListener(APPELS_CHANGES, change);
  }, [charger, chemin, router]);

  const basculer = () => {
    setOuvert((o) => !o);
    if (!ouvert) void charger(true);
  };

  const n = donnees?.aFaire.length ?? 0;
  return (
    <>
      <button
        type="button"
        className={c.rond}
        aria-label={n ? `Appels à passer : ${n}` : "Appels à passer"}
        title="Appels à passer"
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        onClick={basculer}
      >
        <Icone nom="telephone" />
        {n > 0 && <span className={`${c.pastille} ${s.pastilleAppels}`}>{n > 99 ? "99+" : n}</span>}
      </button>
      {ouvert && createPortal(<Panneau donnees={donnees} fermer={() => setOuvert(false)} />, document.body)}
    </>
  );
}

function Panneau({ donnees, fermer }: { donnees: Reponse | null; fermer: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fermer]);

  const n = donnees?.aFaire.length ?? 0;
  const reportes = donnees?.reportes ?? 0;
  return (
    <>
      <button type="button" className={s.voile} aria-label="Fermer les appels" onClick={fermer} />
      <aside ref={ref} className={s.tiroir} role="dialog" aria-modal="false" aria-label="Appels à passer" tabIndex={-1}>
        <header className={s.tiroirTete}>
          <div className={s.tiroirDecor} aria-hidden />
          <div className={s.tiroirTitre}>
            <span className={s.embleme}>
              <Icone nom="telephone" taille={18} />
            </span>
            <div>
              <p className={s.surtitre}>Appels</p>
              <h2>À appeler</h2>
            </div>
            <button type="button" className={s.fermer} aria-label="Fermer" onClick={fermer}>
              <Icone nom="plus" taille={18} />
            </button>
          </div>
          <p className={s.tiroirTexte}>
            {donnees ? (
              <>
                <b>{n === 0 ? "Aucun appel" : `${n} appel${n > 1 ? "s" : ""}`}</b> à passer maintenant
                {reportes > 0 && <> · {reportes} plus tard</>}
              </>
            ) : (
              "Lecture de la liste…"
            )}
          </p>
          <Interrupteur utilisateur={donnees?.moi ?? null} variante="verre" />
        </header>

        <div className={s.tiroirListe}>
          {donnees?.erreur && <p className={s.alerte}>La liste n&apos;a pas pu être lue entièrement : réessayez dans un instant.</p>}
          {donnees ? (
            <ListeAppels
              appels={donnees.aFaire}
              utilisateur={donnees.moi}
              variante="panneau"
              onNaviguer={fermer}
              vide={<Vide />}
            />
          ) : (
            <div className={s.chargement} aria-hidden>
              <i />
              <i />
              <i />
            </div>
          )}
        </div>

        <footer className={s.tiroirPied}>
          <span>Rappels, nouvelles demandes, devis sans réponse, visites de demain</span>
          <Link href="/appels" className={s.toutVoir} onClick={fermer}>
            Tout voir
            <Icone nom="fleche" taille={15} />
          </Link>
        </footer>
      </aside>
    </>
  );
}

export function Vide({
  titre = "Aucun appel à passer",
  texte = "Les rappels demandés, les nouvelles demandes, les devis sans réponse et les visites de demain non confirmées viendront ici.",
}: {
  titre?: string;
  texte?: string;
}) {
  return (
    <div className={s.vide}>
      <span className={s.videIcone}>
        <Icone nom="coche" taille={22} />
      </span>
      <b>{titre}</b>
      <small>{texte}</small>
    </div>
  );
}
