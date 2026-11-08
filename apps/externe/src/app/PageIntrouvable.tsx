"use client";

import Image from "next/image";
import Link from "next/link";
import { AGENCE, halo } from "@/app/demande/cadre";

/**
 * Une adresse inconnue du site (voir not-found.tsx). Même dessin que la page
 * d'un espace pro indisponible (pro/[code]/[slug]/EspaceIndisponible.tsx) ;
 * client, comme elle, parce que le cadre du site (cadre.tsx) l'est.
 */
export default function PageIntrouvable() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-6 py-16 text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="halo absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2" style={halo(30)} />
      </div>
      <div className="relative z-10 w-full max-w-lg text-center">
        <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} priority className="mx-auto h-auto w-[160px]" />
        <h1 className="font-serif mt-10 text-balance text-[36px] sm:text-[46px]">Cette page n&apos;existe pas</h1>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[14.5px] font-semibold text-shell transition active:scale-[0.98]">
            Faire une estimation
          </Link>
          <a href={AGENCE.lien} className="inline-flex h-12 items-center rounded-full border border-line-strong bg-card px-6 text-[14.5px] font-semibold transition hover:border-ink">
            {AGENCE.numero}
          </a>
        </div>
      </div>
    </div>
  );
}
