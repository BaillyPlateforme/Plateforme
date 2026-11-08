"use client";

import { useEffect, useState, useTransition } from "react";
import { STATUTS, m3 } from "@/crm/lib/format";
import { chercherDossiersCible } from "../actions";
import type { DossierCible } from "../types";
import s from "../duplication.module.css";

/**
 * Le dossier de destination d'une duplication : une recherche (référence,
 * nom, société, e-mail du client) qui suit la frappe, et les huit dossiers
 * les plus récemment touchés qui correspondent. Le dossier d'origine n'y est
 * pas (`sauf`) : « Dans ce dossier » est l'autre choix de la fenêtre.
 */
export default function ChoixDossier({ sauf, choisi, onChoisir }: { sauf: number | null; choisi: DossierCible | null; onChoisir: (d: DossierCible) => void }) {
  const [texte, setTexte] = useState("");
  const [liste, setListe] = useState<DossierCible[] | null>(null);
  const [cherche, lancer] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => lancer(async () => setListe(await chercherDossiersCible(texte, sauf))), 220);
    return () => clearTimeout(t);
  }, [texte, sauf]);

  return (
    <div className={s.choix}>
      <input
        type="search"
        className={s.recherche}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder="Référence BD-…, client, société, e-mail"
        aria-label="Rechercher le dossier de destination"
        autoFocus
      />
      <ul className={s.resultats} aria-busy={cherche} aria-label="Dossiers trouvés">
        {liste?.length === 0 && <li className={s.aucun}>Aucun dossier ne correspond.</li>}
        {liste?.map((d) => (
          <li key={d.id}>
            <button type="button" className={s.resultat} aria-pressed={choisi?.id === d.id} onClick={() => onChoisir(d)}>
              <i className={s.ref}>{d.ref}</i>
              <span>
                <b>{d.client}</b>
                <small>
                  {d.trajet} · {STATUTS[d.statut]?.label ?? d.statut}
                </small>
              </span>
              <em>{d.volume > 0 ? m3(d.volume) : "volume —"}</em>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
