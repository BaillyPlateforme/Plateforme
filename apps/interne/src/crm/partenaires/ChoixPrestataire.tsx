"use client";

import { useState, useTransition } from "react";
import { affecterPrestataire } from "./actions";
import s from "./partenaires.module.css";

/*
 * Le prestataire d'une lettre, choisi dans l'annuaire depuis la liste des
 * lettres de voiture : le choix s'enregistre aussitôt. « Texte libre »
 * garde le nom saisi tel quel, sans lien.
 */
export default function ChoixPrestataire({
  lettre,
  lie,
  texte,
  annuaire,
}: {
  lettre: number;
  lie: number | null;
  texte: string;
  annuaire: { id: number; nom: string }[];
}) {
  const [valeur, setValeur] = useState(lie ? String(lie) : "");
  const [enCours, lancer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <span className={s.choix}>
      <select
        aria-label="Prestataire de l'annuaire"
        value={valeur}
        disabled={enCours}
        onChange={(e) => {
          const v = e.target.value;
          setValeur(v);
          const f = new FormData();
          f.set("sous_traitant_id", v);
          lancer(async () => {
            const r = await affecterPrestataire(lettre, f);
            setErreur(r.ok ? null : r.erreur);
          });
        }}
      >
        <option value="">{lie ? "Retirer le lien" : `Texte libre · ${texte}`}</option>
        {annuaire.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nom}
          </option>
        ))}
      </select>
      {erreur && <small style={{ color: "#be123c" }}>{erreur}</small>}
    </span>
  );
}
