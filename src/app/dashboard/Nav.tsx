"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

const LINKS: { href: string; label: string; icon: string }[] = [
  { href: "/dashboard", label: "Demandes", icon: "◈" },
  { href: "/dashboard/stats", label: "Statistiques", icon: "▲" },
  { href: "/dashboard/grilles", label: "Grilles tarifaires", icon: "▦" },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-7">
        <div className="font-serif text-2xl font-semibold tracking-tight">Bailly</div>
        <div className="text-xs uppercase tracking-widest text-ink-soft">Pilotage</div>
      </div>

      <nav className="mt-8 flex-1 space-y-1 px-3">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-accent-soft/60 font-medium text-ink"
                  : "text-ink-soft hover:bg-accent-soft/25 hover:text-ink"
              }`}
            >
              <span className={active ? "text-accent" : "text-ink-soft/60"}>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="truncate px-2 pb-2 text-xs text-ink-soft" title={email}>
          {email}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-accent-soft/25 hover:text-ink"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}
