/*
 * Les icônes de la coque, au trait, sur la grille de 24 : celles du CRM et
 * celles des sections venues de l'espace équipe, au même dessin.
 */
const P: Record<string, string> = {
  accueil: '<path d="m3.5 11 8.5-7 8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  bord: '<rect x="3" y="3" width="7.5" height="9" rx="2"/><rect x="13.5" y="3" width="7.5" height="5" rx="2"/><rect x="13.5" y="11" width="7.5" height="10" rx="2"/><rect x="3" y="15" width="7.5" height="6" rx="2"/>',
  questionnaires: '<path d="M9 4h6v3H9z"/><path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15"/><path d="m9 13 2 2 4-4"/>',
  boite: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  dossierClient: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="13" r="2"/><path d="M8.5 18a3.5 3.5 0 0 1 7 0"/>',
  calendrier: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  oeil: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  clients: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  devis: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h4.5"/>',
  commande: '<rect x="3" y="3" width="18" height="18" rx="3.5"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  grille: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>',
  camion: '<path d="M2 5.5h12.5v10H2zM14.5 9h4l3 3v3.5h-7"/><circle cx="6" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  entrepot: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8M7 17h10"/>',
  bateau: '<path d="M3 17.5c1.5 1.5 3 2 4.5 2s3-.5 4.5-2c1.5 1.5 3 2 4.5 2s3-.5 4.5-2"/><path d="M5 15 4 10h16l-1 5"/><path d="M8 10V6h8v4M12 3v3"/>',
  dispatch: '<rect x="3" y="3.5" width="5" height="17" rx="1.6"/><rect x="9.5" y="3.5" width="5" height="11" rx="1.6"/><rect x="16" y="3.5" width="5" height="14" rx="1.6"/>',
  facture: '<path d="M5 2.5v19l2.5-1.5 2.5 1.5 2-1.5 2 1.5 2.5-1.5 2.5 1.5v-19z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  courrier: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m21 7-9 5.5L3 7"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  sortie: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  recherche: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  cloche: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  equipe: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  euro: '<path d="M18 7.5A7 7 0 1 0 18 16.5"/><path d="M4 10.5h9M4 13.5h9"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tendance: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copilote: '<path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/><path d="M5.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
  etoile: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
  badge: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h3"/>',
  // Le Kanban des dossiers et le parcours d'un dossier (07/11/2026).
  kanban: '<rect x="3" y="3.5" width="18" height="17" rx="3"/><path d="M9 3.5v17M15 3.5v17M5.3 7.5h1.4M5.3 10.5h1.4M11.3 7.5h1.4M17.3 7.5h1.4M17.3 10.5h1.4M17.3 13.5h1.4"/>',
  parcours: '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><path d="M8 18.5h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  // Exploitation et gestion (08/11/2026) : annuaire, litiges, statistiques, archivage, caisses.
  partenaires: '<path d="M3 21V7.5L9 4v17M9 9h12v12H3"/><path d="M12.5 12.5h2M17 12.5h1.5M12.5 16h2M17 16h1.5M5.5 9.5h1M5.5 13h1"/>',
  litige: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="M12 8v4.5M12 16h.01"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>',
  caisse: '<path d="m21 8-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7.5 12 12l8.7-4.5M12 22V12"/>',
  imprimer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  restaurer: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  // Le Feed (08/11/2026) : le fil, et ce qu'il raconte.
  fil: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  corbeille: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  sms: '<path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8 9.5h8M8 13h5"/>',
  connexion: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
  trombone: '<path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>',
  signature: '<path d="M3 21h8"/><path d="M15.5 3.5a2.1 2.1 0 0 1 3 3L8 17l-4 1 1-4z"/><path d="M14 5l3 3"/>',
  carte: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  // Les appels à passer (bouton de la barre du haut, page /appels).
  telephone: '<path d="M21 16.4v2.9a1.9 1.9 0 0 1-2.1 1.9 18.8 18.8 0 0 1-8.2-2.9 18.5 18.5 0 0 1-5.7-5.7A18.8 18.8 0 0 1 2.1 4.4 1.9 1.9 0 0 1 4 2.3h2.9a1.9 1.9 0 0 1 1.9 1.6c.1.9.4 1.8.7 2.7a1.9 1.9 0 0 1-.4 2L7.9 9.8a15.2 15.2 0 0 0 5.7 5.7l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.3 1.8.6 2.7.7a1.9 1.9 0 0 1 1.6 1.9z"/>',
  sablier: '<path d="M6 2.5h12M6 21.5h12"/><path d="M7.5 2.5v3.2a4.5 4.5 0 0 0 1.8 3.6L12 12l2.7-2.7a4.5 4.5 0 0 0 1.8-3.6V2.5M7.5 21.5v-3.2a4.5 4.5 0 0 1 1.8-3.6L12 12l2.7 2.7a4.5 4.5 0 0 1 1.8 3.6v3.2"/>',
  // La fiche d'un espace client vue de l'équipe (08/11/2026) : pièces jointes, aperçu, envois.
  telecharger: '<path d="M12 3.5v12"/><path d="m7 11 5 5 5-5"/><path d="M4.5 20.5h15"/>',
  envoyer: '<path d="M21.5 2.5 10.5 13.5"/><path d="m21.5 2.5-7 19-4-8-8-4z"/>',
  externe: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18.5 14v4.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5H10"/>',
  image: '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><circle cx="8.5" cy="9" r="1.8"/><path d="m21 16-5-5-9.5 9.5"/>',
  alerte: '<path d="M10.3 3.9 2.4 17.6a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  fichier: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5"/>',
  fermer: '<path d="M18 6 6 18M6 6l12 12"/>',
  gauche: '<path d="m15 18-6-6 6-6"/>',
  droite: '<path d="m9 18 6-6-6-6"/>',
  crayon: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z"/><path d="M14.5 5.5l3 3"/>',
  appareil: '<rect x="5.5" y="2.5" width="13" height="19" rx="2.5"/><path d="M11 18h2"/>',
  points: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  epingle: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
};

export type NomIcone = keyof typeof P;

export function Icone({ nom, taille = 18, className = "" }: { nom: NomIcone; taille?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: P[nom] }}
    />
  );
}
