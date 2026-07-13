"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

const LINKS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/dashboard", label: "Demandes", icon: <IconInbox /> },
  { href: "/dashboard/stats", label: "Statistiques", icon: <IconChart /> },
  { href: "/dashboard/grilles", label: "Grilles tarifaires", icon: <IconGrid /> },
  { href: "/dashboard/playground", label: "Playground", icon: <IconSparkle /> },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink font-serif text-sm font-semibold text-white">
          B
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Bailly</div>
          <div className="text-[10px] uppercase tracking-widest text-ink-soft">Pilotage</div>
        </div>
      </div>

      <nav className="mt-7 flex-1 space-y-0.5 px-3">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-accent-soft font-medium text-ink"
                  : "text-ink-soft hover:bg-subtle hover:text-ink"
              }`}
            >
              <span
                className={`transition ${active ? "text-ink" : "text-ink-soft/70 group-hover:text-ink"}`}
              >
                {l.icon}
              </span>
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-subtle text-xs font-medium">
            {email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-ink" title={email}>
              {email}
            </div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-subtle hover:text-ink"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

function IconInbox() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="18" y1="20" x2="18" y2="10" strokeLinecap="round" />
      <line x1="12" y1="20" x2="12" y2="4" strokeLinecap="round" />
      <line x1="6" y1="20" x2="6" y2="14" strokeLinecap="round" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" strokeLinecap="round" />
    </svg>
  );
}
