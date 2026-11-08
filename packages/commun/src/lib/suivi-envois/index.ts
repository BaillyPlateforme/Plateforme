import "server-only";
import { URL_EXTERNE } from "@/lib/adresses";
import { baseCrm, type Lire } from "@/lib/base-crm";
import { estDemo } from "@/lib/espace-client/config";
import { chiffrer, dechiffrer, empreinteIp, jetonEnvoi, type JetonVisite } from "./jetons";
import { clicAutomatique, DOUBLON_PORTAIL_MIN, equiperHtml, familleAgent, ouvertureAutomatique } from "./regles";
import { RETENTION_JOURS, SCHEMA_SUIVI } from "./schema";

/*
 * Le suivi des e-mails aux clients, côté serveur : l'équipement d'un e-mail
 * au moment de l'envoi (envois/index.ts l'appelle, et lui seul), et
 * l'écriture des événements (les routes /t/… de l'app externe, le webhook de
 * Brevo, la page de signature du devis, la porte des fichiers).
 *
 * Indépendant du prestataire : le pixel et les liens suivis sont servis par
 * la plateforme elle-même (app externe). Brevo n'ajoute que ce qu'il est
 * seul à savoir : délivré, rebond, plainte, désinscription.
 *
 * Rien ici ne fait échouer un envoi ni une page : une base injoignable, une
 * table absente, et l'e-mail part tel quel, la page s'affiche, l'événement
 * est perdu. Le suivi passe par la petite connexion des modules partagés
 * (base-crm.ts) : sans DATABASE_URL utilisable, il ne fait rien.
 *
 * SUIVI_EMAILS=desactive coupe tout (aucun lien réécrit, aucun pixel).
 */

const DELAI_MS = 4000;

function avecDelai<T>(p: Promise<T>, ms = DELAI_MS): Promise<T> {
  return new Promise<T>((ok, ko) => {
    const t = setTimeout(() => ko(new Error("la base ne répond pas")), ms);
    p.then(
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

export const suiviActif = () => !estDemo() && !/^(desactive|désactivé|off|0)$/i.test(process.env.SUIVI_EMAILS ?? "");

/** L'adresse publique qui sert le pixel et les liens suivis : celle de l'app externe. */
export function adresseSuivi(): string | null {
  const b = process.env.SUIVI_URL || process.env.ESPACE_CLIENT_URL || URL_EXTERNE;
  return b ? b.replace(/\/$/, "") : null;
}

const g = globalThis as typeof globalThis & { __suiviPret?: Promise<Lire | null> };

/** La connexion, une fois les tables posées (une fois par processus). Null : pas de suivi. */
export function baseSuivi(): Promise<Lire | null> {
  if (!g.__suiviPret) {
    g.__suiviPret = (async () => {
      const lire = baseCrm();
      if (!lire) return null;
      await avecDelai(lire(SCHEMA_SUIVI), 10_000);
      return lire;
    })().catch((e) => {
      g.__suiviPret = undefined;
      console.error("Suivi des e-mails : tables indisponibles", e instanceof Error ? e.message : e);
      return null;
    });
  }
  return g.__suiviPret;
}

/** Ce qu'on retient d'une requête : la famille de l'agent et l'empreinte de l'adresse. */
export interface Requete {
  ua: string | null;
  ip: string | null;
}
export function requeteDe(h: Headers): Requete {
  return { ua: h.get("user-agent"), ip: h.get("x-forwarded-for") ?? h.get("x-real-ip") };
}

/* ─────────────── L'équipement d'un e-mail ─────────────── */

/**
 * Équipe l'e-mail d'une ligne du journal : liens réécrits, pixel posé, et
 * les destinations gardées (chiffrées). Si elles ne se gardent pas, l'e-mail
 * repart TEL QUEL : un lien suivi dont on aurait perdu la destination ne
 * mènerait nulle part. Ne lève jamais.
 */
export async function equiperEmail(envoiId: string, html: string): Promise<string> {
  try {
    if (!suiviActif()) return html;
    const base = adresseSuivi();
    if (!base) return html;
    const lire = await baseSuivi();
    if (!lire) return html;
    const r = equiperHtml(html, { base, jeton: jetonEnvoi(envoiId) });
    if (r.liens.length) {
      await avecDelai(
        lire(
          `insert into public.envois_liens (envoi_id, indice, libelle, destination, url_chiffree)
           select $1::uuid, x.i, x.l, x.d, x.u from unnest($2::smallint[], $3::text[], $4::text[], $5::text[]) as x(i, l, d, u)
           on conflict (envoi_id, indice) do update set libelle = excluded.libelle, destination = excluded.destination, url_chiffree = excluded.url_chiffree`,
          [envoiId, r.liens.map((l) => l.indice), r.liens.map((l) => l.libelle), r.liens.map((l) => l.destination), r.liens.map((l) => chiffrer(l.url))],
        ),
      );
    }
    return r.html;
  } catch (e) {
    console.error("Suivi des e-mails : e-mail envoyé sans suivi", e instanceof Error ? e.message : e);
    return html;
  }
}

/* ─────────────── Les événements ─────────────── */

type Envoi = { id: string; reference: string | null; secondes: number };

async function envoiDe(lire: Lire, id: string): Promise<Envoi | null> {
  const [e] = await lire<Envoi>(
    "select id::text, reference, extract(epoch from now() - cree_le)::float8 as secondes from public.envois where id = $1::uuid and canal = 'email'",
    [id],
  );
  return e ?? null;
}

/** Un envoi ne garde pas plus de N événements : un pixel rechargé en boucle ne remplit pas la table. */
const PLAFOND_PAR_ENVOI = 500;

/** L'ouverture d'un e-mail (son pixel). Ne lève jamais. */
export async function noterOuverture(envoiId: string, req: Requete): Promise<void> {
  try {
    const lire = await baseSuivi();
    if (!lire) return;
    const e = await envoiDe(lire, envoiId);
    if (!e) return;
    const agent = familleAgent(req.ua);
    const ip = empreinteIp(req.ip);
    // Un même appareil qui recharge l'image dans la minute : une seule ouverture.
    await avecDelai(
      lire(
        `insert into public.envois_evenements (envoi_id, type, reference, agent, empreinte_ip, automatique, detail)
         select $1::uuid, 'ouverture', $2, $3, $4, $5, jsonb_build_object('secondes', round($6::numeric))
          where not exists (select 1 from public.envois_evenements x where x.envoi_id = $1::uuid and x.type = 'ouverture' and x.agent = $3
                              and x.empreinte_ip is not distinct from $4 and x.cree_le > now() - interval '60 seconds')
            and (select count(*) from public.envois_evenements x where x.envoi_id = $1::uuid) < ${PLAFOND_PAR_ENVOI}`,
        [envoiId, e.reference, agent, ip, ouvertureAutomatique(agent, e.secondes), e.secondes],
      ),
    );
  } catch (e) {
    console.error("Suivi : ouverture non notée", e instanceof Error ? e.message : e);
  }
}

/** La destination d'un lien suivi, relue dans la base (jamais dans l'adresse). */
export async function lienSuivi(envoiId: string, indice: number): Promise<{ url: string; libelle: string | null; destination: string } | null> {
  try {
    if (!Number.isInteger(indice) || indice < 0 || indice > 999) return null;
    const lire = await baseSuivi();
    if (!lire) return null;
    const [l] = await avecDelai(
      lire<{ libelle: string | null; destination: string; url_chiffree: string }>(
        "select libelle, destination, url_chiffree from public.envois_liens where envoi_id = $1::uuid and indice = $2",
        [envoiId, indice],
      ),
    );
    if (!l) return null;
    const url = dechiffrer(l.url_chiffree);
    if (!url || !/^https?:\/\//i.test(url)) return null;
    return { url, libelle: l.libelle, destination: l.destination };
  } catch (e) {
    console.error("Suivi : lien illisible", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Un clic sur un lien suivi. Ne lève jamais. */
export async function noterClic(envoiId: string, lien: { indice: number; libelle: string | null; destination: string }, req: Requete): Promise<void> {
  try {
    const lire = await baseSuivi();
    if (!lire) return;
    const e = await envoiDe(lire, envoiId);
    if (!e) return;
    const agent = familleAgent(req.ua);
    const ip = empreinteIp(req.ip);
    await avecDelai(
      lire(
        `insert into public.envois_evenements (envoi_id, type, lien_indice, lien_libelle, lien_url, reference, agent, empreinte_ip, automatique, detail)
         select $1::uuid, 'clic', $2, $3, $4, $5, $6, $7, $8, jsonb_build_object('secondes', round($9::numeric))
          where not exists (select 1 from public.envois_evenements x where x.envoi_id = $1::uuid and x.type = 'clic' and x.lien_indice = $2
                              and x.empreinte_ip is not distinct from $7 and x.cree_le > now() - interval '10 seconds')
            and (select count(*) from public.envois_evenements x where x.envoi_id = $1::uuid) < ${PLAFOND_PAR_ENVOI}`,
        [envoiId, lien.indice, lien.libelle, lien.destination, e.reference, agent, ip, clicAutomatique(agent, e.secondes), e.secondes],
      ),
    );
  } catch (e) {
    console.error("Suivi : clic non noté", e instanceof Error ? e.message : e);
  }
}

export interface VisitePortail {
  /** La page (regles.ts, PAGES) ou le geste (GESTES) : « devis », « pdf_devis »… */
  page: string;
  reference: string | null;
  ecDossierId: string | null;
  crmDossierId: number | null;
  /** L'e-mail d'où vient la visite (le cookie d'un clic, le lien de signature), s'il est connu. */
  envoiId: string | null;
}

/**
 * Une page du portail vue, ou un geste clé (« action »). La même page revue
 * dans la demi-heure ne compte qu'une fois. Jamais pendant un aperçu de
 * l'équipe : c'est à l'appelant de ne pas appeler. Ne lève jamais.
 */
export async function noterPortail(v: VisitePortail, req: Requete, type: "portail" | "action" = "portail"): Promise<void> {
  try {
    if (!suiviActif()) return;
    const lire = await baseSuivi();
    if (!lire) return;
    const agent = familleAgent(req.ua);
    if (agent === "robot") return;
    await avecDelai(
      lire(
        `insert into public.envois_evenements (envoi_id, type, page, reference, ec_dossier_id, crm_dossier_id, agent, empreinte_ip)
         select $1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8
          where not exists (select 1 from public.envois_evenements x where x.type = $2 and x.page = $3
                              and (x.ec_dossier_id is not distinct from $5::uuid) and (x.crm_dossier_id is not distinct from $6)
                              and x.cree_le > now() - make_interval(mins => $9))`,
        [v.envoiId, type, v.page.slice(0, 40), v.reference, v.ecDossierId, v.crmDossierId, agent, empreinteIp(req.ip), type === "action" ? 5 : DOUBLON_PORTAIL_MIN],
      ),
    );
  } catch (e) {
    console.error("Suivi : visite du portail non notée", e instanceof Error ? e.message : e);
  }
}

/** La visite d'un dossier de l'espace client, d'après le jeton que sa page a remis au navigateur. */
export const noterVisite = (v: JetonVisite, page: string, envoiId: string | null, req: Requete) =>
  noterPortail({ page, reference: v.r, ecDossierId: v.d, crmDossierId: v.k, envoiId }, req);

/* ─────────────── Brevo ─────────────── */

export type EvenementBrevo = { type: "delivre" | "rebond" | "plainte" | "desinscription"; messageId: string; cle: string; genre: string; raison: string | null; quand: string | null };

/** Les événements de Brevo, rattachés à leur ligne du journal par l'identifiant du message. Rend le nombre inscrit. */
export async function noterBrevo(evenements: EvenementBrevo[]): Promise<number> {
  const lire = await baseSuivi();
  if (!lire) throw new Error("Suivi indisponible (base).");
  let n = 0;
  for (const ev of evenements) {
    const id = ev.messageId.trim();
    if (!id) continue;
    const r = await avecDelai(
      lire<{ id: string }>(
        `insert into public.envois_evenements (envoi_id, type, reference, detail, cree_le)
         select v.id, $2, v.reference, jsonb_build_object('cle', $3::text, 'genre', $4::text, 'raison', $5::text, 'source', 'brevo'),
                coalesce($6::timestamptz, now())
           from public.envois v
          where v.brevo_id in ($1, '<' || $1 || '>', btrim($1, '<>'))
            and not exists (select 1 from public.envois_evenements x where x.envoi_id = v.id and x.detail->>'cle' = $3::text)
          limit 1
         returning id::text`,
        [id, ev.type, ev.cle, ev.genre, ev.raison, ev.quand],
      ),
    );
    n += r.length;
  }
  return n;
}

/* ─────────────── La conservation ─────────────── */

/** Efface ce qui a passé RETENTION_JOURS : événements et liens (un lien expiré mène alors à l'accueil du site). */
export async function purgerSuivi(): Promise<{ evenements: number; liens: number } | null> {
  const lire = await baseSuivi();
  if (!lire) return null;
  const [r] = await lire<{ evenements: number; liens: number }>(
    `with e as (delete from public.envois_evenements where cree_le < now() - make_interval(days => $1) returning 1),
          l as (delete from public.envois_liens where cree_le < now() - make_interval(days => $1) returning 1)
     select (select count(*) from e)::int as evenements, (select count(*) from l)::int as liens`,
    [RETENTION_JOURS],
  );
  return r ?? { evenements: 0, liens: 0 };
}
