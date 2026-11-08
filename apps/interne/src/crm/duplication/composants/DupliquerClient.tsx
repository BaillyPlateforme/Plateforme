import Link from "next/link";
import { abandonnerClientDuplique, dupliquerClient } from "@/crm/clients/actions";
import { Icone } from "@/ui/icones";
import { A_VALIDER, CLIENT } from "../textes";
import CeQuiSuit from "./CeQuiSuit";
import s from "../duplication.module.css";

/*
 * « Dupliquer la fiche » d'un client (« ⋯ » de sa fiche, ?dupliquer=1) : le
 * panneau qui dit ce qui suit et ce qui ne suit pas, en tête de « Identité et
 * contacts ». L'usage : un deuxième salarié ou contact de la même société.
 */
export function ConfirmerDuplicationClient({ id, nom }: { id: number; nom: string }) {
  return (
    <form action={dupliquerClient.bind(null, id)} className={s.panneau}>
      <div className={s.panneauTete}>
        <span className={s.panneauIcone}>
          <Icone nom="dupliquer" taille={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>Dupliquer la fiche de {nom}</h3>
          <p>Une nouvelle fiche pour un autre contact ou salarié de la même société. Elle s&apos;ouvre en modification : le nom est à saisir.</p>
        </div>
      </div>
      <CeQuiSuit inventaire={CLIENT} />
      <div className={s.boutons}>
        <i className={s.aValider} title="Nouveaux textes, à valider par l'équipe">{A_VALIDER}</i>
        <Link href={`/clients/${id}#identite`} className={s.discret} scroll={false}>
          Annuler
        </Link>
        <button type="submit" className={s.principal}>
          <Icone nom="dupliquer" taille={17} />
          Dupliquer la fiche
        </button>
      </div>
    </form>
  );
}

/** Le geste « Renoncer » du bandeau d'une fiche tout juste dupliquée, tant qu'elle est vide. */
export function RenoncerDuplicationClient({ id, source }: { id: number; source: number }) {
  return (
    <form action={abandonnerClientDuplique.bind(null, id, source)}>
      <button type="submit" className={s.discret} style={{ height: 36 }} title="Supprimer cette nouvelle fiche, tant que rien n'y est saisi">
        Renoncer
      </button>
    </form>
  );
}
