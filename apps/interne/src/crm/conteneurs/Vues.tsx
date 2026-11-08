import MenuVertical from "@/ui/MenuVertical";

/*
 * Les deux vues des conteneurs, dans le menu de gauche (décision de David du
 * 08/11/2026 : les vues vont dans le menu, jamais dans le bandeau) : la liste
 * des conteneurs, et le dispatch international — ses plans de groupage —,
 * qui n'est plus une entrée de la navigation.
 */
export default function VuesConteneurs({ vue, conteneurs, plans }: { vue: "conteneurs" | "dispatch"; conteneurs: number; plans: number }) {
  return (
    <MenuVertical
      titre="Conteneurs"
      groupes={[
        {
          items: [
            { href: "/conteneurs", label: "Conteneurs", icone: "bateau", actif: vue === "conteneurs", nombre: conteneurs },
            { href: "/conteneurs/dispatch", label: "Dispatch", icone: "dispatch", actif: vue === "dispatch", nombre: plans },
          ],
        },
      ]}
    />
  );
}
