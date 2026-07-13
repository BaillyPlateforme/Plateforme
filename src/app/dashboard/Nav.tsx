"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

const LINKS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/dashboard", label: "Demandes", icon: <IconInbox /> },
  { href: "/dashboard/analyse", label: "Analyse", icon: <IconChart /> },
  { href: "/dashboard/playground", label: "Playground", icon: <IconSparkle /> },
  { href: "/dashboard/configuration", label: "Configuration", icon: <IconGear /> },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Marque */}
      <div className="px-6 pt-7">
        <div className="font-serif text-[26px] font-semibold leading-none">Bailly</div>
        <div className="eyebrow mt-1.5 text-ink-soft">Déménagement</div>
      </div>

      <div className="mx-6 my-6 h-px bg-line" />

      <nav className="flex-1 space-y-0.5 px-3">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm transition ${
                active
                  ? "bg-accent-soft font-medium text-accent-dark"
                  : "text-ink-soft hover:bg-subtle hover:text-ink"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
              )}
              <span className={active ? "text-accent" : "text-ink-soft/70 group-hover:text-ink"}>
                {l.icon}
              </span>
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">
            {email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-ink" title={email}>
              {email}
            </div>
            <div className="text-[11px] text-ink-soft">Équipe Bailly</div>
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
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M21 21H3V3" strokeLinecap="round" />
      <path d="M7 14l3-3 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" strokeLinecap="round" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
