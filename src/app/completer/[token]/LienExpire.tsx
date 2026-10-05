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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-6 py-16 text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="halo absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2"
          style={{ "--halo": "color-mix(in srgb, var(--color-brand) 30%, transparent)" } as CSSProperties}
        />
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
        <p className="eyebrow reveal mt-10 text-brand-ink">Votre demande</p>
        <h1 className="font-serif reveal mt-4 text-balance text-[36px] sm:text-[46px]" style={{ "--d": "80ms" } as CSSProperties}>
          Ce lien n&apos;est plus <span className="gradient-text">actif</span>
        </h1>
        <p className="reveal mx-auto mt-4 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-soft" style={{ "--d": "160ms" } as CSSProperties}>
          Votre demande a sans doute déjà été complétée : dans ce cas, tout est en ordre et nos
          équipes reviennent vers vous. Sinon, appelez-nous ou refaites une estimation en ligne.
        </p>
        <div className="reveal mt-9 flex flex-wrap justify-center gap-3" style={{ "--d": "240ms" } as CSSProperties}>
          <Link
            href="/"
            className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[14.5px] font-semibold text-shell transition active:scale-[0.98]"
          >
            Faire une estimation
          </Link>
          <a
            href="tel:+33169103520"
            className="inline-flex h-12 items-center rounded-full border border-line-strong bg-card px-6 text-[14.5px] font-semibold transition hover:border-ink"
          >
            01 69 10 35 20
          </a>
        </div>
      </div>
    </div>
  );
}
