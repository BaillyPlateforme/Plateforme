"use client";

import { useEffect } from "react";
import { Icone } from "../../../../_ui/Icone";

/** Le bouton « Imprimer » ; `auto` (lien « Imprimer » du hub) : la boîte d'impression s'ouvre à l'arrivée. */
export function Imprimer({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    // Le temps que les polices et le logo soient là.
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [auto]);

  return (
    <button type="button" className="btn btn-primary btn-sm cl-imprimer" onClick={() => window.print()}>
      <Icone nom="download" /> Imprimer
    </button>
  );
}
