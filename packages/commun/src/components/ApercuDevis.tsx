"use client";

import { useState } from "react";

/**
 * L'aperçu d'un devis, sans téléchargement.
 *
 * Le PDF est servi par `/api/devis/[id]/pdf` ; une iframe le montre tel quel,
 * avec la visionneuse du navigateur. On ne le charge qu'à l'ouverture : un
 * tableau de cinquante devis ne va pas rendre cinquante PDF.
 */
export default function ApercuDevis({
  devisId,
  reference,
  ouvert: ouvertInitial = false,
  hauteur = 620,
}: {
  devisId: string;
  reference?: string | null;
  ouvert?: boolean;
  hauteur?: number;
}) {
  const [ouvert, setOuvert] = useState(ouvertInitial);
  const url = `/api/devis/${devisId}/pdf`;

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-3 bg-paper px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          className="text-sm font-medium transition hover:text-brand-ink"
        >
          {ouvert ? "Masquer l'aperçu" : "Aperçu du devis"}
          {reference ? <span className="ml-2 font-normal text-ink-soft">{reference}</span> : null}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-[12.5px] text-ink-soft transition hover:text-ink"
        >
          Ouvrir dans un onglet
        </a>
        <a href={url} download className="text-[12.5px] text-ink-soft transition hover:text-ink">
          Télécharger
        </a>
      </div>
      {ouvert && (
        // <object> plutôt qu'<iframe> : les navigateurs sans visionneuse PDF
        // intégrée affichent alors le repli plutôt qu'un cadre vide.
        <object
          data={`${url}#toolbar=0&navpanes=0`}
          type="application/pdf"
          aria-label={`Devis ${reference ?? ""}`}
          className="w-full border-t border-line bg-subtle"
          style={{ height: hauteur }}
        >
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-ink-soft">
              Votre navigateur n&apos;affiche pas les PDF directement.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark"
            >
              Ouvrir le devis
            </a>
          </div>
        </object>
      )}
    </div>
  );
}
