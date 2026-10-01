import { getUserAffichage } from "@/lib/supabase/auth";
import { compterNouvelles } from "@/lib/requests";
import Nav from "./Nav";
import TopBar from "./TopBar";

/**
 * La coque occupe toute la page : le sol gris très clair va d'un bord à
 * l'autre, et le menu reste la carte blanche de la maquette, posée dessus.
 * Le défilement se fait à l'intérieur — le menu et la barre du haut ne
 * bougent jamais.
 */
/** L'espace équipe reste hors des moteurs de recherche. */
export const metadata = {
  title: "Espace équipe — Bailly",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // De front : deux allers-retours en séquence coûtaient le double.
  const [user, nouvelles] = await Promise.all([
    getUserAffichage(),
    compterNouvelles().catch(() => 0),
  ]);

  // La date est calculée ici : la barre du haut est un composant client, et y
  // lire l'horloge au rendu ferait diverger le serveur du navigateur.
  const jour = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="flex h-dvh">
      <div className="flex w-full overflow-hidden bg-shell">
        <div className="hidden shrink-0 py-5 pl-5 md:block">
          <Nav email={user?.email ?? ""} nouvelles={nouvelles} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar nouvelles={nouvelles} email={user?.email ?? ""} jour={jour} />
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
