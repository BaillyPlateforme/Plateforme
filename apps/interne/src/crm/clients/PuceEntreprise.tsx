import type { Entreprise } from "./entreprises";
import s from "./clients.module.css";

/**
 * L'entreprise (espace pro) d'un client : son logo — ou sa couleur — et son
 * nom, sur une pastille bleu ciel, la teinte des comptes.
 */
export default function PuceEntreprise({ e, mini = false, titre }: { e: Pick<Entreprise, "nom" | "logo" | "couleur">; mini?: boolean; titre?: string }) {
  return (
    <span className={s.entreprise} data-mini={mini ? "" : undefined} title={titre ?? `Rattaché à ${e.nom} : ses dossiers paraissent dans l'espace RH de l'entreprise`}>
      <i aria-hidden>
        {e.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo de l'entreprise, servi par l'app externe
          <img src={e.logo} alt="" />
        ) : (
          <b style={{ background: e.couleur }} />
        )}
      </i>
      <span>{e.nom}</span>
    </span>
  );
}
