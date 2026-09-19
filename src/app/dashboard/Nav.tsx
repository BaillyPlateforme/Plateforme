"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { estActif, groupeDe } from "./nav-items";

/**
 * Le rail : uniquement les entrées de l'univers ouvert. Les trois univers se
 * choisissent en haut — ici on ne montre qu'un niveau, pour qu'il n'y ait
 * plus une liste de quinze liens à parcourir.
 */
export default function Nav() {
  const pathname = usePathname();
  const groupe = groupeDe(pathname);

  return (
    <div className="flex h-full flex-col px-3 py-5">
      <div className="eyebrow px-3 pb-2 text-[10px] text-ink-soft">{groupe.label}</div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {groupe.items.map((item) => {
          const on = estActif(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                on ? "bg-accent-soft" : "hover:bg-subtle"
              }`}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
                style={
                  on
                    ? { color: item.color, background: `color-mix(in srgb, ${item.color} 16%, white)` }
                    : undefined
                }
              >
                <span className={on ? "" : "text-ink-soft group-hover:text-ink"}>{item.icon}</span>
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-[13.5px] leading-tight ${on ? "font-semibold" : ""}`}
                >
                  {item.label}
                </span>
                <span className="block truncate text-[11px] leading-tight text-ink-soft">
                  {item.hint}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-2xl bg-subtle p-3">
        <div className="text-[12px] font-medium">Besoin d&apos;un chiffrage&nbsp;?</div>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">
          Le simulateur applique la grille en direct.
        </p>
        <Link
          href="/dashboard/simulateur"
          className="mt-2 inline-flex rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-accent-dark"
        >
          Ouvrir
        </Link>
      </div>
    </div>
  );
}

/** Même navigation, en ligne : sur mobile le rail n'est pas affiché. */
export function NavMobile() {
  const pathname = usePathname();
  const groupe = groupeDe(pathname);

  return (
    <div className="flex gap-1.5 overflow-x-auto border-b border-line bg-card px-4 py-2 md:hidden">
      {groupe.items.map((item) => {
        const on = estActif(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] transition ${
              on ? "bg-accent-soft font-medium text-accent-dark" : "text-ink-soft hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
