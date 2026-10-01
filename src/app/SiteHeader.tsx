"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * En-tête de la page d'accueil. Transparent sur la photo, il se pose sur un
 * fond clair dès qu'on quitte le héros.
 *
 * L'état est écrit directement dans la classe du nœud : un `useState` ici
 * ferait re-rendre la page entière à chaque pixel de défilement.
 */
export default function SiteHeader({
  onChoisir,
}: {
  onChoisir: (p: "express" | "complet") => void;
}) {
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
      className="site-header fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300"
    >
      <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center justify-between px-6 lg:px-10">
        {/* Deux fichiers pour deux fonds : le blanc sur la photo, le couleur
            dès que l'en-tête se pose. */}
        <Link href="/" className="relative block h-9 w-[150px] shrink-0" aria-label="Bailly Déménagement">
          <Image
            src="/marque/bailly-logo-blanc.svg"
            alt="Bailly Déménagement"
            fill
            priority
            className="site-logo-sombre object-contain object-left"
          />
          <Image
            src="/marque/bailly-logo.svg"
            alt=""
            fill
            aria-hidden
            className="site-logo-clair object-contain object-left"
          />
        </Link>

        <nav className="hidden items-center gap-8 text-[13.5px] md:flex">
          <a href="#parcours" className="site-link transition">
            Comment ça marche
          </a>
          <a href="#formules" className="site-link transition">
            Nos formules
          </a>
          <a href="#promesses" className="site-link transition">
            Pourquoi nous
          </a>
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onChoisir("express")}
            className="site-ghost hidden rounded-full border px-4 py-2 text-[13px] font-medium transition sm:inline-flex"
          >
            Devis express
          </button>
          <button
            type="button"
            onClick={() => onChoisir("complet")}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-[#1b1a18] shadow-lg shadow-black/20 transition hover:bg-[#e0b81a]"
          >
            Mon devis
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h13M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* L'accès de l'équipe : une clé sans libellé, à peine visible, qui
              ne s'adresse qu'à ceux qui savent déjà qu'elle est là. */}
          <Link
            href="/login"
            rel="nofollow"
            title="Espace équipe"
            aria-label="Espace équipe"
            className="site-cle flex h-9 w-9 items-center justify-center rounded-full transition"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="15" r="4" />
              <path d="m10.8 12.2 8.2-8.2M17 6l2 2M14 9l2 2" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
