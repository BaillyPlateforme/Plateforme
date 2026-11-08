import type { ReactNode } from "react";
import type { NomPicto } from "./Picto";

/*
 * La forme de la fiche du dossier, telle que la page (serveur) la décrit et
 * que Fiche.tsx (client) l'affiche : des sections repliables, chacune avec sa
 * barre d'outils constante, ses onglets à compteur et leurs tableaux. Un clic
 * sur une ligne la sélectionne ; la barre agit sur la ligne sélectionnée.
 *
 * Les gestes sont des données : un lien, une action serveur liée (bind), une
 * fenêtre à ouvrir, un autre onglet, un choix entre plusieurs actions, ou un
 * bouton grisé avec sa raison. Les cellules, les détails et les fenêtres sont
 * rendus par le serveur (formulaires branchés sur les actions du CRM).
 */

export type Action = () => Promise<void>;

export type Geste =
  | { lien: string; nouvelOnglet?: boolean }
  | { action: Action; confirmer?: string }
  | { fenetre: string }
  | { aller: { section: string; onglet: string; fenetre?: string } }
  | { choix: { libelle: string; action: Action; danger?: boolean; confirmer?: string }[] }
  | { off: string };

/** Un bouton de barre d'outils : sa place est fixe dans la section. */
export type Outil = { cle: string; libelle: string; picto: NomPicto; danger?: boolean };

export type Colonne = { libelle: string; num?: boolean };

export type Ligne = {
  id: string;
  /** La date de la ligne (ms) : l'ordre Chrono / Anti des listes. */
  tri: number;
  cellules: ReactNode[];
  /** Ce que fait chaque outil de la barre sur cette ligne (sinon, le geste de l'onglet). */
  gestes?: Record<string, Geste>;
  /** Un libellé propre à la ligne pour un outil (« Clore » plutôt que « Prendre en charge »). */
  libelles?: Record<string, string>;
  /** Sous le tableau, quand la ligne est sélectionnée. */
  detail?: ReactNode;
  ton?: "attenue" | "alerte" | "ok";
};

export type Onglet = {
  cle: string;
  libelle: string;
  compte: number;
  colonnes: Colonne[];
  lignes: Ligne[];
  /** Le texte d'un onglet sans ligne ; null : rien (l'onglet n'a pas de tableau, son contenu est dans `avant`). */
  vide: ReactNode;
  /** Les gestes sans ligne sélectionnée (« Nouveau »…), et ceux qui valent pour tout l'onglet. */
  gestes?: Record<string, Geste>;
  /** Un libellé propre à l'onglet pour un outil de la section (« Envoyer » à la place de « Confirmer »). */
  libelles?: Record<string, string>;
  /** Des outils de plus, après les outils de la section (Fiche de visite, Inventaire…). */
  extras?: Outil[];
  /** Au-dessus et au-dessous du tableau. */
  avant?: ReactNode;
  apres?: ReactNode;
};

export type SectionFiche = {
  cle: string;
  titre: string;
  picto: NomPicto;
  resume: string;
  outils: Outil[];
  onglets: Onglet[];
  ongletParDefaut: string;
  ouverteParDefaut: boolean;
};

export type FenetreFiche = { titre: string; surtitre?: string; contenu: ReactNode; large?: boolean };

/** Un bouton de la barre de la fiche (sous le bandeau). */
export type BoutonBarre = { cle: string; libelle: string; picto: NomPicto; geste: Geste; titre?: string; accent?: "ok" | "attente" };

/** Les observations du dossier, sous la barre : un clic ouvre la fenêtre de suivi. */
export type Memo = { texte: string | null; drapeaux: string[]; fenetre: string };
