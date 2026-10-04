import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Le lien de complétion a déjà servi, ou n'existe pas.
 *
 * Le plus souvent, le client a validé sa demande puis recliqué sur le bouton
 * de son message : tout va bien, il faut seulement le lui dire.
 */
export default function LienExpire() {
  return (
    <div className="grain relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#1b1a18] px-6 py-16">
      <div aria-hidden className="absolute inset-0">
        <Image src="/login-interieur.jpg" alt="" fill priority sizes="100vw" className="ken-burns object-cover" />
        <div className="absolute inset-0 bg-[#1b1a18]/72" />
        <div className="absolute inset-0 bg-linear-to-b from-[#1b1a18]/88 via-[#1b1a18]/45 to-[#1b1a18]/95" />
        <div
          className="halo drift absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2"
          style={{ "--halo": "rgba(245,208,51,0.2)" } as CSSProperties}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg text-center">
        <Image
          src="/marque/bailly-logo-blanc.svg"
          alt="Bailly Déménagement"
          width={200}
          height={64}
          priority
          className="mx-auto h-auto w-[160px]"
        />
        <p className="eyebrow reveal mt-10 text-brand">Votre demande</p>
        <h1 className="font-serif reveal mt-4 text-balance text-[36px] text-white sm:text-[46px]" style={{ "--d": "80ms" } as CSSProperties}>
          Ce lien n&apos;est plus <span className="gradient-flow-light">actif</span>
        </h1>
        <p className="reveal mx-auto mt-4 max-w-[46ch] text-[15.5px] leading-relaxed text-white/75" style={{ "--d": "160ms" } as CSSProperties}>
          Votre demande a sans doute déjà été complétée : dans ce cas, tout est en ordre et nos
          équipes reviennent vers vous. Sinon, appelez-nous ou refaites une estimation en ligne.
        </p>
        <div className="reveal mt-9 flex flex-wrap justify-center gap-3" style={{ "--d": "240ms" } as CSSProperties}>
          <Link
            href="/"
            className="inline-flex h-12 items-center rounded-full bg-brand px-6 text-[14.5px] font-semibold text-[#1b1a18] transition hover:bg-[#e0b81a]"
          >
            Faire une estimation
          </Link>
          <a
            href="tel:+33169103520"
            className="inline-flex h-12 items-center rounded-full border border-white/30 px-6 text-[14.5px] font-semibold text-white transition hover:border-white/70 hover:bg-white/10"
          >
            01 69 10 35 20
          </a>
        </div>
      </div>
    </div>
  );
}
