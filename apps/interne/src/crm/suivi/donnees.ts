import "server-only";
import { q, type Row } from "@/crm/lib/db";
import type { Agent } from "@/lib/suivi-envois/regles";
import { leJour, resumePiste, type SuiviEnvoi } from "./etapes";

/*
 * Le suivi des e-mails, en lecture, pour le CRM : ce que disent
 * public.envois_evenements et public.envois_liens (lib/suivi-envois/schema.ts) d'un
 * envoi, d'un devis, d'un dossier. Par le pool du CRM, tables préfixées.
 *
 * Les lectures ne font jamais tomber une page : tables absentes (base neuve,
 * suivi pas encore posé) ou base lente, et le suivi est simplement vide.
 */

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

const AGREGAT = `
  select v.id::text as id, v.statut, v.motif, v.cree_le,
    (select min(e.cree_le) from public.envois_evenements e where e.envoi_id = v.id and e.type = 'delivre') as delivre,
    (select jsonb_build_object('genre', e.detail->>'genre', 'le', e.cree_le, 'raison', e.detail->>'raison')
       from public.envois_evenements e where e.envoi_id = v.id and e.type = 'rebond' order by e.cree_le desc limit 1) as rebond,
    (select min(e.cree_le) from public.envois_evenements e where e.envoi_id = v.id and e.type = 'plainte') as plainte,
    (select min(e.cree_le) from public.envois_evenements e where e.envoi_id = v.id and e.type = 'desinscription') as desinscription,
    (select jsonb_build_object('n', count(*) filter (where not e.automatique), 'auto', count(*) filter (where e.automatique),
              'premiere', min(e.cree_le) filter (where not e.automatique), 'derniere', max(e.cree_le) filter (where not e.automatique),
              'premiereAuto', min(e.cree_le) filter (where e.automatique),
              'agents', coalesce(jsonb_agg(distinct e.agent) filter (where e.agent is not null), '[]'::jsonb))
       from public.envois_evenements e where e.envoi_id = v.id and e.type = 'ouverture') as ouvertures,
    (select coalesce(jsonb_agg(c order by c.premier), '[]'::jsonb) from (
       select e.lien_indice as indice, max(e.lien_libelle) as libelle, max(e.lien_url) as destination,
              count(*) filter (where not e.automatique) as n, count(*) filter (where e.automatique) as auto,
              min(e.cree_le) as premier, max(e.cree_le) as dernier
         from public.envois_evenements e where e.envoi_id = v.id and e.type = 'clic' group by e.lien_indice) c) as clics,
    (select jsonb_build_object('n', count(*), 'premiere', min(e.cree_le), 'derniere', max(e.cree_le),
              'pages', coalesce(jsonb_agg(distinct e.page) filter (where e.page is not null), '[]'::jsonb))
       from public.envois_evenements e where e.envoi_id = v.id and e.type in ('portail', 'action')) as portail
  from public.envois v`;

function suiviDe(r: Row): SuiviEnvoi {
  const o = (r.ouvertures ?? {}) as Row;
  const p = (r.portail ?? {}) as Row;
  return {
    envoiId: r.id,
    statut: r.statut,
    motif: r.motif ?? null,
    envoyeLe: iso(r.cree_le)!,
    delivre: iso(r.delivre),
    rebond: r.rebond ? { genre: String(r.rebond.genre ?? "rebond"), le: iso(r.rebond.le)!, raison: r.rebond.raison ?? null } : null,
    plainte: iso(r.plainte),
    desinscription: iso(r.desinscription),
    ouvertures: {
      n: Number(o.n ?? 0),
      auto: Number(o.auto ?? 0),
      premiere: iso(o.premiere),
      derniere: iso(o.derniere),
      premiereAuto: iso(o.premiereAuto),
      agents: (o.agents ?? []) as Agent[],
    },
    clics: ((r.clics ?? []) as Row[]).map((c) => ({
      indice: Number(c.indice),
      libelle: c.libelle ?? null,
      destination: c.destination ?? null,
      n: Number(c.n ?? 0),
      auto: Number(c.auto ?? 0),
      premier: iso(c.premier)!,
      dernier: iso(c.dernier)!,
    })),
    portail: { n: Number(p.n ?? 0), premiere: iso(p.premiere), derniere: iso(p.derniere), pages: (p.pages ?? []) as string[] },
  };
}

/** Le suivi de ces e-mails (identifiants du journal des envois), par identifiant. Les SMS n'ont pas de suivi. */
export async function suiviDesEnvois(ids: string[]): Promise<Map<string, SuiviEnvoi>> {
  const liste = [...new Set(ids.filter(Boolean))];
  if (!liste.length) return new Map();
  try {
    const rows = await q(`${AGREGAT} where v.id = any($1::uuid[]) and v.canal = 'email'`, [liste]);
    return new Map(rows.map((r) => [r.id as string, suiviDe(r)]));
  } catch (e) {
    console.error("Suivi des e-mails : lecture impossible", e instanceof Error ? e.message : e);
    return new Map();
  }
}

/** Le suivi des e-mails dont la clé commence ainsi (« relance:devis:12: »), du plus récent au plus ancien. */
export async function suiviParCles(prefixes: string[]): Promise<(SuiviEnvoi & { cle: string })[]> {
  if (!prefixes.length) return [];
  try {
    const rows = await q(
      `${AGREGAT.replace("select v.id::text as id,", "select v.cle, v.id::text as id,")}
        where v.canal = 'email' and v.cle like any($1::text[]) order by v.cree_le desc limit 200`,
      [prefixes.map((p) => `${p.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)],
    );
    return rows.map((r) => ({ ...suiviDe(r), cle: r.cle as string }));
  } catch (e) {
    console.error("Suivi des e-mails : lecture impossible", e instanceof Error ? e.message : e);
    return [];
  }
}

/* ─────────────── Les devis ─────────────── */

export interface SuiviDevis {
  /** L'e-mail du devis le plus récent (« Signer le devis »), avec son suivi. */
  suivi: SuiviEnvoi | null;
  /** La dernière fois que le client a regardé ses devis sur le portail (espace client ou page de signature), depuis l'envoi. */
  consulteLe: string | null;
  pdfLe: string | null;
  /** La ligne : « ouvert 3× · consulté sur le portail le 9 nov. ». */
  texte: string;
  /** Un signe certain (ouverture, clic ou visite) : la ligne se colore. */
  chaud: boolean;
}

/**
 * Le suivi de ces devis : l'e-mail du devis (clé crm:devis:<id>:…) et, pour
 * son dossier, les visites du portail qui regardent les devis (pages devis
 * et signature, PDF du devis).
 */
export async function suiviDesDevis(devis: { id: number; dossier_id: number }[]): Promise<Map<number, SuiviDevis>> {
  const out = new Map<number, SuiviDevis>();
  if (!devis.length) return out;
  try {
    const [envois, visites] = await Promise.all([
      q<{ devis_id: number; id: string }>(
        `select distinct on (split_part(cle, ':', 3)) split_part(cle, ':', 3)::int as devis_id, id::text
           from public.envois where canal = 'email' and cle like 'crm:devis:%' and split_part(cle, ':', 3) = any($1::text[])
          order by split_part(cle, ':', 3), cree_le desc`,
        [devis.map((d) => String(d.id))],
      ),
      q<{ dossier_id: number; consulte: Date | null; pdf: Date | null }>(
        `select crm_dossier_id as dossier_id,
                max(cree_le) filter (where type = 'portail' and page in ('devis', 'signature')) as consulte,
                max(cree_le) filter (where type = 'action' and page = 'pdf_devis') as pdf
           from public.envois_evenements where crm_dossier_id = any($1::int[]) and type in ('portail', 'action') group by crm_dossier_id`,
        [[...new Set(devis.map((d) => d.dossier_id))]],
      ),
    ]);
    const suivis = await suiviDesEnvois(envois.map((e) => e.id));
    const parDevis = new Map(envois.map((e) => [Number(e.devis_id), suivis.get(e.id) ?? null]));
    const parDossier = new Map(visites.map((v) => [Number(v.dossier_id), v]));
    for (const d of devis) {
      const suivi = parDevis.get(d.id) ?? null;
      const v = parDossier.get(d.dossier_id);
      // Une visite d'avant l'envoi ne dit rien de cet e-mail : seulement celles d'après.
      const depuis = suivi ? Date.parse(suivi.envoyeLe) : 0;
      const consulteLe = v?.consulte && v.consulte.getTime() >= depuis ? v.consulte.toISOString() : null;
      const pdfLe = v?.pdf && v.pdf.getTime() >= depuis ? v.pdf.toISOString() : null;
      const morceaux = [suivi ? resumePiste(suivi) : null, consulteLe ? `consulté sur le portail ${leJour(consulteLe)}` : null, pdfLe ? "PDF téléchargé" : null].filter(Boolean);
      if (!suivi && !consulteLe && !pdfLe) continue;
      out.set(d.id, {
        suivi,
        consulteLe,
        pdfLe,
        texte: morceaux.join(" · "),
        chaud: !!(consulteLe || pdfLe || suivi?.ouvertures.n || suivi?.clics.some((c) => c.n > 0)),
      });
    }
  } catch (e) {
    console.error("Suivi des devis : lecture impossible", e instanceof Error ? e.message : e);
  }
  return out;
}

/* ─────────────── Le portail d'un dossier ─────────────── */

export interface JourPortail {
  /** AAAA-MM-JJ, à Paris. */
  jour: string;
  premiere: string;
  derniere: string;
  pages: string[];
  gestes: string[];
  /** Les e-mails d'où sont venues ces visites. */
  envois: string[];
}

/** Les visites du portail d'un dossier (espace client et page de signature), jour par jour, du plus ancien au plus récent. */
export async function visitesDuDossier(crmId: number, ecId: string | null): Promise<JourPortail[]> {
  try {
    const rows = await q(
      `select to_char(cree_le at time zone 'Europe/Paris', 'YYYY-MM-DD') as jour, min(cree_le) as premiere, max(cree_le) as derniere,
              coalesce(array_agg(distinct page) filter (where type = 'portail'), '{}') as pages,
              coalesce(array_agg(distinct page) filter (where type = 'action'), '{}') as gestes,
              coalesce(array_agg(distinct envoi_id::text) filter (where envoi_id is not null), '{}') as envois
         from public.envois_evenements
        where type in ('portail', 'action') and (crm_dossier_id = $1 or ($2::uuid is not null and ec_dossier_id = $2::uuid))
        group by 1 order by 1`,
      [crmId, ecId],
    );
    return rows.map((r) => ({ jour: r.jour, premiere: iso(r.premiere)!, derniere: iso(r.derniere)!, pages: r.pages ?? [], gestes: r.gestes ?? [], envois: r.envois ?? [] }));
  } catch (e) {
    console.error("Suivi du portail : lecture impossible", e instanceof Error ? e.message : e);
    return [];
  }
}
