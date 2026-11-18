import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { NomFournisseur } from "./fournisseurs";
import type { Canal, ModeEnvoi } from "./garde-fous";

/*
 * Le journal des envois : la table public.envois (migration 0013). Une ligne
 * par message, envoyé ou non, avec son statut, l'identifiant du message chez
 * son fournisseur et sa clé d'idempotence, unique.
 *
 * L'identifiant du message vit dans la colonne `brevo_id`, quel que soit le
 * fournisseur (Brevo, SendGrid ou Twilio) : le nom date de Brevo, et renommer
 * la colonne casserait le code en service le temps du déploiement. Le nom du
 * fournisseur, dans la colonne `fournisseur` (migration 0022) — facultative :
 * tant qu'elle manque, il n'est pas écrit (conclure), et les écrans le
 * déduisent de la forme de l'identifiant (fournisseurDe, fournisseurs.ts).
 *
 * La clé est réservée AVANT tout appel au fournisseur, en une seule requête
 * (« on conflict do nothing ») : deux appels simultanés avec la même clé — un
 * double clic, une tâche relancée — n'en font partir qu'un. Une clé déjà
 * prise ne repart pas, sauf si son message a été refusé par le fournisseur
 * (4xx : rien n'est parti) : celui-là peut être retenté sous la même clé.
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
  /** L'identifiant du message chez son fournisseur (Brevo, SendGrid ou Twilio), malgré le nom de la colonne. */
  brevo_id: string | null;
  /** Le fournisseur qui a reçu le message (migration 0022) : absent tant que la colonne n'existe pas. */
  fournisseur?: NomFournisseur | null;
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
  // Refusé par le fournisseur : rien n'est parti, on peut retenter — une seule reprise à la fois.
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

/*
 * La colonne `fournisseur` (migration 0022) peut manquer : la base n'a pas
 * encore reçu la migration. Rien ne doit casser pour autant (règle du
 * projet) : si la base la refuse, le statut s'inscrit sans elle, et on ne
 * la propose plus pendant dix minutes — le temps qu'une migration appliquée
 * entre-temps soit vue sans redémarrer.
 */
const SANS_COLONNE_MS = 10 * 60_000;
const coffre = globalThis as typeof globalThis & { __envoisSansFournisseur?: number };
const colonneFournisseurAbsente = () => !!coffre.__envoisSansFournisseur && Date.now() - coffre.__envoisSansFournisseur < SANS_COLONNE_MS;
/** L'erreur dit-elle que la colonne n'existe pas ? (PostgREST : PGRST204 « Could not find the 'fournisseur' column ».) */
const colonneManquante = (e: { message?: string; code?: string }) =>
  e.code === "PGRST204" || e.code === "42703" || /fournisseur/i.test(e.message ?? "");

export async function conclure(
  id: string,
  champs: { statut: Exclude<StatutEnvoi, "en_cours">; motif: string | null; brevo_id?: string | null; fournisseur?: NomFournisseur | null },
) {
  const { fournisseur, ...reste } = champs;
  const ecrire = (c: Record<string, unknown>) =>
    avecDelai(
      createServiceClient()
        .from(TABLE)
        .update({ ...c, traite_le: new Date().toISOString() })
        .eq("id", id),
    );
  const avecFournisseur = fournisseur !== undefined && !colonneFournisseurAbsente();
  let { error } = await ecrire(avecFournisseur ? { ...reste, fournisseur } : reste);
  if (error && avecFournisseur && colonneManquante(error)) {
    coffre.__envoisSansFournisseur = Date.now();
    ({ error } = await ecrire(reste));
  }
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

/** Un destinataire ramené à une forme unique : e-mail sans « +étiquette », numéro au format 33…. */
export function destinataireNormalise(canal: string, s: string): string {
  const d = s.trim().toLowerCase();
  if (canal === "email") {
    const at = d.lastIndexOf("@");
    return at > 0 ? `${d.slice(0, at).split("+")[0]}@${d.slice(at + 1)}` : d;
  }
  const chiffres = d.replace(/\D/g, "");
  if (chiffres.startsWith("0033")) return chiffres.slice(2);
  if (chiffres.length === 10 && chiffres.startsWith("0")) return `33${chiffres.slice(1)}`;
  return chiffres;
}

/**
 * Combien de messages automatiques vers le client (clé « questionnaires:… »,
 * posée par alerts.ts) sont réellement partis sur les dernières 24 heures, pour
 * un canal, et au besoin un destinataire — alias « prenom+1@… » et écritures du
 * même numéro comprises. La base des plafonds des envois du formulaire
 * (index.ts) ; quelques centaines de lignes au plus, comparées ici. Illisible :
 * 0, pour ne pas bloquer un vrai message sur une panne du journal.
 */
export async function partisSur24h(f: { canal: string; destinataire?: string }): Promise<number> {
  const { data, error } = await createServiceClient()
    .from(TABLE)
    .select("destinataire")
    .eq("origine", "questionnaires")
    .like("cle", "questionnaires:%")
    .eq("canal", f.canal)
    .eq("statut", "envoye")
    .gte("cree_le", new Date(Date.now() - 24 * 3600_000).toISOString())
    .limit(5000);
  if (error || !data) return 0;
  if (!f.destinataire) return data.length;
  const cible = destinataireNormalise(f.canal, f.destinataire);
  return data.filter((l) => destinataireNormalise(f.canal, String(l.destinataire ?? "")) === cible).length;
}
