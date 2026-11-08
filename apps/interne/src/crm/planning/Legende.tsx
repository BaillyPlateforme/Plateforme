import { Ic } from "@/crm/lib/icons";
import s from "./planning.module.css";

/*
 * La légende des couleurs du planning, la même au planning commercial et au
 * planificateur de visite : les quatre sortes de rendez-vous, puis l'état
 * d'une visite (faite, devis établi, sans suite) et le créneau proposé au
 * client. Les pastilles reprennent l'habit des blocs (crm.css).
 */

const TYPES = [
  ["phys", "Visite sur place"],
  ["visio", "Visio"],
  ["tache", "Tâche"],
  ["perso", "Perso / règle"],
] as const;

export default function LegendePlanning({ className = "" }: { className?: string }) {
  return (
    <div className={`${s.legende} ${className}`} role="list" aria-label="Légende des couleurs du planning">
      {TYPES.map(([t, libelle]) => (
        <span key={t} role="listitem">
          <i className={`${s.pastille} t-${t}`} data-type={t} aria-hidden />
          {libelle}
        </span>
      ))}
      <i className={s.sep} aria-hidden />
      <span role="listitem">
        <i className={`${s.pastille} ${s.pastilleFaite}`} aria-hidden>
          <Ic n="check" />
        </i>
        Visite faite
      </span>
      <span role="listitem">
        <i className={s.pastilleDevis} aria-hidden>
          <Ic n="check" />
        </i>
        Devis établi
      </span>
      <span role="listitem">
        <i className={s.pastilleProposee} aria-hidden />
        Créneau proposé au client
      </span>
      <span role="listitem">
        <s className={s.sansSuite}>Sans suite</s>
      </span>
    </div>
  );
}
