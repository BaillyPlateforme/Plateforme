"use client";

import { OUVRIR_DISCUSSION } from "./evenements";

/**
 * « Ouvrir le chat » : ouvre la bulle de discussion de la page (BulleDiscussion
 * écoute l'événement). Le lien reste celui de la page « Mon conseiller », pour
 * un nouvel onglet ou si la bulle n'est pas là.
 */
export function BoutonChat({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const ecoute = window.dispatchEvent(new CustomEvent(OUVRIR_DISCUSSION, { cancelable: true }));
        // La bulle annule l'événement quand elle s'ouvre : sinon, le lien mène à la page.
        if (!ecoute) e.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
