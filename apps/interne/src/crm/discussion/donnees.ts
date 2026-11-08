import "server-only";
import { q, q1 } from "@/crm/lib/db";

/*
 * La discussion des clients, vue de l'équipe : la boîte de réception (une
 * ligne par dossier qui a au moins un message) et ce qui attend une réponse
 * (la cloche). Lu par le pool du CRM, qui voit public.ec_messages comme les
 * autres tables de l'espace client. La table absente (base neuve), rien.
 *
 * « Sans réponse » : le dernier message du fil est celui du client.
 * « Non lus » : les messages du client que personne de l'équipe n'a encore vus.
 */

/** La porte des fichiers de l'équipe (app interne), pour les liens des pièces jointes. */
export const PORTE_EQUIPE_FICHIERS = "/api/data/espace-client/fichier";

export interface Conversation {
  dossierId: string;
  reference: string;
  crmDossierId: number | null;
  client: string;
  email: string;
  conseiller: string | null;
  conseillerId: string | null;
  total: number;
  nonLus: number;
  sansReponse: boolean;
  /** ISO. */
  dernierLe: string | null;
  dernierAuteur: "client" | "equipe" | null;
  dernierNom: string | null;
  extrait: string;
  /** Un client fictif (jeu de démonstration, @example.com). */
  demo: boolean;
}

type Ligne = {
  dossier_id: string;
  reference: string;
  crm_dossier_id: number | null;
  societe: string | null;
  prenom: string | null;
  nom: string | null;
  email: string;
  demo: boolean;
  conseiller: string | null;
  conseiller_id: string | null;
  total: number | null;
  non_lus: number | null;
  dernier_le: Date | null;
  dernier_auteur: "client" | "equipe" | null;
  dernier_nom: string | null;
  dernier_corps: string | null;
  dernier_piece: string | null;
};

const COLONNES = `d.id::text as dossier_id, d.reference, d.crm_dossier_id, c.societe, c.prenom, c.nom, c.email, c.demo,
  nullif(btrim(concat_ws(' ', co.prenom, co.nom)), '') as conseiller, co.id::text as conseiller_id`;

function versConversation(l: Ligne): Conversation {
  const corps = (l.dernier_corps ?? "").replace(/\s+/g, " ").trim();
  return {
    dossierId: l.dossier_id,
    reference: l.reference,
    crmDossierId: l.crm_dossier_id,
    client: l.societe?.trim() || [l.prenom, l.nom].filter(Boolean).join(" ").trim() || l.email,
    email: l.email,
    conseiller: l.conseiller,
    conseillerId: l.conseiller_id,
    total: l.total ?? 0,
    nonLus: l.non_lus ?? 0,
    sansReponse: l.dernier_auteur === "client",
    dernierLe: l.dernier_le ? new Date(l.dernier_le).toISOString() : null,
    dernierAuteur: l.dernier_auteur,
    dernierNom: l.dernier_nom,
    extrait: corps ? corps.slice(0, 160) : l.dernier_piece ? `Pièce jointe : ${l.dernier_piece}` : "",
    demo: !!l.demo,
  };
}

/**
 * Toutes les conversations : celles qui attendent une réponse d'abord, puis
 * les autres, les plus récentes en tête dans chaque groupe.
 */
export async function conversations(): Promise<Conversation[]> {
  const lignes = await q<Ligne>(
    `with fils as (
       select m.dossier_id, count(*)::int as total, max(m.created_at) as dernier_le,
              count(*) filter (where m.auteur = 'client' and m.lu_par_equipe_le is null)::int as non_lus
         from public.ec_messages m group by m.dossier_id
     )
     select ${COLONNES}, f.total, f.non_lus, f.dernier_le,
            der.auteur as dernier_auteur, der.auteur_nom as dernier_nom, der.corps as dernier_corps, der.piece_nom as dernier_piece
       from fils f
       join public.ec_dossiers d on d.id = f.dossier_id
       join public.ec_clients c on c.id = d.client_id
       left join public.ec_conseillers co on co.id = c.conseiller_id
       cross join lateral (select m.auteur, m.auteur_nom, m.corps, m.piece_nom from public.ec_messages m
                            where m.dossier_id = f.dossier_id order by m.created_at desc, m.id desc limit 1) der
      order by (der.auteur = 'client') desc, f.dernier_le desc
      limit 300`,
  ).catch((e) => {
    console.error("Discussion : boîte de réception illisible", e instanceof Error ? e.message : e);
    return [] as Ligne[];
  });
  return lignes.map(versConversation);
}

/** Un dossier de l'espace client sans message encore : pour ouvrir la discussion depuis la boîte (?dossier=). */
export async function conversationVide(dossierId: string): Promise<Conversation | null> {
  if (!/^[0-9a-f-]{36}$/i.test(dossierId)) return null;
  const l = await q1<Ligne>(
    `select ${COLONNES}, 0 as total, 0 as non_lus, null::timestamptz as dernier_le, null as dernier_auteur, null as dernier_nom, null as dernier_corps, null as dernier_piece
       from public.ec_dossiers d join public.ec_clients c on c.id = d.client_id left join public.ec_conseillers co on co.id = c.conseiller_id
      where d.id = $1`,
    [dossierId],
  ).catch(() => undefined);
  return l ? versConversation(l) : null;
}

/**
 * Ce qui attend une réponse, pour la cloche (à chaque page) : les fils dont
 * le dernier message est un message du client pas encore lu. Une requête
 * courte, par l'index des messages non lus.
 */
export async function enAttenteDeReponse(max = 6): Promise<Conversation[]> {
  const lignes = await q<Ligne>(
    `with nl as (
       select m.dossier_id, count(*)::int as non_lus, max(m.created_at) as dernier_le
         from public.ec_messages m where m.auteur = 'client' and m.lu_par_equipe_le is null group by m.dossier_id
     )
     select ${COLONNES}, null::int as total, nl.non_lus, nl.dernier_le,
            der.auteur as dernier_auteur, der.auteur_nom as dernier_nom, der.corps as dernier_corps, der.piece_nom as dernier_piece
       from nl
       join public.ec_dossiers d on d.id = nl.dossier_id
       join public.ec_clients c on c.id = d.client_id
       left join public.ec_conseillers co on co.id = c.conseiller_id
       cross join lateral (select m.auteur, m.auteur_nom, m.corps, m.piece_nom from public.ec_messages m
                            where m.dossier_id = nl.dossier_id order by m.created_at desc, m.id desc limit 1) der
      where der.auteur = 'client'
      order by nl.dernier_le desc
      limit $1`,
    [max],
  ).catch(() => [] as Ligne[]);
  return lignes.map(versConversation);
}
