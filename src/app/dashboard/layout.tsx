import { getUserAffichage } from "@/lib/supabase/auth";
import { compterNouvelles } from "@/lib/requests";
import Nav from "./Nav";
import TopBar from "./TopBar";

/**
 * La coque de l'espace équipe.
 *
 * L'application n'occupe plus toute la page : elle est posée, en carte
 * blanche à coins ronds, sur le fond de verdure du site. Le défilement se
 * fait à l'intérieur — le rail et la barre du haut ne bougent jamais.
 */
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

  // La date est calculée ici : la barre du haut est un composant client, et
  // y lire l'horloge au rendu ferait diverger le serveur du navigateur.
  const jour = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="flex h-dvh p-2.5 md:p-4">
      <div className="flex w-full overflow-hidden rounded-[26px] bg-card shadow-[var(--shadow-coque)]">
        <aside className="hidden w-[232px] shrink-0 border-r border-line md:flex">
          <Nav email={user?.email ?? ""} nouvelles={nouvelles} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar nouvelles={nouvelles} email={user?.email ?? ""} jour={jour} />
          <main className="min-w-0 flex-1 overflow-y-auto bg-paper">{children}</main>
        </div>
      </div>
    </div>
  );
}
