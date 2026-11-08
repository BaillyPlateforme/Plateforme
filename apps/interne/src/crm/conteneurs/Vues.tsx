import { Pilules } from "@/ui/Bandeau";

/*
 * Les deux vues des conteneurs, dans la rangée basse du bandeau
 * (simplification du 08/11/2026) : la liste des conteneurs, et le dispatch
 * international — ses plans de groupage — qui n'est plus une entrée du menu.
 */
export default function VuesConteneurs({ vue, conteneurs, plans }: { vue: "conteneurs" | "dispatch"; conteneurs: number; plans: number }) {
  return (
    <Pilules
      label="Vues des conteneurs"
      items={[
        { href: "/conteneurs", label: "Conteneurs", actif: vue === "conteneurs", nombre: conteneurs },
        { href: "/conteneurs/dispatch", label: "Dispatch", actif: vue === "dispatch", nombre: plans },
      ]}
    />
  );
}
