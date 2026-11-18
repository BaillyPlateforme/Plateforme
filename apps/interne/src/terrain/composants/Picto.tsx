/*
 * Les pictogrammes de l'outil terrain, au trait, sur la grille de 24 — le
 * dessin de ceux de la coque (src/ui/icones.tsx), un peu plus gras pour se
 * lire de loin sur un écran au soleil.
 */
const P = {
  appareil: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2l1.6-2.2A1.8 1.8 0 0 1 10.6 3h2.8a1.8 1.8 0 0 1 1.5.8L16.5 6h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="12.8" r="3.8"/>',
  galerie: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 15.5-4.8-4.8L6 20.5"/>',
  retour: '<path d="m15 18-6-6 6-6"/>',
  suite: '<path d="m9 18 6-6-6-6"/>',
  position: '<path d="M19.5 10.2c0 5.6-7.5 11.3-7.5 11.3s-7.5-5.7-7.5-11.3a7.5 7.5 0 0 1 15 0z"/><circle cx="12" cy="10.2" r="2.7"/>',
  camion: '<path d="M2 5.5h12.5v10H2zM14.5 9h4l3 3v3.5h-7"/><circle cx="6" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coche: '<path d="M20 6 9 17l-5-5"/>',
  alerte: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  recharger: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  sortie: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  cle: '<circle cx="7.5" cy="15.5" r="4"/><path d="m10.4 12.6 9.1-9.1M17 6l2.5 2.5M14.5 8.5 16.5 10.5"/>',
  note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  croix: '<path d="M18 6 6 18M6 6l12 12"/>',
  poubelle: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  telecharger: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  itineraire: '<path d="m3 11 18-8-8 18-2-8z"/>',
  carton: '<path d="m21 8-9-5-9 5v8l9 5 9-5zM3.3 7.5 12 12l8.7-4.5M12 22V12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  calendrier: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  bureau: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  // La tablette de visite technique (src/crm/visites/tablette).
  plus: '<path d="M12 5v14M5 12h14"/>',
  moins: '<path d="M5 12h14"/>',
  cube: '<path d="m21 7.5-9-5-9 5v9l9 5 9-5z"/><path d="m3.3 7.3 8.7 5 8.7-5M12 22V12.3"/>',
  maison: '<path d="m3.5 11 8.5-7 8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  nuage: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>',
  horsLigne: '<path d="M7 18a4.5 4.5 0 0 1-.6-9M10 6.3A6 6 0 0 1 17.8 10.5 3.8 3.8 0 0 1 19.6 17M3 3l18 18"/>',
  plume: '<path d="M20 4c-6 0-11 4-12.5 10L6 20l6-1.5C18 17 20 10 20 4z"/><path d="M6 20 14 12"/>',
  options: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  escalier: '<path d="M3 20h5v-4h4v-4h4V8h5"/>',
  fragile: '<path d="M8 3h8l-.6 6a3.4 3.4 0 0 1-6.8 0z"/><path d="M12 12.5V21M8.5 21h7"/>',
  outil: '<path d="M14.5 6.5a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3z"/><path d="m14.5 6.5 3-3 3 3-3 3"/>',
  // Synthèse de Dragan (18/11/2026) : dupliquer, répartir entre destinations.
  copier: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>',
  repartir: '<path d="M4 12h6l4-6h6M14 18h6M10 12l4 6"/><path d="m17 3 3 3-3 3M17 15l3 3-3 3"/>',
} as const;

export type NomPicto = keyof typeof P;

export function Picto({ nom, taille = 22, epaisseur = 2.1, className }: { nom: NomPicto; taille?: number; epaisseur?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: P[nom] }}
    />
  );
}
