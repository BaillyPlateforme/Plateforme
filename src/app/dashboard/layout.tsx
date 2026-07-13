import { getUser } from "@/lib/supabase/auth";
import Nav from "./Nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <div className="relative z-10 flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-card md:block">
        <Nav email={user?.email ?? ""} />
      </aside>
      <div className="flex-1 md:ml-60">{children}</div>
    </div>
  );
}
