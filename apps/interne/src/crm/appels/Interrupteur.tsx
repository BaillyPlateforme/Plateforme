"use client";

import { useTri } from "./tri";
import type { Tri } from "./regles";
import s from "./appels.module.css";

const CHOIX: { cle: Tri; libelle: string }[] = [
  { cle: "chrono", libelle: "Chronologique" },
  { cle: "pertinence", libelle: "Pertinence" },
];

/**
 * Le switch « Chronologique | Pertinence » : clair dans le panneau de la
 * barre, en verre dans la bande de la page. Le choix est gardé par
 * utilisateur (tri.ts).
 */
export default function Interrupteur({ utilisateur, variante = "clair" }: { utilisateur: number | null; variante?: "clair" | "verre" }) {
  const [tri, choisir] = useTri(utilisateur);
  return (
    <div className={s.interrupteur} data-variante={variante} data-tri={tri} role="radiogroup" aria-label="Ordre des appels">
      <span className={s.curseur} aria-hidden />
      {CHOIX.map((c) => (
        <button key={c.cle} type="button" role="radio" aria-checked={tri === c.cle} onClick={() => choisir(c.cle)}>
          {c.libelle}
        </button>
      ))}
    </div>
  );
}

/** L'ordre en cours, en une phrase (au-dessus de la liste de la page). */
export function LegendeTri({ utilisateur }: { utilisateur: number | null }) {
  const [tri] = useTri(utilisateur);
  return (
    <span className={s.legende}>
      {tri === "pertinence" ? "Les plus pertinents d'abord : urgence, potentiel, montant, attente" : "Le plus récent d'abord"}
    </span>
  );
}
