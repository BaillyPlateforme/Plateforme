import { getUser } from "@/lib/supabase/auth";
import Nav from "./Nav";
import ModeSwitch from "@/components/ModeSwitch";
import RefreshButton from "@/components/RefreshButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <div className="relative z-10 flex min-h-screen">
      <ModeSwitch current="dashboard" />
      <RefreshButton />
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-[#fbfaf9] md:block">
        <Nav email={user?.email ?? ""} />
      </aside>
      <div className="flex-1 md:ml-64">{children}</div>
    </div>
  );
}
