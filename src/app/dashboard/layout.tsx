import { getUser } from "@/lib/supabase/auth";
import Nav, { NavMobile } from "./Nav";
import TopBar from "./TopBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar email={user?.email ?? ""} />
      <NavMobile />
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 bg-card md:block">
          <div className="sticky top-[65px] h-[calc(100vh-65px)]">
            <Nav />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
