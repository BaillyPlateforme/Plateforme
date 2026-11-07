"use client";

import { useState } from "react";
import type { Evenement } from "../types";
import { Picto, type NomPicto } from "./Picto";
import s from "./dispatch.module.css";

/*
 * L'historique d'un plan : chaque import, déplacement, verrouillage,
 * proposition et réglage, avec son auteur et son heure, regroupés par jour.
 */

const FILTRES: { cle: string; nom: string; actions: string[] }[] = [
  { cle: "tout", nom: "Tout", actions: [] },
  { cle: "deplacements", nom: "Déplacements", actions: ["deplacement", "ordre"] },
  { cle: "verrous", nom: "Verrouillages", actions: ["verrouillage", "deverrouillage"] },
  { cle: "ia", nom: "Propositions", actions: ["proposition", "application"] },
  { cle: "imports", nom: "Imports", actions: ["import"] },
  { cle: "fiches", nom: "Colonnes et fiches", actions: ["colonne", "ligne", "plan"] },
];

const PICTO: Record<string, [NomPicto, string]> = {
  deplacement: ["deplacer", ""],
  ordre: ["deplacer", ""],
  verrouillage: ["cadenas", "vert"],
  deverrouillage: ["cadenasOuvert", "ambre"],
  proposition: ["etincelle", ""],
  application: ["coche", "vert"],
  import: ["importer", "ciel"],
  colonne: ["colonnes", "ciel"],
  ligne: ["crayon", ""],
  plan: ["reglages", ""],
};

const jourDe = (iso: string) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));
const heure = (iso: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));

function titreJour(jour: string) {
  const auj = jourDe(new Date().toISOString());
  const hier = jourDe(new Date(Date.now() - 864e5).toISOString());
  if (jour === auj) return "Aujourd'hui";
  if (jour === hier) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${jour}T12:00:00Z`));
}

export default function Historique({ evenements }: { evenements: Evenement[] }) {
  const [filtre, setFiltre] = useState("tout");
  const actions = FILTRES.find((f) => f.cle === filtre)?.actions ?? [];
  const liste = actions.length ? evenements.filter((e) => actions.includes(e.action)) : evenements;
  const jours = new Map<string, Evenement[]>();
  for (const e of liste) jours.set(jourDe(e.quand), [...(jours.get(jourDe(e.quand)) ?? []), e]);

  return (
    <section className={s.journal} aria-label="Historique des modifications">
      <div className={s.filtres}>
        {FILTRES.map((f) => (
          <button key={f.cle} type="button" aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
            {f.nom}
          </button>
        ))}
      </div>
      {liste.length === 0 && <p className={s.sousTitre}>Rien dans cette rubrique pour l&apos;instant.</p>}
      {[...jours].map(([jour, es]) => (
        <div key={jour}>
          <p className={s.jour}>{titreJour(jour)}</p>
          <ul className={s.evenements}>
            {es.map((e) => {
              const [picto, ton] = PICTO[e.action] ?? ["horloge", ""];
              return (
                <li key={e.id} className={s.evenement}>
                  <i className={ton ? s[ton] : ""}>
                    <Picto nom={picto} taille={17} />
                  </i>
                  <p>
                    {e.libelle}
                    <small>{e.qui ?? "Utilisateur supprimé"}</small>
                  </p>
                  <span className={s.heure}>{heure(e.quand)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {evenements.length >= 400 && <p className={s.sousTitre}>Seules les 400 dernières opérations sont affichées.</p>}
    </section>
  );
}
