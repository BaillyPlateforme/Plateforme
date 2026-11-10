"use client";

/** « Imprimer ou enregistrer en PDF » : la boîte d'impression du navigateur, qui sait aussi enregistrer en PDF. */
export function Imprimer({ className }: { className: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
      </svg>
      Enregistrer en PDF ou imprimer
    </button>
  );
}
