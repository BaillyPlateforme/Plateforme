"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { Apercu } from "./Apercu";
import { ApercuMessage } from "./ApercuMessage";
import { Cartons } from "./Cartons";
import { Destinations } from "./Destinations";
import { Fiche } from "./Fiche";
import { Journal } from "./Journal";
import { Nouveau } from "./Nouveau";
import { Reglages } from "./Reglages";
import { Sav } from "./Sav";
import { PorteProvider, usePorte, type Porte } from "./socle";

export type Vue = "dossiers" | "nouveau" | "dossier" | "cartons" | "sav" | "destinations" | "journal" | "reglages";

const ONGLETS: { vue: Vue; label: string; chemin: string }[] = [
  { vue: "dossiers", label: "Dossiers", chemin: "" },
  { vue: "nouveau", label: "Nouveau dossier", chemin: "/nouveau" },
  { vue: "cartons", label: "Cartons du samedi", chemin: "/cartons" },
  { vue: "sav", label: "SAV", chemin: "/sav" },
  { vue: "destinations", label: "Pièces par destination", chemin: "/destinations" },
  { vue: "journal", label: "Journal des messages", chemin: "/journal" },
  { vue: "reglages", label: "Réglages", chemin: "/reglages" },
];

function Onglets({ vue }: { vue: Vue }) {
  const { racine } = usePorte();
  const chemin = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Espace client">
      {ONGLETS.map((o) => {
        const actif = o.vue === vue || (vue === "dossier" && o.vue === "dossiers");
        return (
          <Link key={o.vue} href={`${racine}${o.chemin}`} aria-current={actif && chemin === `${racine}${o.chemin}` ? "page" : undefined} className={`relative shrink-0 px-4 py-2.5 text-sm transition ${actif ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}>
            {o.label}
            {actif && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Le back-office de l'espace client : en-tête, onglets, et l'écran demandé.
 * Rendu dans la coque de l'espace équipe (/dashboard/espace-client) ou dans
 * le cadre de démonstration (/espace-client/demo-equipe).
 */
export function BackOffice({ porte, vue, id }: { porte: Porte; vue: Vue; id?: string }) {
  const [apercu, setApercu] = useState<string | null>(null);
  return (
    <PorteProvider value={porte}>
      {/* Dans le CRM, l'en-tête et les onglets sont ceux de la section (EnTeteSection) ;
          la démo sans connexion garde les siens. */}
      <div className={porte.demo ? "px-5 py-5 md:px-7 md:py-6" : undefined}>
        {porte.demo && (
          <>
            <div className="mb-4">
              <p className="eyebrow text-ink-soft">Module 2</p>
              <h1 className="mt-1 text-[26px] font-bold tracking-tight">Espace client</h1>
              <p className="mt-1 text-[13.5px] text-ink-soft">Les espaces des clients : accès, documents, devis, cartons, SAV — et ce qu&apos;il reste à faire, dossier par dossier.</p>
            </div>
            <Onglets vue={vue} />
          </>
        )}
        <Suspense>
          {vue === "dossiers" && <Apercu />}
          {vue === "nouveau" && <Nouveau ouvrirApercu={setApercu} />}
          {vue === "dossier" && id && <Fiche id={id} ouvrirApercu={setApercu} />}
          {vue === "cartons" && <Cartons />}
          {vue === "sav" && <Sav />}
          {vue === "destinations" && <Destinations />}
          {vue === "journal" && <Journal ouvrirApercu={setApercu} />}
          {vue === "reglages" && <Reglages />}
        </Suspense>
      </div>
      {apercu && <ApercuMessage id={apercu} fermer={() => setApercu(null)} />}
    </PorteProvider>
  );
}
