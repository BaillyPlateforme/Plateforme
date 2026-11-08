import "server-only";
import { baseCrm } from "@/lib/base-crm";
import { createAuthClient } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { baseConfiguree, estDemo } from "./config";
import { avecDelai, depot, maintenant, nouvelId } from "./depot";
import { lienFichier, lienValide, PORTE_FICHIERS_CLIENT, reponseDuSeau } from "./fichiers";
import { SCHEMA_DISCUSSION } from "./discussion-schema";
import { IMAGES_AFFICHABLES, type Auteur, type MessageVue } from "./discussion-vue";

/*
 * La discussion entre le client et l'équipe : une table, public.ec_messages
 * (discussion-schema.ts), un fil par dossier de l'espace client.
 *
 * Les lectures suivent la règle de l'espace (depot.ts) :
 *   - le client lit son fil avec SA session et la clé publique : c'est la RLS
 *     qui ne rend que les messages de ses dossiers ;
 *   - l'aperçu de l'équipe (pas de session de client) et l'équipe lisent par
 *     la clé de service, une fois le dossier vérifié par l'appelant.
 * Les écritures passent toutes par la clé de service, après les contrôles de
 * l'appelant (session, propriété du dossier, aperçu refusé).
 *
 * Le fil ne fait pas partie du « document » de l'espace (depot.lire) : il
 * n'est lu qu'à la demande — la bulle ouverte, la page « Mon conseiller », la
 * boîte de réception du CRM —, jamais à chaque page.
 *
 * La table se crée d'elle-même (assurerTable) ; en démonstration en mémoire,
 * le fil vit en mémoire, comme le reste.
 */

const TABLE = "ec_messages";
/** Un fil se lit jusqu'à ses 400 derniers messages. */
const FIL_MAX = 400;
/** Au plus un e-mail d'avis par dossier et par sens dans cette fenêtre (le client écrit trois messages de suite : un seul e-mail). */
export const FENETRE_AVIS_MS = 10 * 60_000;

export interface LigneMessage {
  id: string;
  dossier_id: string;
  auteur: Auteur;
  client_id: string | null;
  equipe_id: number | null;
  auteur_nom: string;
  corps: string;
  piece_chemin: string | null;
  piece_nom: string | null;
  piece_mime: string | null;
  piece_taille: number | null;
  created_at: string;
  lu_par_client_le: string | null;
  lu_par_equipe_le: string | null;
}

// --- La table ----------------------------------------------------------------------------------------

const g = globalThis as typeof globalThis & { __ecDiscussionPrete?: Promise<void>; __ecMessages?: LigneMessage[] };

/**
 * Pose la table si elle manque, une fois par processus, par la petite
 * connexion des modules partagés (base-crm.ts). Sans DATABASE_URL utilisable,
 * rien : la table vient alors du CRM ou de la migration 0016. Ne lève jamais.
 */
export function assurerTable(): Promise<void> {
  if (estDemo()) return Promise.resolve();
  if (!g.__ecDiscussionPrete) {
    g.__ecDiscussionPrete = (async () => {
      const lire = baseCrm();
      if (lire) await lire(SCHEMA_DISCUSSION);
    })().catch((e) => {
      g.__ecDiscussionPrete = undefined;
      console.error("Discussion : création de la table ec_messages impossible", e instanceof Error ? e.message : e);
    });
  }
  return g.__ecDiscussionPrete;
}

const tableAbsente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || /could not find the table|does not exist/i.test(e.message ?? ""));

/**
 * Une requête sur la table, après s'être assuré qu'elle existe. Juste créée,
 * l'API de Supabase met un instant à la voir (son cache se recharge sur la
 * création) : une seconde tentative, une seconde plus tard.
 */
async function requete<T>(faire: () => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>): Promise<T | null> {
  await assurerTable();
  let r = await avecDelai(faire());
  if (tableAbsente(r.error)) {
    await new Promise((ok) => setTimeout(ok, 1200));
    r = await avecDelai(faire());
  }
  if (tableAbsente(r.error)) return null;
  if (r.error) throw new Error(`Discussion : ${r.error.message}`);
  return r.data;
}

const memoire = () => (g.__ecMessages ??= []);

// --- Lire --------------------------------------------------------------------------------------------

/** Un message, tel que l'affiche le navigateur ; le lien de la pièce passe par la porte de l'app qui l'affiche. */
export function versVue(l: LigneMessage, porte: string): MessageVue {
  return {
    id: l.id,
    auteur: l.auteur,
    nom: l.auteur_nom,
    corps: l.corps,
    piece: l.piece_chemin
      ? {
          nom: l.piece_nom ?? "Pièce jointe",
          mime: l.piece_mime ?? "",
          taille: Number(l.piece_taille ?? 0),
          lien: lienFichier("msg", l.id, { porte }),
          image: IMAGES_AFFICHABLES.includes(l.piece_mime ?? ""),
        }
      : null,
    le: new Date(l.created_at).toISOString(),
    luParClient: l.lu_par_client_le ? new Date(l.lu_par_client_le).toISOString() : null,
    luParEquipe: l.lu_par_equipe_le ? new Date(l.lu_par_equipe_le).toISOString() : null,
  };
}

/**
 * Les messages d'un dossier, du plus ancien au plus récent.
 * `par` : « session » — le client connecté, sous la RLS ; « service » — la
 * clé de service, pour l'équipe et l'aperçu (l'appelant a vérifié le dossier).
 */
export async function lireFil(dossierId: string, par: "session" | "service"): Promise<LigneMessage[]> {
  if (estDemo()) {
    return memoire()
      .filter((m) => m.dossier_id === dossierId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-FIL_MAX)
      .map((m) => ({ ...m }));
  }
  if (!baseConfiguree()) return [];
  const db = par === "session" ? ((await createAuthClient()) as unknown as ReturnType<typeof createServiceClient>) : createServiceClient();
  const lignes = await requete<LigneMessage[]>(() =>
    db.from(TABLE).select("*").eq("dossier_id", dossierId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(FIL_MAX),
  );
  return (lignes ?? []).reverse();
}

/** Les messages de l'équipe que le client n'a pas encore lus (la pastille de la bulle). */
export async function nonLusParClient(dossierId: string, par: "session" | "service"): Promise<number> {
  const fil = await lireFil(dossierId, par);
  return fil.filter((m) => m.auteur === "equipe" && !m.lu_par_client_le).length;
}

// --- Écrire ------------------------------------------------------------------------------------------

export type NouveauMessage = Pick<LigneMessage, "dossier_id" | "auteur" | "client_id" | "equipe_id" | "auteur_nom" | "corps"> &
  Partial<Pick<LigneMessage, "piece_chemin" | "piece_nom" | "piece_mime" | "piece_taille">>;

export async function ajouterMessage(m: NouveauMessage): Promise<LigneMessage> {
  const ligne: LigneMessage = {
    id: nouvelId(),
    piece_chemin: null,
    piece_nom: null,
    piece_mime: null,
    piece_taille: null,
    ...m,
    created_at: maintenant(),
    lu_par_client_le: null,
    lu_par_equipe_le: null,
  };
  if (estDemo()) {
    memoire().push(ligne);
    return { ...ligne };
  }
  const r = await requete<LigneMessage>(() => createServiceClient().from(TABLE).insert(ligne).select("*").single());
  if (!r) throw new Error("La discussion n'est pas encore prête : réessayez dans un instant.");
  return r;
}

/**
 * Marque lus les messages de l'autre côté : le client lit ceux de l'équipe,
 * l'équipe ceux du client. Rend le nombre de messages marqués.
 */
export async function marquerLu(dossierId: string, par: Auteur): Promise<number> {
  const colonne = par === "client" ? "lu_par_client_le" : "lu_par_equipe_le";
  const autre: Auteur = par === "client" ? "equipe" : "client";
  if (estDemo()) {
    let n = 0;
    for (const m of memoire()) {
      if (m.dossier_id === dossierId && m.auteur === autre && !m[colonne]) {
        m[colonne] = maintenant();
        n++;
      }
    }
    return n;
  }
  const r = await requete<{ id: string }[]>(() =>
    createServiceClient().from(TABLE).update({ [colonne]: maintenant() }).eq("dossier_id", dossierId).eq("auteur", autre).is(colonne, null).select("id"),
  );
  return r?.length ?? 0;
}

/**
 * Un e-mail d'avis de la discussion est-il déjà parti (ou journalisé) pour ce
 * dossier dans les dix dernières minutes ? Les avis de la discussion portent
 * `fil: true` dans leur contenu : les autres messages au conseiller (une
 * demande d'autres créneaux de visite) ne comptent pas. En cas de doute (le
 * journal ne se lit pas), on envoie.
 */
export async function avisRecent(dossierId: string, modele: string): Promise<boolean> {
  const depuis = new Date(Date.now() - FENETRE_AVIS_MS).toISOString();
  try {
    if (estDemo()) {
      return (await depot().lire()).notifications.some((n) => n.dossier_id === dossierId && n.modele === modele && n.payload.fil === true && n.sent_at >= depuis);
    }
    const { data, error } = await avecDelai(
      createServiceClient().from("ec_notifications").select("id").eq("dossier_id", dossierId).eq("modele", modele).eq("payload->>fil", "true").gte("sent_at", depuis).limit(1),
    );
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  } catch (e) {
    console.error("Discussion : journal des avis illisible, l'avis part", e instanceof Error ? e.message : e);
    return false;
  }
}

// --- La pièce jointe ---------------------------------------------------------------------------------

const refus = (texte: string, status: number) =>
  new Response(texte, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Sert la pièce jointe d'un message, par l'une des deux portes de fichiers
 * (client ou équipe) : il faut un lien signé encore valable ET que
 * `autorise(dossier)` dise oui — le client titulaire, ou l'équipe. Même
 * réponse qu'elle n'existe pas ou qu'elle ne soit pas à vous.
 */
export async function servirPiece(id: string, url: URL, autorise: (dossierId: string) => boolean | Promise<boolean>): Promise<Response> {
  if (!lienValide("msg", id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return refus("Lien expiré ou invalide : rechargez la page pour en obtenir un nouveau.", 403);
  }
  let ligne: LigneMessage | null = null;
  if (estDemo()) ligne = memoire().find((m) => m.id === id) ?? null;
  else if (/^[0-9a-f-]{36}$/i.test(id)) ligne = await requete<LigneMessage>(() => createServiceClient().from(TABLE).select("*").eq("id", id).maybeSingle()).catch(() => null);
  if (!ligne?.piece_chemin || !(await autorise(ligne.dossier_id))) return refus("Introuvable.", 404);
  return (await reponseDuSeau(ligne.piece_chemin, ligne.piece_nom ?? "piece-jointe", url.searchParams.get("dl") === "1")) ?? refus("Ce fichier n'est plus disponible.", 404);
}

export { PORTE_FICHIERS_CLIENT };
