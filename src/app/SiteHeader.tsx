"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * En-tête de la page d'accueil. Transparent sur la photo, il se pose sur un
 * fond clair dès qu'on quitte le héros.
 *
 * L'état est écrit directement dans la classe du nœud : un `useState` ici
 * ferait re-rendre la page entière à chaque pixel de défilement.
 */
export default function SiteHeader() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pose = false;
    const onScroll = () => {
      const veut = window.scrollY > window.innerHeight - 90;
      if (veut === pose) return;
      pose = veut;
      el.classList.toggle("header-pose", veut);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      ref={ref}
      className="site-header fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300"
    >
      <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand text-[#1b1a18]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M2 8h11v9H2zM13 11h4.5l3.5 3.5V17h-8z" strokeLinejoin="round" />
              <circle cx="6.5" cy="18.5" r="1.8" />
              <circle cx="17.5" cy="18.5" r="1.8" />
            </svg>
          </span>
          <span className="leading-none">
            <span className="site-title block font-serif text-[17px] font-semibold tracking-tight">
              Bailly
            </span>
            <span className="site-sub block text-[10.5px] uppercase tracking-[0.18em]">
              Déménagement
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-[13.5px] md:flex">
          <a href="#parcours" className="site-link transition">
            Comment ça marche
          </a>
          <a href="#formules" className="site-link transition">
            Nos formules
          </a>
          <a href="#equipe" className="site-link transition">
            Espace équipe
          </a>
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="site-ghost hidden rounded-full border px-4 py-2 text-[13px] font-medium transition sm:inline-flex"
          >
            Connexion
          </Link>
          <Link
            href="/demande"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-[#1b1a18] shadow-lg shadow-black/20 transition hover:bg-[#e0b81a]"
          >
            Mon devis
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h13M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
