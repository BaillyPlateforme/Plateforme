"use client";

import { useEffect, useState } from "react";
import { bilanVolumes } from "@/lib/visite/destinations";
import { m3 } from "@/lib/visite/regles";
import { Picto } from "@/terrain/composants/Picto";
import { utilisateurNote, visitesGardees, type VisiteGardee } from "./hors-ligne";
import Saisie from "./Saisie";
import s from "./tablette.module.css";

/*
 * La page de secours de la tablette, servie par son service worker quand le
 * réseau manque (sw.js). Elle ne contient aucune donnée : elle rouvre la
 * visite demandée (/tablette/<id>) depuis ce que la tablette a gardé pour le
 * compte qui la tenait, ou liste les visites gardées. La saisie continue ; tout
 * part au serveur au retour du réseau.
 */

type Vue = { genre: "attente" } | { genre: "visite"; v: VisiteGardee } | { genre: "liste"; visites: VisiteGardee[]; manquante: number | null };

export default function HorsLigne() {
  const [vue, setVue] = useState<Vue>({ genre: "attente" });

  useEffect(() => {
    // La tablette est une source extérieure : lue une fois la page montée.
    const t = window.setTimeout(() => {
      const visites = visitesGardees(utilisateurNote());
      const m = window.location.pathname.match(/^\/tablette\/(\d+)/) ?? window.location.hash.match(/^#(\d+)$/);
      const id = m ? Number(m[1]) : null;
      const v = id ? visites.find((x) => x.id === id) : undefined;
      setVue(v ? { genre: "visite", v } : { genre: "liste", visites, manquante: id });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  if (vue.genre === "attente") return null;
  if (vue.genre === "visite") {
    const { v } = vue;
    const e = v.inst.entete!;
    return (
      <Saisie
        visiteId={v.id}
        initiale={v.inst.etat}
        volumeInitial={e.volumeInitial}
        majLe={null}
        utilisateur={v.inst.utilisateur}
        dossier={e.dossier}
        rdv={e.rdv}
        commercial={e.commercial}
        photos={e.photos}
        historique={e.historique}
        frequents={e.frequents ?? []}
        destinations={e.destinations}
      />
    );
  }
  return (
    <div className={s.accueil}>
      <header className={s.barre}>
        <div className={s.barreTitre}>
          <b>Hors connexion</b>
          <span>Les visites gardées sur cette tablette</span>
        </div>
        <button type="button" className={s.boutonCr} onClick={() => window.location.reload()}>
          <Picto nom="recharger" taille={20} /> Réessayer
        </button>
      </header>
      <main className={s.contenu}>
        <p className={s.bandeauInfo} role="status" style={{ position: "static", margin: "0 0 16px" }}>
          {vue.manquante
            ? "Cette visite n'a pas été ouverte sur cette tablette avec du réseau : elle ne s'ouvre pas sans réseau."
            : "Sans réseau, seules les visites déjà ouvertes sur cette tablette s'ouvrent. Ce que vous y saisissez partira au retour du réseau."}
        </p>
        {vue.visites.length === 0 ? (
          <div className={s.videAccueil}>
            <i>
              <Picto nom="horsLigne" taille={24} />
            </i>
            <span>
              <b>Aucune visite gardée</b>
              Ouvrez la visite avec du réseau (au bureau, par exemple) : elle restera disponible ici.
            </span>
          </div>
        ) : (
          <div className={s.cartes}>
            {vue.visites.map((x) => {
              const e = x.inst.entete!;
              return (
                <article key={x.id} className={s.carte}>
                  <div className={s.carteHeure}>
                    <Picto nom="horsLigne" taille={24} />
                    <small>Gardée</small>
                  </div>
                  <div className={s.carteCorps}>
                    <h3>{e.dossier.client}</h3>
                    <p>{e.dossier.adresse ?? "Adresse à préciser"}</p>
                    <p>
                      {e.dossier.ref} · {m3(bilanVolumes(x.inst.etat.objets).transporte)}
                      {x.enAttente ? ` · ${x.enAttente} modification${x.enAttente > 1 ? "s" : ""} en attente` : ""}
                    </p>
                    <div className={s.carteBas}>
                      <span className={`${s.pastille} ${s.encours}`}>Saisie en cours</span>
                      {/* Un vrai chargement de page : le service worker sert de nouveau la page de secours. */}
                      <a className={s.boutonPlein} href={`/tablette/${x.id}`}>
                        Reprendre <Picto nom="suite" taille={18} />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
