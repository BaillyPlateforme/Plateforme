import { getUserAffichage } from "@/lib/supabase/auth";
import { compterNouvelles } from "@/lib/requests";
import Nav from "./Nav";
import TopBar from "./TopBar";

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

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-[218px] md:block">
        <Nav email={user?.email ?? ""} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col md:ml-[218px]">
        <TopBar nouvelles={nouvelles} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
