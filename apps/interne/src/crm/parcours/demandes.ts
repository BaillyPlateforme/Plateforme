import "server-only";
import { q } from "@/crm/lib/db";
import { lireDemandes } from "@/crm/demandes/donnees";
import type { DemandeVue } from "@/crm/demandes/etapes";
import { aDecider } from "@/crm/kanban/etapes";
import type { DossierDeDemande } from "./demandes-commun";

/*
 * Les demandes du site qui attendent qu'on les décide : la première colonne
 * du Parcours, « Demandes ». Une demande en sort quand on l'accepte
 * (« Accepter », sur sa carte ou sa page : DecisionDemande), ce qui crée son
 * dossier et pose `dossiers.request_id`, ou quand on la refuse (« Perdue »).
 *
 * La même lecture que le Kanban de Demandes (lireDemandes) et la même règle
 * (aDecider, src/crm/kanban/etapes.ts) : les deux tableaux comptent les
 * mêmes demandes, et chacune y porte la même étape détaillée (Incomplète,
 * Rappel demandé…). Les demandes perdues ou archivées n'y sont pas :
 * Demandes les garde.
 */
export async function demandesADecider(): Promise<DemandeVue[]> {
  return (await lireDemandes()).filter(aDecider);
}

/**
 * Les demandes devenues dossiers : pour chacune, le dossier et son étape. La
 * liste de l'analyse des demandes montre alors l'étape du dossier, pas le
 * statut de la demande (un seul statut, celui du parcours).
 */
export async function dossiersDesDemandes(): Promise<Record<string, DossierDeDemande>> {
  const rows = await q<{ request_id: string; id: number; ref: string; statut: string }>(
    "select request_id::text as request_id, id, ref, statut from dossiers where request_id is not null",
  );
  return Object.fromEntries(rows.map((r) => [r.request_id, { id: r.id, ref: r.ref, statut: r.statut }]));
}

/** Combien de dossiers archivés répondent à une recherche : le Parcours les écarte, l'archivage les montre. */
export async function archivesTrouves(texte: string): Promise<number> {
  const t = texte.trim();
  if (!t) return 0;
  const p: unknown[] = [`%${t}%`];
  const cond = ["c.nom ilike $1", "c.prenom ilike $1", "c.societe ilike $1", "d.ref ilike $1", "c.email ilike $1", "c.matricule ilike $1"];
  const chiffres = t.replace(/[^0-9]/g, "");
  if (chiffres.length >= 4) {
    p.push(`%${chiffres}%`);
    cond.push("regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g') like $2");
  }
  const r = await q<{ n: number }>(
    `select count(*)::int as n from dossiers d join clients c on c.id = d.client_id where d.archive_le is not null and (${cond.join(" or ")})`,
    p,
  );
  return r[0]?.n ?? 0;
}
