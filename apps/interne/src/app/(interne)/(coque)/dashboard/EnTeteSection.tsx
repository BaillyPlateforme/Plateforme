"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { ongletActifDe, sectionDe, type Onglet } from "@/crm/sections";
import MenuReglages from "@/crm/reglages/MenuReglages";
import { pageReglageDe } from "@/crm/reglages/pages";
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
  /** La rangée du bas du bandeau : les filtres de la page, et eux seuls (les vues vont dans le menu de gauche). */
  bas?: React.ReactNode;
  /** Les nombres du menu de gauche, par adresse d'onglet, quand la page les a déjà comptés. */
  nombres?: Record<string, number | undefined>;
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
  // Une page de Réglages : « Réglages · groupe », son titre et sa phrase, ceux du menu (crm/reglages/pages.ts).
  const reglage = section.cle === "reglages" ? pageReglageDe(chemin) : null;
  const c = perso && perso.chemin === chemin ? perso.contenu : null;
  return (
    <Bandeau
      surtitre={c?.surtitre ?? (reglage ? `${section.nom} · ${reglage.groupe.titre}` : section.nom)}
      titre={c?.titre ?? reglage?.page.titre ?? reglage?.page.label ?? meta.titre}
      texte={c ? c.texte : (reglage?.page.texte ?? meta.sous)}
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
  "/dashboard?vue=focus": "etoile",
  "/dashboard?vue=kanban": "kanban",
  "/dashboard?vue=rappels": "horloge",
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
  "/dashboard/espace-client/cartons": "caisse",
  "/dashboard/espace-client/sav": "cloche",
  "/dashboard/espace-client/destinations": "grille",
  "/dashboard/espace-client/journal": "courrier",
  "/dashboard/espace-client/reglages": "reglages",
  "/dashboard/parametres": "reglages",
  "/dashboard/configuration": "grille",
  "/dashboard/equipe": "equipe",
  "/dashboard/envois": "courrier",
};

/**
 * Le menu vertical de la section courante : ses onglets — les vues de ses
 * pages —, puis « Plus » ; pour Réglages, le menu unique de Réglages.
 * L'onglet actif suit l'adresse et la vue demandée (?vue=) ; les nombres
 * sont ceux que la page a confiés au bandeau.
 */
export function MenuDeSection() {
  const chemin = usePathname();
  const vue = useSearchParams().get("vue");
  const perso = useContext(Valeur);
  const section = sectionDe(chemin);
  if (!section) return null;
  if (section.cle === "reglages") return <MenuReglages />;
  // Une section sans onglets : pas de menu, la page prend toute la largeur.
  if (!section.onglets.length && !section.plus?.length) return null;
  const actif = ongletActifDe(section, chemin, vue);
  const nombres = perso && perso.chemin === chemin ? perso.contenu.nombres : undefined;
  const item = (o: Onglet) => ({ href: o.href, label: o.label, icone: ICONES[o.href], actif: o === actif, nombre: nombres?.[o.href] });
  return (
    <MenuVertical
      titre={section.nom}
      groupes={[{ items: section.onglets.map(item) }, ...(section.plus?.length ? [{ titre: "Plus", items: section.plus.map(item) }] : [])]}
    />
  );
}
