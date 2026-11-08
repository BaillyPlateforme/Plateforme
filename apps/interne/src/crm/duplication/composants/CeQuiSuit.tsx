import type { Inventaire } from "../textes";
import s from "../duplication.module.css";

/* Ce qu'une duplication reprend, et ce qu'elle ne reprend jamais : deux colonnes, dites avant de dupliquer. */

const Coche = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
const Croix = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M17 7 7 17M7 7l10 10" />
  </svg>
);

export default function CeQuiSuit({ inventaire, avant }: { inventaire: Inventaire; avant?: string[] }) {
  return (
    <div className={s.suit}>
      <div className={s.colonne} data-ton="repris">
        <h4>Repris</h4>
        <ul>
          {[...(avant ?? []), ...inventaire.repris].map((x) => (
            <li key={x}>
              <Coche />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={s.colonne} data-ton="jamais">
        <h4>Jamais repris</h4>
        <ul>
          {inventaire.jamais.map((x) => (
            <li key={x}>
              <Croix />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
