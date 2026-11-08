import MenuVertical from "@/ui/MenuVertical";

/** Le menu vertical de la création de dossier (plus de sous-onglets dans le bandeau). */
export default function MenuCreation({ page }: { page: "nouveau" | "modeles" }) {
  return (
    <MenuVertical
      titre="Création de dossier"
      groupes={[
        {
          items: [
            { href: "/dossiers/nouveau", label: "Nouveau dossier", icone: "plus", actif: page === "nouveau" },
            { href: "/dossiers/modeles", label: "Modèles de dossier", icone: "grille", actif: page === "modeles" },
          ],
        },
        { titre: "Ensuite", items: [{ href: "/dossiers", label: "Clients et dossiers", icone: "clients" }] },
      ]}
    />
  );
}
