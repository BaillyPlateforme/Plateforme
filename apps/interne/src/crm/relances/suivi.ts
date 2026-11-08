import "server-only";
import { lireDonnees } from "@/lib/espace-client/depot";
import { snapshotDe } from "@/lib/espace-client/lectures";
import { piecesManquantes } from "@/lib/espace-client/progression";
import { q } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { defCourrier, ecart, familleDe, RELANCES, STATUT_ENVOI, type Canal, type TypeCourrier, type TypeRelance } from "./regles";

/*
 * Le suivi des relances, en lecture : les envois (journal public.envois, lu
 * seulement, et décisions de crm.relances), l'historique, l'effet mesurable,
 * le journal des modifications de règles et les dossiers exclus.
 */

type Client = { nom: string | null; prenom: string | null; societe: string | null };
const nom = (c: Client) => (c.nom || c.societe ? nomClient(c) : "");

/** Une relance partie (ou tentée), avec l'issue de chacun de ses canaux. */
export interface LigneHistorique {
  cle: string;
  type: TypeCourrier;
  rang: number;
  dossierId: number | null;
  ref: string;
  client: string;
  /** ISO, date et heure. */
  date: string;
  par: string | null;
  origine: "veille" | "equipe";
  canaux: { canal: Canal; statut: string; famille: string; motif: string | null }[];
  /** La meilleure issue des canaux : réussi, sinon retenu par les garde-fous, sinon échec. */
  famille: "reussi" | "garde_fou" | "echec" | "en_cours";
  /** Inscrite comme envoyée dans crm.relances (un échec partout ne l'est pas). */
  envoyee: boolean;
  /** Ce qu'elle a demandé, quand l'équipe n'en a retenu qu'une partie : les éléments retenus, sur combien. */
  partielle?: { titres: string[]; sur: number } | null;
  /** Comment elle est partie, quand ce n'est pas avec le texte de la carte : « texte personnalisé », « texte proposé, relu », « hors suite ». */
  comment?: string | null;
}

const ORDRE_FAMILLE = ["reussi", "garde_fou", "en_cours", "echec"] as const;

/** Tout ce qui est parti, ou a été tenté, depuis une date (AAAA-MM-JJ). */
export async function historiqueRelances(depuis?: string): Promise<LigneHistorique[]> {
  const [envois, decisions] = await Promise.all([
    // Lecture seule du journal des envois de la plateforme.
    q<{ cle: string; canal: Canal; origine: string; reference: string | null; statut: string; motif: string | null; cree_le: string }>(
      `select cle, canal, origine, reference, statut, motif, cree_le::text from public.envois
        where cle like 'relance:%' ${depuis ? "and cree_le >= $1::date" : ""} order by cree_le desc limit 3000`,
      depuis ? [depuis] : [],
    ).catch((e) => {
      console.error("Relances : journal des envois illisible", e instanceof Error ? e.message : e);
      return [];
    }),
    q<Client & {
      cle: string; type: TypeCourrier; rang: number; dossier_id: number; envoyee_le: string; envoi_statut: string | null; envoi_motif: string | null; par: string | null;
      canaux: Canal[] | null; ref: string | null;
      elements: { inclus?: { titre: string }[]; total?: number; tout?: boolean; personnalisee?: boolean; texte?: string; horsSuite?: boolean } | null;
    }>(
      `select r.cle, r.type, r.rang, r.dossier_id, r.envoyee_le::text, r.envoi_statut, r.envoi_motif, r.par, r.canaux, r.elements, d.ref, c.nom, c.prenom, c.societe
         from relances r left join dossiers d on d.id = r.dossier_id left join clients c on c.id = d.client_id
        where r.statut = 'envoyee' ${depuis ? "and r.envoyee_le >= $1::date" : ""}`,
      depuis ? [depuis] : [],
    ),
  ]);

  const lignes = new Map<string, LigneHistorique>();
  for (const d of decisions) {
    if (!defCourrier(d.type)) continue;
    lignes.set(d.cle, {
      cle: d.cle, type: d.type, rang: d.rang, dossierId: d.dossier_id, ref: d.ref ?? "", client: nom(d), date: d.envoyee_le, par: d.par,
      origine: d.par === "tâche planifiée" ? "veille" : "equipe", canaux: [], famille: "echec", envoyee: true,
      partielle: d.elements && d.elements.tout === false ? { titres: (d.elements.inclus ?? []).map((x) => x.titre), sur: d.elements.total ?? 0 } : null,
      comment: [d.elements?.personnalisee ? "texte personnalisé" : d.elements?.texte === "propose" ? "texte proposé, relu" : null, d.elements?.horsSuite ? "hors suite" : null].filter(Boolean).join(" · ") || null,
    });
  }
  // Les envois du journal, rattachés à leur relance par la clé : « relance:<type>:<objet>:<rang>[:sms] ».
  const orphelins: string[] = [];
  for (const e of envois) {
    const reste = e.cle.slice("relance:".length);
    const cle = reste.endsWith(":sms") ? reste.slice(0, -4) : reste;
    const [type, , rang] = cle.split(":");
    if (!defCourrier(type)) continue;
    let l = lignes.get(cle);
    if (!l) {
      l = {
        cle, type: type as TypeCourrier, rang: Number(rang) || 1, dossierId: null, ref: e.reference ?? "", client: "", date: e.cree_le, par: null,
        origine: e.origine === "veille" ? "veille" : "equipe", canaux: [], famille: "echec", envoyee: false,
      };
      lignes.set(cle, l);
      if (e.reference) orphelins.push(e.reference);
    }
    if (!l.canaux.some((c) => c.canal === e.canal)) l.canaux.push({ canal: e.canal, statut: e.statut, famille: familleDe(e.statut), motif: e.motif });
  }
  // Les envois sans décision (en échec partout) : le dossier se retrouve par sa référence.
  if (orphelins.length) {
    const dossiers = await q<Client & { id: number; ref: string }>(
      "select d.id, d.ref, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id where d.ref = any($1)",
      [[...new Set(orphelins)]],
    );
    const parRef = new Map(dossiers.map((d) => [d.ref, d]));
    for (const l of lignes.values()) {
      const d = !l.dossierId ? parRef.get(l.ref) : undefined;
      if (d) Object.assign(l, { dossierId: d.id, client: nom(d) });
    }
  }
  // Une décision sans ligne au journal (relance d'avant le journal) : ses canaux d'après crm.relances.
  for (const d of decisions) {
    const l = lignes.get(d.cle);
    if (!l) continue;
    for (const canal of d.canaux?.length ? d.canaux : (["email"] as Canal[])) {
      if (!l.canaux.some((c) => c.canal === canal)) l.canaux.push({ canal, statut: d.envoi_statut ?? "echec", famille: familleDe(d.envoi_statut), motif: d.envoi_motif });
    }
  }
  for (const l of lignes.values()) {
    l.canaux.sort((a, b) => a.canal.localeCompare(b.canal));
    l.famille = ORDRE_FAMILLE.find((f) => l.canaux.some((c) => c.famille === f)) ?? "echec";
  }
  return [...lignes.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** L'effet d'un type de relance, quand les données permettent de le mesurer. */
export interface Effet {
  type: TypeRelance;
  libelle: string;
  mesurable: boolean;
  /** Ce qui est mesuré (ou pourquoi rien ne l'est), en une phrase. */
  texte: string;
  /** Objets relancés par un envoi réellement parti. */
  relances: number;
  /** Parmi eux, ceux réglés après la relance (devis signé, facture payée…). */
  suivis: number;
  delaiMedian: number | null;
  /** Objets dont les relances ont toutes été retenues par les garde-fous (rien n'est parti). */
  retenus: number;
}

const mediane = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

/**
 * Ce que l'on peut mesurer, sans rien inventer : pour chaque objet relancé
 * par un envoi réellement parti (statut « envoyé »), ce qui s'est réglé
 * ensuite — devis signé, facture payée, pièces toutes reçues, conditions
 * validées. Une relance journalisée ou bloquée n'est jamais partie : elle ne
 * compte pas. L'avis ne se mesure pas : la plateforme ne sait pas s'il est déposé.
 */
export async function mesurerEffet(historique: LigneHistorique[]): Promise<Effet[]> {
  // La première relance réellement partie, par objet ; et les objets dont rien n'est parti.
  const parties = new Map<string, string>();
  const retenus = new Set<string>();
  for (const l of [...historique].sort((a, b) => a.date.localeCompare(b.date))) {
    const objet = l.cle.split(":").slice(0, 2).join(":");
    if (l.famille === "reussi") {
      if (!parties.has(objet)) parties.set(objet, l.date);
    } else if (l.famille === "garde_fou") retenus.add(objet);
  }
  for (const o of parties.keys()) retenus.delete(o);
  const objets = (t: TypeRelance) => [...parties.entries()].filter(([o]) => o.startsWith(`${t}:`)).map(([o, date]) => ({ id: o.split(":")[1], date }));
  const nRetenus = (t: TypeRelance) => [...retenus].filter((o) => o.startsWith(`${t}:`)).length;

  // Ce qui s'est réglé, et quand, objet par objet.
  const regles = new Map<string, string | null>();
  const devis = objets("devis");
  if (devis.length) {
    for (const r of await q<{ id: string; le: string }>("select dossier_id::text as id, min(signe_le)::text as le from devis where statut='signe' and dossier_id = any($1::int[]) group by 1", [devis.map((d) => Number(d.id))])) regles.set(`devis:${r.id}`, r.le);
  }
  const soldes = objets("solde");
  if (soldes.length) {
    for (const r of await q<{ id: string; le: string | null }>("select id::text, payee_le::text as le from factures where statut='payee' and id = any($1::int[])", [soldes.map((d) => Number(d.id))])) regles.set(`solde:${r.id}`, r.le);
  }
  const ec = [...objets("pieces"), ...objets("conditions")];
  if (ec.length) {
    try {
      const donnees = await lireDonnees();
      for (const t of ["pieces", "conditions"] as const) {
        for (const o of objets(t)) {
          const s = snapshotDe(donnees, o.id);
          if (!s) continue;
          if (t === "pieces" && !piecesManquantes(s).length) {
            const ids = new Set(s.requirements.filter((r) => r.obligatoire).map((r) => r.id));
            const dates = s.documents.filter((d) => d.requirement_id && ids.has(d.requirement_id)).map((d) => d.created_at).sort();
            regles.set(`pieces:${o.id}`, dates.at(-1) ?? null);
          }
          if (t === "conditions" && s.conditions?.valide_at) regles.set(`conditions:${o.id}`, s.conditions.valide_at);
        }
      }
    } catch {
      // L'espace client ne se lit pas : pièces et conditions restent sans mesure.
    }
  }

  const QUOI: Record<TypeRelance, string> = {
    devis: "devis signés après la relance", pieces: "dossiers aux pièces toutes reçues après la relance", conditions: "conditions validées après la relance",
    solde: "factures payées après la relance", avis: "",
  };
  return RELANCES.map((def) => {
    const base = { type: def.type, libelle: def.libelle, retenus: nRetenus(def.type) };
    if (def.type === "avis") {
      return { ...base, mesurable: false, relances: objets("avis").length, suivis: 0, delaiMedian: null, texte: "Non mesurable : la plateforme ne sait pas si le client a déposé son avis." };
    }
    const liste = objets(def.type);
    if (!liste.length) {
      return {
        ...base, mesurable: false, relances: 0, suivis: 0, delaiMedian: null,
        texte: base.retenus ? `Aucune relance réellement partie (${base.retenus} retenue${base.retenus > 1 ? "s" : ""} par les garde-fous) : rien à mesurer.` : "Aucune relance partie : rien à mesurer pour l'instant.",
      };
    }
    const delais: number[] = [];
    for (const o of liste) {
      const le = regles.get(`${def.type}:${o.id}`);
      if (le && le.slice(0, 10) >= o.date.slice(0, 10)) delais.push(ecart(o.date.slice(0, 10), le.slice(0, 10)));
    }
    return { ...base, mesurable: true, relances: liste.length, suivis: delais.length, delaiMedian: mediane(delais), texte: QUOI[def.type] };
  });
}

export interface EntreeJournal {
  id: number;
  type: string | null;
  action: string;
  resume: string;
  par: string | null;
  cree_le: string;
}

export async function journalRegles(limite = 60): Promise<EntreeJournal[]> {
  return q<EntreeJournal>("select id, type, action, resume, par, cree_le::text from relances_journal order by cree_le desc, id desc limit $1", [limite]);
}

export interface Exclusion {
  dossierId: number;
  type: string;
  ref: string;
  client: string;
  motif: string | null;
  par: string | null;
  le: string;
}

export async function exclusions(): Promise<Exclusion[]> {
  const rows = await q<Client & { dossier_id: number; type: string; ref: string; motif: string | null; par: string | null; cree_le: string }>(
    `select e.dossier_id, e.type, e.motif, e.par, e.cree_le::text, d.ref, c.nom, c.prenom, c.societe
       from relances_exclusions e join dossiers d on d.id = e.dossier_id join clients c on c.id = d.client_id order by e.cree_le desc`,
  );
  return rows.map((r) => ({ dossierId: r.dossier_id, type: r.type, ref: r.ref, client: nom(r), motif: r.motif, par: r.par, le: r.cree_le }));
}

/** Les dossiers que l'on peut exclure : les plus récents d'abord. */
export async function dossiersChoisissables(): Promise<{ id: number; ref: string; client: string }[]> {
  const rows = await q<Client & { id: number; ref: string }>(
    "select d.id, d.ref, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id where d.statut not in ('perdu','termine') order by d.cree_le desc limit 600",
  );
  return rows.map((r) => ({ id: r.id, ref: r.ref, client: nom(r) }));
}

export const libelleStatut = (s: string) => STATUT_ENVOI[s]?.libelle ?? s;

/** La référence et le client d'un dossier, pour l'en-tête d'une page filtrée sur lui. */
export async function enteteDossier(id: number | null): Promise<{ ref: string; client: string } | null> {
  if (!id) return null;
  const r = await q<Client & { ref: string }>("select d.ref, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id where d.id = $1", [id]);
  return r[0] ? { ref: r[0].ref, client: nom(r[0]) } : null;
}
