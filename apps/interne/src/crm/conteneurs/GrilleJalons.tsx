import u from "@/crm/exploitation/ui/ui.module.css";
import { etatJalon, JALONS, type Jalons } from "./regles";
import s from "./conteneurs.module.css";

/*
 * Les jalons d'un conteneur, prévus et réels, l'un sous l'autre : une frise
 * verticale (fait, en retard, prévu) et deux dates par jalon. Sans état :
 * le composant se pose dans un formulaire, côté serveur ou navigateur.
 */
const ETATS = {
  fait: { libelle: "Fait", ton: "vert" },
  retard: { libelle: "En retard", ton: "rose" },
  prevu: { libelle: "Prévu", ton: "indigo" },
  vide: { libelle: "À planifier", ton: "gris" },
} as const;

export default function GrilleJalons({ jalons, aujourdhui }: { jalons: Jalons; aujourdhui: string }) {
  return (
    <ol className={s.jalons}>
      <li className={s.jalonsTete} aria-hidden>
        <span />
        <span>Jalon</span>
        <span>Prévu</span>
        <span>Réel</span>
        <span>État</span>
      </li>
      {JALONS.map((j) => {
        const e = etatJalon(jalons[j.cle], aujourdhui);
        return (
          <li key={j.cle} className={s.jalon} data-etat={e}>
            <i className={s.puceJalon} />
            <b>{j.libelle}</b>
            <span className={u.champ} style={{ gridColumn: "auto" }}>
              <input type="date" name={`jalon_${j.cle}_prevu`} defaultValue={jalons[j.cle]?.prevu ?? ""} aria-label={`${j.libelle}, date prévue`} />
            </span>
            <span className={u.champ} style={{ gridColumn: "auto" }}>
              <input type="date" name={`jalon_${j.cle}_reel`} defaultValue={jalons[j.cle]?.reel ?? ""} max={aujourdhui} aria-label={`${j.libelle}, date réelle`} />
            </span>
            <span>
              <i className={u.etat} data-ton={ETATS[e].ton}>
                {ETATS[e].libelle}
              </i>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
