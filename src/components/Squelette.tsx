/** Barres grises en attente de données — même gabarit partout. */
export function Squelette({ lignes = 6, titre = true }: { lignes?: number; titre?: boolean }) {
  return (
    <div className="animate-pulse">
      {titre && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-line bg-card" />
          ))}
        </div>
      )}
      <div className="space-y-3 rounded-2xl border border-line bg-card p-5">
        {Array.from({ length: lignes }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-40 rounded-full bg-subtle" />
            <div className="h-4 flex-1 rounded-full bg-subtle" />
            <div className="h-4 w-20 rounded-full bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Attente d'une grille de cartes (tableau de bord, focus). */
export function SqueletteCartes({ n = 6 }: { n?: number }) {
  return (
    <div className="grid animate-pulse gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-52 rounded-2xl border border-line bg-card" />
      ))}
    </div>
  );
}

/** Message d'échec, avec une seconde chance. */
export function Echec({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-warn/30 bg-warn/5 p-6 text-sm">
      <p>Chargement impossible : {message}</p>
      <button
        onClick={onRetry}
        className="mt-3 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-accent-dark"
      >
        Réessayer
      </button>
    </div>
  );
}
