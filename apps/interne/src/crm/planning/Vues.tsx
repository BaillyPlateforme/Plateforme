import { Pilules } from "@/ui/Bandeau";
import s from "./planning.module.css";

/*
 * Le planning commercial est un seul écran (simplification du 08/11/2026),
 * avec trois vues en pilules dans la rangée du bas du bandeau : la semaine
 * des rendez-vous, les visites techniques (l'ancienne page /visites) et les
 * dates souhaitées par les clients du site (l'ancien « Agenda » des
 * questionnaires, /dashboard/agenda).
 */
export type VuePlanning = "semaine" | "visites" | "dates";

export const vuePlanning = (v: unknown): VuePlanning => (v === "visites" || v === "dates" ? v : "semaine");

/** La rangée du bas du bandeau du planning : elle défile sur un écran étroit au lieu de déborder. */
export function BasPlanning({ children }: { children: React.ReactNode }) {
  return <div className={s.bas}>{children}</div>;
}

export default function VuesPlanning({ actif, separateur = false }: { actif: VuePlanning; separateur?: boolean }) {
  return (
    <>
      <Pilules
        label="Vues du planning"
        items={[
          { href: "/planning", label: "Semaine", actif: actif === "semaine" },
          { href: "/planning?vue=visites", label: "Visites techniques", actif: actif === "visites" },
          { href: "/planning?vue=dates", label: "Dates souhaitées", actif: actif === "dates" },
        ]}
      />
      {separateur && <i className={s.separateurBas} aria-hidden />}
    </>
  );
}
