"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { ongletActif, sectionDe, type Onglet } from "@/crm/sections";
import Bandeau from "@/ui/Bandeau";
import type { NomIcone } from "@/ui/icones";
import MenuVertical from "@/ui/MenuVertical";
import { metaDe } from "./nav-meta";

type Contenu = {
  surtitre?: string;
  titre?: string;
  texte?: React.ReactNode;
  action?: { label: string; href: string; icone?: NomIcone };
  etiquettes?: (string | false | null | undefined)[];
  /** Les boutons de la page (statut, envoi…), posés dans le bandeau. */
  children?: React.ReactNode;
  /** La rangée du bas du bandeau : les filtres et les vues de la page (jamais des sous-onglets). */
  bas?: React.ReactNode;
};

/*
 * L'en-tête des sections venues de l'espace équipe (questionnaires, espace
 * client, réglages) : TOUJOURS le bandeau du CRM, en haut et pleine largeur,
 * puis à gauche le menu vertical des sous-onglets de la section (demande de
 * David : plus de sous-onglets dans le bandeau).
 *
 * La mise en page pose le bandeau avec le nom de la section et le titre de la
 * page (nav-meta.ts). Une page qui a mieux à dire (la vue d'ensemble, la fiche
 * d'une demande, celle d'un dossier client) écrit `<EnTeteSection propre …>` :
 * elle ne dessine rien elle-même, elle confie son contenu au bandeau de la
 * mise en page. Il n'y a ainsi jamais deux en-têtes, et le menu reste dessous.
 */

type Perso = { chemin: string; contenu: Contenu } | null;
const Valeur = createContext<Perso>(null);
const Poser = createContext<((p: Perso) => void) | null>(null);

/** Le fournisseur, posé par la mise en page des sections autour de l'en-tête et des pages. */
export function FournisseurEnTete({ children }: { children: React.ReactNode }) {
  const [perso, setPerso] = useState<Perso>(null);
  return (
    <Poser.Provider value={setPerso}>
      <Valeur.Provider value={perso}>{children}</Valeur.Provider>
    </Poser.Provider>
  );
}

export default function EnTeteSection({ propre = false, ...contenu }: Contenu & { propre?: boolean }) {
  return propre ? <Confier contenu={contenu} /> : <Bande />;
}

/** Le bandeau de la section : le contenu confié par la page, sinon le nom de la section et le titre de la page. */
function Bande() {
  const chemin = usePathname();
  const perso = useContext(Valeur);
  const section = sectionDe(chemin);
  if (!section) return null;
  const meta = metaDe(chemin);
  const c = perso && perso.chemin === chemin ? perso.contenu : null;
  return (
    <Bandeau
      surtitre={c?.surtitre ?? section.nom}
      titre={c?.titre ?? meta.titre}
      texte={c ? c.texte : meta.sous}
      action={c?.action}
      etiquettes={c?.etiquettes}
      bas={c?.bas}
    >
      {c?.children}
    </Bandeau>
  );
}

/** Une page confie son contenu au bandeau ; hors d'une section (démonstration), elle le dessine elle-même. */
function Confier({ contenu }: { contenu: Contenu }) {
  const poser = useContext(Poser);
  const chemin = usePathname();
  useEffect(() => {
    poser?.({ chemin, contenu });
  });
  useEffect(() => () => poser?.(null), [poser]);
  if (poser) return null;
  return (
    <Bandeau surtitre={contenu.surtitre ?? ""} titre={contenu.titre ?? ""} texte={contenu.texte} action={contenu.action} etiquettes={contenu.etiquettes} bas={contenu.bas}>
      {contenu.children}
    </Bandeau>
  );
}

const ICONES: Record<string, NomIcone> = {
  "/dashboard/tableau-de-bord": "bord",
  "/dashboard/leads": "tendance",
  "/dashboard": "boite",
  "/dashboard/rappels": "horloge",
  "/dashboard/statistiques": "tendance",
  "/dashboard/espaces-pro": "equipe",
  "/dashboard/messagerie": "courrier",
  "/dashboard/devis": "devis",
  "/dashboard/clients": "clients",
  "/dashboard/agenda": "calendrier",
  "/dashboard/workflow": "grille",
  "/dashboard/simulateur": "euro",
  "/dashboard/campagne": "etoile",
  "/dashboard/playground": "copilote",
  "/dashboard/espace-client": "dossierClient",
  "/dashboard/espace-client/nouveau": "plus",
  "/dashboard/espace-client/cartons": "boite",
  "/dashboard/espace-client/sav": "cloche",
  "/dashboard/espace-client/destinations": "grille",
  "/dashboard/espace-client/journal": "courrier",
  "/dashboard/espace-client/reglages": "reglages",
  "/dashboard/parametres": "reglages",
  "/dashboard/configuration": "grille",
  "/dashboard/equipe": "equipe",
  "/dashboard/envois": "courrier",
};

/** Le menu vertical de la section courante : ses onglets, puis « Plus ». */
export function MenuDeSection() {
  const chemin = usePathname();
  const section = sectionDe(chemin);
  if (!section) return null;
  const item = (o: Onglet) => ({ href: o.href, label: o.label, icone: ICONES[o.href], actif: ongletActif(o, chemin) });
  return (
    <MenuVertical
      titre={section.nom}
      groupes={[{ items: section.onglets.map(item) }, ...(section.plus?.length ? [{ titre: "Plus", items: section.plus.map(item) }] : [])]}
    />
  );
}
