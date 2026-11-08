"use client";

import { useSearchParams } from "next/navigation";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { CarteRappel } from "@/lib/rappels";
import type { RequestRow, RequestStatus } from "@/lib/types";
import { Pilules } from "@/ui/Bandeau";
import EnTeteSection from "./EnTeteSection";
import RequestsTable, { type Origine } from "./RequestsTable";
import KanbanBoard from "./KanbanBoard";
import FocusVue, { SEUIL } from "./FocusVue";
import RappelsBoard from "./RappelsBoard";
import { META } from "./nav-meta";

/*
 * Les demandes du site : une seule boîte (simplification du 08/11/2026).
 * Ses façons de regarder les demandes sont des pilules dans la rangée du bas
 * du bandeau : la liste (filtrable par statut et par origine, formulaire ou
 * mail), le focus, le kanban, et les rappels — les clients qui ont demandé à
 * être rappelés, qui avaient leur page (/dashboard/rappels).
 */
type Vue = "liste" | "focus" | "kanban" | "rappels";
const VUES: { cle: Vue; label: string }[] = [
  { cle: "liste", label: "Liste" },
  { cle: "focus", label: "Focus" },
  { cle: "kanban", label: "Kanban" },
  { cle: "rappels", label: "Rappels" },
];
const OUVERTS = ["a_rappeler", "en_cours"];

export default function DemandesPage() {
  const params = useSearchParams();
  const demande = params.get("vue");
  const vue: Vue = VUES.some((v) => v.cle === demande) ? (demande as Vue) : "liste";

  const { donnees, erreur, recharger } = useRessource<{ requests: RequestRow[] }>("/api/data/demandes");
  const rappels = useRessource<{ rappels: CarteRappel[] }>("/api/data/rappels");
  const requests = donnees?.requests ?? [];

  const compteur: Record<Vue, number | undefined> = {
    liste: donnees ? requests.length : undefined,
    focus: donnees ? requests.filter((r) => (r.score_potentiel ?? 0) >= SEUIL && !["lost", "archived"].includes(r.status)).length : undefined,
    kanban: donnees ? requests.filter((r) => r.status !== "archived").length : undefined,
    rappels: rappels.donnees ? rappels.donnees.rappels.filter((r) => OUVERTS.includes(r.statut)).length : undefined,
  };

  const origine = params.get("source");
  return (
    <div>
      <EnTeteSection
        propre
        surtitre="Dossiers · Demandes du site"
        titre="Demandes"
        texte={vue === "rappels" ? META["/dashboard/rappels"].sous : META["/dashboard"].sous}
        bas={
          <Pilules
            label="Vues des demandes"
            items={VUES.map((v) => ({
              href: v.cle === "liste" ? "/dashboard" : `/dashboard?vue=${v.cle}`,
              label: v.label,
              actif: v.cle === vue,
              nombre: compteur[v.cle],
            }))}
          />
        }
      />

      {vue === "rappels" ? (
        rappels.erreur ? (
          <Echec message={rappels.erreur} onRetry={rappels.recharger} />
        ) : !rappels.donnees ? (
          <Squelette titre={false} lignes={6} />
        ) : (
          <RappelsBoard rappels={rappels.donnees.rappels} />
        )
      ) : erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette lignes={8} />
      ) : vue === "liste" ? (
        <RequestsTable
          // Une nouvelle adresse (?statut=, ?source=, ?q=) repart de ses filtres.
          key={params.toString()}
          requests={requests}
          initialQ={params.get("q") ?? ""}
          initialStatut={(params.get("statut") as RequestStatus) ?? "all"}
          initialOrigine={origine === "email" || origine === "form" ? (origine as Origine) : "all"}
        />
      ) : vue === "focus" ? (
        <FocusVue requests={requests} />
      ) : (
        <KanbanBoard requests={requests} />
      )}
    </div>
  );
}
