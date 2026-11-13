import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Canal, ModeEnvoi } from "./garde-fous";

/*
 * Le journal des envois : la table public.envois (migration 0013). Une ligne
 * par message, envoyé ou non, avec son statut, l'identifiant de Brevo et sa
 * clé d'idempotence, unique.
 *
 * La clé est réservée AVANT tout appel à Brevo, en une seule requête (« on
 * conflict do nothing ») : deux appels simultanés avec la même clé — un
 * double clic, une tâche relancée — n'en font partir qu'un. Une clé déjà
 * prise ne repart pas, sauf si son message a été refusé par Brevo (4xx :
 * rien n'est parti) : celui-là peut être retenté sous la même clé.
 *
 * Le journal ne garde pas le corps des e-mails : un lien d'accès à l'espace
 * client, par exemple, ouvre l'espace d'un vrai client. Il garde l'objet, et
 * pour un SMS son texte.
 */

export type StatutEnvoi = "en_cours" | "journalise" | "bloque" | "fictif" | "bac_a_sable" | "envoye" | "echec" | "incertain";
export type OrigineEnvoi = "espace_client" | "questionnaires" | "crm" | "veille" | "test";

export interface LigneEnvoi {
  id: string;
  cle: string;
  canal: Canal;
  origine: OrigineEnvoi;
  modele: string | null;
  destinataire: string;
  sujet: string | null;
  apercu: string | null;
  reference: string | null;
  notification_id: string | null;
  statut: StatutEnvoi;
  motif: string | null;
  mode: ModeEnvoi;
  bac_a_sable: boolean;
  brevo_id: string | null;
  tentatives: number;
  cree_le: string;
  traite_le: string | null;
}

export type NouvelEnvoi = Pick<
  LigneEnvoi,
  "cle" | "canal" | "origine" | "modele" | "destinataire" | "sujet" | "apercu" | "reference" | "notification_id" | "mode" | "bac_a_sable"
>;

const TABLE = "envois";
const DELAI = 8_000;

function avecDelai<T>(p: PromiseLike<T>): Promise<T> {
  return new Promise<T>((ok, ko) => {
    const t = setTimeout(() => ko(new Error("la base ne répond pas")), DELAI);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        ok(v);
      },
      (e) => {
        clearTimeout(t);
        ko(e);
      },
    );
  });
}

/**
 * Réserve la clé. `reservee` : à l'appelant d'envoyer, puis de conclure.
 * Sinon, la ligne déjà là dit ce qu'il est advenu du message.
 */
export async function reserver(l: NouvelEnvoi): Promise<{ reservee: boolean; ligne: LigneEnvoi }> {
  const db = createServiceClient();
  const insere = await avecDelai(
    db.from(TABLE).upsert({ ...l, statut: "en_cours" }, { onConflict: "cle", ignoreDuplicates: true }).select("*"),
  );
  if (insere.error) throw new Error(insere.error.message);
  if (insere.data?.length) return { reservee: true, ligne: insere.data[0] as LigneEnvoi };

  const lu = await avecDelai(db.from(TABLE).select("*").eq("cle", l.cle).maybeSingle());
  if (lu.error || !lu.data) throw new Error(lu.error?.message ?? "clé introuvable après conflit");
  const existante = lu.data as LigneEnvoi;
  // Refusé par Brevo : rien n'est parti, on peut retenter — une seule reprise à la fois.
  if (existante.statut === "echec") {
    const repris = await avecDelai(
      db
        .from(TABLE)
        .update({ statut: "en_cours", motif: null, mode: l.mode, bac_a_sable: l.bac_a_sable, tentatives: existante.tentatives + 1, traite_le: null })
        .eq("id", existante.id)
        .eq("statut", "echec")
        .eq("tentatives", existante.tentatives)
        .select("*"),
    );
    if (repris.error) throw new Error(repris.error.message);
    if (repris.data?.length) return { reservee: true, ligne: repris.data[0] as LigneEnvoi };
  }
  return { reservee: false, ligne: existante };
}

export async function conclure(id: string, champs: { statut: Exclude<StatutEnvoi, "en_cours">; motif: string | null; brevo_id?: string | null }) {
  const { error } = await avecDelai(
    createServiceClient()
      .from(TABLE)
      .update({ ...champs, traite_le: new Date().toISOString() })
      .eq("id", id),
  );
  if (error) throw new Error(error.message);
}

/** Les derniers envois, pour le back-office. */
export async function lireEnvois(options: { limite?: number; origine?: OrigineEnvoi } = {}): Promise<LigneEnvoi[]> {
  let q = createServiceClient().from(TABLE).select("*").order("cree_le", { ascending: false }).limit(Math.min(options.limite ?? 200, 1000));
  if (options.origine) q = q.eq("origine", options.origine);
  const { data, error } = await avecDelai(q);
  if (error) throw new Error(`Lecture du journal des envois impossible : ${error.message}`);
  return (data ?? []) as LigneEnvoi[];
}

/** Les envois rattachés à des lignes du journal de l'espace client (ec_notifications). */
export async function envoisDesNotifications(): Promise<Map<string, Pick<LigneEnvoi, "statut" | "motif" | "brevo_id" | "bac_a_sable">>> {
  const { data, error } = await avecDelai(
    createServiceClient()
      .from(TABLE)
      .select("notification_id, statut, motif, brevo_id, bac_a_sable")
      .not("notification_id", "is", null)
      .order("cree_le", { ascending: false })
      .limit(1000),
  );
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((l) => [l.notification_id as string, l as Pick<LigneEnvoi, "statut" | "motif" | "brevo_id" | "bac_a_sable">]));
}

/**
 * Combien de messages sont réellement partis sur les dernières 24 heures,
 * pour une origine et un canal (et, au besoin, un destinataire) : la base des
 * plafonds des envois déclenchés par le public (index.ts). Illisible : 0, pour
 * ne pas bloquer un vrai message sur une panne du journal.
 */
export async function partisSur24h(f: { origine: OrigineEnvoi; canal: string; destinataire?: string }): Promise<number> {
  let q = createServiceClient()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("origine", f.origine)
    .eq("canal", f.canal)
    .eq("statut", "envoye")
    .gte("cree_le", new Date(Date.now() - 24 * 3600_000).toISOString());
  if (f.destinataire) q = q.ilike("destinataire", f.destinataire.replace(/[\\%_]/g, (c) => `\\${c}`));
  const { count, error } = await q;
  return error ? 0 : (count ?? 0);
}
