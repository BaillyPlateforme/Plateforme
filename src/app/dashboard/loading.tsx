/**
 * Squelette de chargement du tableau de bord.
 *
 * Sans lui, un clic dans le menu ne peignait rien tant que le serveur n'avait
 * pas fini : la page restait figée sur l'écran précédent pendant tout le
 * rendu. Avec cette frontière, la navigation est immédiate — le rail et la
 * barre du haut restent en place, le contenu s'affiche en attente — et
 * Next.js peut précharger la coque des pages au survol des liens.
 */
export default function Loading() {
  return (
    <div className="animate-pulse px-6 py-8 md:px-10">
      <div className="mb-6 h-9 w-44 rounded-full bg-subtle" />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-line bg-card" />
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-card p-5">
        {Array.from({ length: 7 }).map((_, i) => (
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
