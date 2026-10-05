"use client";

import Image from "next/image";
import Link from "next/link";
import { AGENCE, delai, halo } from "@/app/demande/cadre";

/**
 * Le lien d'un espace pro qui n'existe pas, ou que l'équipe a mis en pause.
 *
 * Le visiteur vient d'un lien qu'on lui a transmis : il n'a rien fait de
 * travers. On lui dit simplement quoi faire à la place.
 */
export default function EspaceIndisponible() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-6 py-16 text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="halo absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2" style={halo(30)} />
      </div>

      <div className="relative z-10 w-full max-w-lg text-center">
        <Image
          src="/marque/bailly-logo.svg"
          alt="Bailly Déménagement"
          width={200}
          height={64}
          priority
          className="mx-auto h-auto w-[160px]"
        />
        <p className="eyebrow reveal mt-10 text-brand-ink">Espace pro</p>
        <h1 className="font-serif reveal mt-4 text-balance text-[36px] sm:text-[46px]" style={delai(80)}>
          Cet espace n&apos;est pas <span className="gradient-text">disponible</span>
        </h1>
        <p className="reveal mx-auto mt-4 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-soft" style={delai(160)}>
          Le lien que vous avez suivi n&apos;est plus actif, ou son adresse est incomplète. Vérifiez-le
          auprès de votre entreprise — ou faites votre demande directement auprès de nos équipes.
        </p>
        <div className="reveal mt-9 flex flex-wrap justify-center gap-3" style={delai(240)}>
          <Link
            href="/"
            className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[14.5px] font-semibold text-shell transition active:scale-[0.98]"
          >
            Faire une estimation
          </Link>
          <a
            href={AGENCE.lien}
            className="inline-flex h-12 items-center rounded-full border border-line-strong bg-card px-6 text-[14.5px] font-semibold transition hover:border-ink"
          >
            {AGENCE.numero}
          </a>
        </div>
      </div>
    </div>
  );
}
