import MenuVertical from "@/ui/MenuVertical";
import s from "./planning.module.css";

/*
 * Le planning commercial est un seul écran (simplification du 08/11/2026),
 * avec trois vues au menu de gauche (choix de David : les vues à gauche, les
 * filtres dans la bande) : la semaine des rendez-vous, les visites
 * techniques (l'ancienne page /visites) et les dates souhaitées par les
 * clients du site (l'ancien « Agenda » des questionnaires, /dashboard/agenda).
 */
export type VuePlanning = "semaine" | "visites" | "dates";

export const vuePlanning = (v: unknown): VuePlanning => (v === "visites" || v === "dates" ? v : "semaine");

/** La rangée du bas du bandeau du planning (les commerciaux) : elle défile sur un écran étroit au lieu de déborder. */
export function BasPlanning({ children }: { children: React.ReactNode }) {
  return <div className={s.bas}>{children}</div>;
}

export default function MenuPlanning({ actif }: { actif: VuePlanning }) {
  return (
    <MenuVertical
      titre="Planning"
      groupes={[
        {
          items: [
            { href: "/planning", label: "Semaine", icone: "calendrier", actif: actif === "semaine" },
            { href: "/planning?vue=visites", label: "Visites techniques", icone: "oeil", actif: actif === "visites" },
            { href: "/planning?vue=dates", label: "Dates souhaitées", icone: "horloge", actif: actif === "dates" },
          ],
        },
      ]}
    />
  );
}
