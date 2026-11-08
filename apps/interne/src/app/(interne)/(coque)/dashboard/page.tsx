"use client";

import { useSearchParams } from "next/navigation";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { CarteRappel } from "@/lib/rappels";
import type { RequestRow } from "@/lib/types";
import EnTeteSection from "./EnTeteSection";
import FiltresDemandes, { lireFiltres } from "./FiltresDemandes";
import RequestsTable from "./RequestsTable";
import KanbanBoard from "./KanbanBoard";
import FocusVue, { SEUIL } from "./FocusVue";
import RappelsBoard from "./RappelsBoard";
import { META } from "./nav-meta";

/*
 * Les demandes du site : une seule boîte (simplification du 08/11/2026).
 * Ses façons de regarder les demandes sont ses vues, dans le menu de gauche
 * de la section (crm/sections.ts, ?vue=) : la liste, le focus, le kanban, et
 * les rappels — les clients qui ont demandé à être rappelés, qui avaient
 * leur page (/dashboard/rappels). La page leur confie leurs nombres. Les
 * filtres de la liste (recherche, statut, origine — formulaire ou mail —,
 * tri) restent dans la rangée basse du bandeau.
 */
type Vue = "liste" | "focus" | "kanban" | "rappels";
const VUES: Vue[] = ["liste", "focus", "kanban", "rappels"];
const OUVERTS = ["a_rappeler", "en_cours"];

export default function DemandesPage() {
  const params = useSearchParams();
  const demande = params.get("vue");
  const vue: Vue = VUES.includes(demande as Vue) ? (demande as Vue) : "liste";

  const { donnees, erreur, recharger } = useRessource<{ requests: RequestRow[] }>("/api/data/demandes");
  const rappels = useRessource<{ rappels: CarteRappel[] }>("/api/data/rappels");
  const requests = donnees?.requests ?? [];

  // Les nombres du menu, par adresse d'onglet (les onglets de la section Demandes).
  const nombres: Record<string, number | undefined> = {
    "/dashboard": donnees ? requests.length : undefined,
    "/dashboard?vue=focus": donnees ? requests.filter((r) => (r.score_potentiel ?? 0) >= SEUIL && !["lost", "archived"].includes(r.status)).length : undefined,
    "/dashboard?vue=kanban": donnees ? requests.filter((r) => r.status !== "archived").length : undefined,
    "/dashboard?vue=rappels": rappels.donnees ? rappels.donnees.rappels.filter((r) => OUVERTS.includes(r.statut)).length : undefined,
  };

  return (
    <div>
      <EnTeteSection
        propre
        surtitre="Dossiers · Demandes du site"
        titre="Demandes"
        texte={vue === "rappels" ? META["/dashboard/rappels"].sous : META["/dashboard"].sous}
        nombres={nombres}
        bas={vue === "liste" ? <FiltresDemandes /> : undefined}
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
        <RequestsTable requests={requests} filtres={lireFiltres(params)} />
      ) : vue === "focus" ? (
        <FocusVue requests={requests} />
      ) : (
        <KanbanBoard requests={requests} />
      )}
    </div>
  );
}
