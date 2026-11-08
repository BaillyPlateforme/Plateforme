/*
 * Les pictogrammes de la fiche : ceux des barres d'outils (Nouveau, Modifier,
 * Copier, Confirmer, Imprimer, Transfert, Signer…) et des sections, au trait,
 * sur la grille de 24, au même dessin que les icônes de la coque (ui/icones).
 */
const P = {
  nouveau: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
  modifier: '<path d="M4 20h4.2L19.4 8.8a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8z"/><path d="m13.5 6.3 4.2 4.2"/>',
  copier: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.6"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  confirmer: '<path d="M21.5 3 10.2 14.3"/><path d="M21.5 3 14.6 21l-4.4-6.7L3.5 9.9z"/>',
  imprimer: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2.2"/><path d="M7 14h10v6.5H7z"/><path d="M17.5 12h.01"/>',
  transfert: '<path d="M4 7.5h13.5M14 4l3.5 3.5L14 11"/><path d="M20 16.5H6.5M10 13l-3.5 3.5L10 20"/>',
  signer: '<path d="M3 17.5c2.2 0 3.1-3.8 4.6-3.8 1.6 0 .9 3.6 2.4 3.6 1.3 0 2.4-2.6 3.4-2.6.9 0 1.1 1.8 2.1 1.8.7 0 1.4-.6 2-1.3"/><path d="M3 21h18"/><path d="m14.5 4.5 3 3L11 14H8v-3z"/>',
  supprimer: '<path d="M4 6.5h16M9.5 6.5V4.5h5v2"/><path d="M6.2 6.5 7 19a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9l.8-12.5"/><path d="M10 10.5v6M14 10.5v6"/>',
  fiche: '<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><circle cx="8.5" cy="11" r="2.3"/><path d="M5 16.5a3.6 3.6 0 0 1 7 0M14.5 9.5h4M14.5 13h4"/>',
  adresses: '<path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  inventaire: '<path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z"/><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"/>',
  suivi: '<path d="M5 3.5h10l4 4v13H5z"/><path d="M14.5 3.5v4.5H19M8.5 12.5h7M8.5 16h5"/>',
  deplier: '<path d="m7 4 5 5 5-5M7 20l5-5 5 5"/>',
  replier: '<path d="m7 9 5-5 5 5M7 15l5 5 5-5"/>',
  rafraichir: '<path d="M20 11a8 8 0 0 0-14.7-4.3M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.7 4.3M20 20v-4h-4"/>',
  chrono: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5"/><path d="M13.5 6h7M13.5 11h5M13.5 16h3"/>',
  anti: '<path d="M7 20V4M3.5 7.5 7 4l3.5 3.5"/><path d="M13.5 6h3M13.5 11h5M13.5 16h7"/>',
  agenda: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18M12 13.2v5M9.5 15.7h5"/>',
  espace: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  visite: '<path d="M9 4h6v3H9z"/><path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15"/><path d="m9 13.5 2 2 4-4"/>',
  tablette: '<rect x="4.5" y="2.5" width="15" height="19" rx="3"/><path d="M10.5 18h3"/>',
  camion: '<path d="M2 5.5h12.5v10H2zM14.5 9h4l3 3v3.5h-7"/><circle cx="6" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  partenaire: '<circle cx="8.5" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M2.5 19.5a6 6 0 0 1 12 0M14.5 14.2a5 5 0 0 1 7 5.3"/>',
  facture: '<path d="M5 2.5v19l2.5-1.5 2.5 1.5 2-1.5 2 1.5 2.5-1.5 2.5 1.5v-19z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  euro: '<path d="M18 7.5A7 7 0 1 0 18 16.5"/><path d="M4 10.5h9M4 13.5h9"/>',
  contact: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mail: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m21 7-9 5.5L3 7"/>',
  message: '<path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 3.5V7A1.5 1.5 0 0 1 4 5.5z"/><path d="M8 10h8M8 13.5h5"/>',
  document: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h4.5"/>',
  historique: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4.5H8M12 7.5V12l3 2"/>',
  entrepot: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8M7 17h10"/>',
  service: '<path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  commun: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.25 13.5v7.5M13.5 17.25H21"/>',
  alerte: '<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  lien: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  telephone: '<path d="M5 3.5h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.6 6.6l1.4-2.3 4.5 1.8V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z"/>',
  planifier: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18M8.5 15.2l2.3 2.3 4.7-4.7"/>',
  photo: '<path d="M4 7.5h3l1.8-2.5h6.4L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5z"/><circle cx="12" cy="13.3" r="3.6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  fermer: '<path d="M6 6l12 12M18 6 6 18"/>',
  conteneur: '<rect x="2.5" y="6" width="19" height="12" rx="1.6"/><path d="M6.5 9v6M10 9v6M13.5 9v6M17 9v6"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  perdu: '<circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>',
} as const;

export type NomPicto = keyof typeof P;

export function Picto({ nom, taille = 18, className }: { nom: NomPicto; taille?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: P[nom] }}
    />
  );
}
