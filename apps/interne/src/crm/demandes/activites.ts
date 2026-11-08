import "server-only";
import { q } from "@/crm/lib/db";
import { ilYa } from "@/crm/lib/format";
import { filtresDe, lireFeed, paramsDe } from "@/crm/feed/donnees";
import { phraseDe } from "@/crm/feed/phrases";
import type { DemandeVue } from "./etapes";
import type { Activite, Derniere } from "./liste-commun";

/*
 * Ce qui arrive à une demande, pour la liste et le panneau de Demandes (Top
 * demandes, Feed) :
 *
 *  - activitesDe : ses derniers événements, lus par le Feed (src/crm/feed),
 *    réduit aux demandes (« Dernières activités » du panneau) ;
 *  - dernieresActivites : la dernière chose arrivée à chaque demande, en une
 *    requête (la ligne d'activité de chaque demande du Feed) — son
 *    historique (hors messages automatiques), sa naissance en dossier, ou à
 *    défaut sa réception. Les mots sont ceux du Feed (phrases.ts).
 */

export async function activitesDe(id: string, n = 5): Promise<Activite[]> {
  const { filtres } = await filtresDe(paramsDe({ portee: "demandes", objet: `r${id}` }));
  const { evenements } = await lireFeed(filtres, null, n);
  return evenements.map((e) => ({ cle: e.cle, texte: e.texte, jour: e.jourLibelle, heure: e.heure, acteur: e.acteur.nom, icone: e.icone, ton: e.ton }));
}

const enMinuscule = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export async function dernieresActivites(demandes: DemandeVue[]): Promise<Record<string, Derniere>> {
  const ids = demandes.map((d) => d.id);
  if (!ids.length) return {};
  const [evts, dossiers] = await Promise.all([
    q<{ id: string; type: string; p: Record<string, unknown>; note: boolean; created_at: Date }>(
      `select distinct on (e.request_id) e.request_id::text as id, e.type, e.payload - 'lines' - 'note' as p,
              (e.payload ? 'note' and coalesce(e.payload->>'note', '') <> '') as note, e.created_at
         from public.request_events e
        where e.request_id = any($1::uuid[]) and e.type not in ('created', 'message')
        order by e.request_id, e.created_at desc`,
      [ids],
    ),
    q<{ id: string; ref: string; cree_le: Date }>("select request_id::text as id, ref, cree_le from dossiers where request_id = any($1::uuid[])", [ids]),
  ]);
  const parEvt = new Map(evts.map((e) => [e.id, e]));
  const parDossier = new Map(dossiers.map((d) => [d.id, d]));
  const out: Record<string, Derniere> = {};
  for (const d of demandes) {
    const choix: { texte: string; quand: string }[] = [{ texte: d.source === "email" ? "Demande reçue par e-mail" : "Demande reçue du site", quand: d.recueLe }];
    const e = parEvt.get(d.id);
    if (e) choix.push({ texte: phraseDe("evt", { type: e.type, p: e.p, note: e.note }, { id: "", dossierId: null, requestId: d.id, acteurType: "" }).texte, quand: e.created_at.toISOString() });
    const x = parDossier.get(d.id);
    if (x) choix.push({ texte: `Dossier ${x.ref} créé`, quand: x.cree_le.toISOString() });
    const dernier = choix.sort((a, b) => b.quand.localeCompare(a.quand))[0];
    out[d.id] = { texte: dernier.texte, ilYa: enMinuscule(ilYa(dernier.quand)) };
  }
  return out;
}
