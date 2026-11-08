import type { ReactNode, SVGProps } from "react";

/*
 * Les pictogrammes de l'espace RH : un trait fin, arrondi, sur une grille de
 * 24 — la même famille que ceux du questionnaire (app/demande/ui.tsx), avec
 * ceux qui manquaient ici (œil, cadenas, loupe, copie, QR, document…).
 */
const TRACES = {
  maison: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  personnes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6" />
    </>
  ),
  euro: <path d="M18 7.5A7 7 0 1 0 18 16.5M4 10.5h9M4 13.5h9" />,
  lien: <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>
  ),
  tel: <path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 5.2 5.2l1.4-2.1 4.2 1.6V17a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 5.5a2 2 0 0 1 2-2Z" />,
  cadenas: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  oeil: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  oeilBarre: <path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  fleche: <path d="M5 12h14M13 6l6 6-6 6" />,
  gauche: <path d="M19 12H5M11 18l-6-6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  croix: <path d="M18 6 6 18M6 6l12 12" />,
  alerte: <path d="M12 4 2.8 19.5h18.4zM12 10v4.2M12 17.2v.1" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  horloge: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  calendrier: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  camion: (
    <>
      <path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.5v3h-7z" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  recherche: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  telecharger: <path d="M12 3.5v11.5M7 10.5l5 5 5-5M4.5 20h15" />,
  copier: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </>
  ),
  document: (
    <>
      <path d="M6.5 2.5h7.5l4.5 4.5v14.5h-12z" />
      <path d="M13.5 2.5V7.5h5M9 12.5h6M9 16h6" />
    </>
  ),
  qr: <path d="M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM6.5 6.5h1v1h-1zM16.5 6.5h1v1h-1zM6.5 16.5h1v1h-1zM13.5 13.5h3v3h-3zM18.5 13.5h2M13.5 18.5h2.5v2M18.5 17.5v3" />,
  sortie: <path d="M14.5 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16.5 5.5 12 10 7.5M5.5 12H16" />,
  immeuble: <path d="M4 21V4.5A1.5 1.5 0 0 1 5.5 3h8A1.5 1.5 0 0 1 15 4.5V21M15 9h3.5a1.5 1.5 0 0 1 1.5 1.5V21M2.5 21h19M8 7.5h3M8 11h3M8 14.5h3" />,
  route: <path d="M6 20.5c0-4 3-4.5 6-6s6-2.5 6-6M6 20.5h.01M18 8.5V4M15.5 6.5 18 4l2.5 2.5M3.5 20.5h5" />,
  filtre: <path d="M3.5 5h17l-6.5 8v6l-4 2v-8z" />,
  etoile: <path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z" />,
  bulle: <path d="M4 5.5h16v10.5H9.5L5 20v-4H4z" />,
} satisfies Record<string, ReactNode>;

export type NomPicto = keyof typeof TRACES;

export function Picto({ nom, taille = 18, trait = 1.8, ...reste }: { nom: NomPicto; taille?: number; trait?: number } & Omit<SVGProps<SVGSVGElement>, "fill">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={taille}
      height={taille}
      fill="none"
      stroke="currentColor"
      strokeWidth={trait}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...reste}
    >
      {TRACES[nom]}
    </svg>
  );
}
