import "server-only";
import { Type, type FunctionDeclaration } from "@google/genai";
import { q, q1, type Row } from "@/crm/lib/db";
import { getDossier, listDossiers, stats } from "@/crm/lib/data";
import { soldesDossiers } from "@/crm/facturation/donnees";
import { listRequests } from "@/lib/requests";
import { ETAPE_DEMANDE, STATUTS_DOSSIER, etapeDossier, type CleEtapeDemande } from "@/crm/kanban/etapes";
import { prochaineEtape } from "@/crm/parcours/prochaine";
import type { Faits } from "@/crm/parcours/etapes";
import type { Entite, EntiteChiffre, EntiteDemande, EntiteDevis, EntiteDossier, EntiteRdv, ProchaineEtape } from "./types";

/*
 * Les outils du Copilote : des LECTURES du CRM, rien d'autre. Le modèle choisit
 * l'outil et ses paramètres ; le serveur l'exécute ici, avec la session de
 * l'équipe déjà vérifiée par la route. Aucun outil n'écrit : le Copilote ne
 * peut ni créer, ni modifier, ni envoyer quoi que ce soit.
 *
 * Chaque outil rend deux choses :
 *  - au modèle, un résultat réduit à ce qui sert à répondre (pas de prix
 *    d'achat, pas de jetons de signature), où chaque élément porte sa clé
 *    (« dossier:12 ») ;
 *  - à la page, les mêmes éléments sous forme de cartes (types.ts), que le
 *    modèle désigne par leur clé au lieu de les recopier.
 */

type Args = Record<string, unknown>;
export type Resultat = { modele: unknown; entites: Entite[] };

const texte = (v: unknown, max = 120) => String(v ?? "").slice(0, max).trim();
const entier = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const nom = (r: { societe?: string | null; prenom?: string | null; nom?: string | null }) => r.societe || [r.prenom, r.nom].filter(Boolean).join(" ");
const TZ = "Europe/Paris";
/** Une date ou un horodatage, en ISO (les dates sans heure sont lues à minuit UTC : voir db.ts). */
const iso = (d: unknown): string | null => (d ? new Date(d as string).toISOString() : null);
const jourIso = (d: unknown): string | null => (d ? new Date(d as string).toISOString().slice(0, 10) : null);
const aujourdhui = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const jourLisible = (d: unknown) =>
  d ? new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(String(d))) : null;
const quandLisible = (d: unknown) =>
  d ? new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(String(d))) : null;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const FORMULES: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium", libre: "Devis libre" };
const formule = (f: unknown) => FORMULES[String(f)] ?? (f ? String(f) : "Devis");

export const DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "chercher_dossiers",
    description:
      "Cherche des dossiers du CRM par nom du client, société, référence (BD-AAAA-NNNN), e-mail ou téléphone, et/ou par étape. Renvoie au plus 10 dossiers, avec leur prochaine étape.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        texte: { type: Type.STRING, description: "Nom, société, référence, e-mail ou téléphone. Facultatif si une étape est donnée." },
        statut: {
          type: Type.STRING,
          description: "Facultatif : prospect (nouveau), visite (visite à faire), devis (devis envoyé), commande (signé), planifie, termine, perdu",
        },
        sans_date: { type: Type.BOOLEAN, description: "Facultatif : seulement les dossiers sans date de déménagement" },
      },
    },
  },
  {
    name: "dossier",
    description:
      "Le détail d'un dossier : client, étape, prochaine étape, trajet, période, volume, commercial, devis, ce qui est dû et encaissé, rendez-vous et dernière activité.",
    parameters: { type: Type.OBJECT, properties: { reference: { type: Type.STRING, description: "Référence BD-AAAA-NNNN ou identifiant numérique" } }, required: ["reference"] },
  },
  {
    name: "agenda",
    description: "Les rendez-vous des commerciaux (visites sur place, visios, tâches) à partir d'aujourd'hui, sur un nombre de jours donné.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        jours: { type: Type.INTEGER, description: "Nombre de jours à partir d'aujourd'hui inclus, de 1 à 14 (7 par défaut). Demain seul : 2, puis ne garder que demain." },
        commercial: { type: Type.STRING, description: "Prénom ou nom du commercial, facultatif" },
      },
    },
  },
  {
    name: "demenagements_a_venir",
    description: "Les déménagements (date de chargement) des prochains jours, avec leur prochaine étape.",
    parameters: { type: Type.OBJECT, properties: { jours: { type: Type.INTEGER, description: "Nombre de jours, de 1 à 31 (7 par défaut)" } } },
  },
  {
    name: "devis_a_relancer",
    description: "Les devis envoyés depuis plus de 2 jours sans réponse, du plus ancien au plus récent.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "chiffres",
    description:
      "Les chiffres de l'agence : CA signé du mois et du mois précédent, CA par mois de l'année, devis envoyés et signés (60 jours), visites de la semaine, arrhes du mois, tunnel commercial (30 jours), répartition des clients (90 jours).",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "demandes_du_site",
    description: "Les demandes reçues par les formulaires du site (les questionnaires), les plus récentes d'abord, avec leur potentiel.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        statut: { type: Type.STRING, description: "Facultatif : new (nouvelle), analyzing (en analyse), qualified, quoted, won, lost, archived" },
        nombre: { type: Type.INTEGER, description: "De 1 à 20 (12 par défaut)" },
        tri: { type: Type.STRING, description: "Facultatif : recentes (par défaut) ou potentiel (les plus prometteuses d'abord)" },
      },
    },
  },
];

/** Ce que la page affiche pendant qu'un outil travaille : « Agenda · 7 jours », « Recherche « Dupuis » »… */
export function libelleAppel(outil: string, a: Args): string {
  switch (outil) {
    case "chercher_dossiers": {
      const t = texte(a.texte, 40);
      const s = texte(a.statut, 20);
      const etape = s && (STATUTS_DOSSIER as readonly string[]).includes(s) ? etapeDossier(s).label.toLowerCase() : "";
      return [t ? `Recherche « ${t} »` : "Dossiers", etape, a.sans_date ? "sans date" : ""].filter(Boolean).join(" · ");
    }
    case "dossier":
      return `Fiche ${texte(a.reference, 30)}`;
    case "agenda": {
      const j = entier(a.jours, 7, 1, 14);
      const c = texte(a.commercial, 30);
      return `Agenda · ${j === 1 ? "aujourd'hui" : `${j} jours`}${c ? ` · ${c}` : ""}`;
    }
    case "demenagements_a_venir":
      return `Déménagements · ${entier(a.jours, 7, 1, 31)} jours`;
    case "devis_a_relancer":
      return "Devis sans réponse";
    case "chiffres":
      return "Chiffres de l'agence";
    case "demandes_du_site": {
      const s = texte(a.statut, 20);
      const libelles: Record<string, string> = { new: "nouvelles", analyzing: "en analyse", qualified: "qualifiées", lost: "perdues", archived: "archivées" };
      return ["Demandes du site", libelles[s] ?? "", a.tri === "potentiel" ? "par potentiel" : ""].filter(Boolean).join(" · ");
    }
    default:
      return outil;
  }
}

/* ───────── La prochaine étape d'un ou plusieurs dossiers ───────── */

/*
 * Les faits du parcours (src/crm/parcours/etapes.ts), lus en une requête sur
 * les tables que le Copilote lit déjà (devis, paiements, rendez-vous, lettres
 * de voiture) ; le reste à payer vient de la vue des soldes, comme partout
 * dans le CRM. L'espace client n'est pas lu : l'étape « avis » n'est pas proposée.
 */
const FAITS = `select d.id, d.statut, c.type, d.cree_le, d.request_id, d.date_chargement, d.date_livraison,
    (select max(debut) from rendez_vous where dossier_id=d.id and type in ('phys','visio') and debut <= now()) as visite_faite,
    (select json_build_object('debut', r.debut, 'type', r.type, 'par', u.nom) from rendez_vous r join utilisateurs u on u.id=r.commercial_id
       where r.dossier_id=d.id and r.type in ('phys','visio') and r.debut > now() order by r.debut limit 1) as visite_prevue,
    (select min(envoye_le) from devis where dossier_id=d.id) as premier_envoi,
    (select count(*) from devis where dossier_id=d.id and statut='brouillon')::int as brouillons,
    (select count(*) from devis where dossier_id=d.id and envoye_le is not null and statut<>'signe')::int as envoyes,
    (select json_build_object('le',signe_le,'numero',numero,'formule',formule,'montant',montant::float8) from devis
       where dossier_id=d.id and statut='signe' limit 1) as signe,
    (select json_build_object('n',count(*),'premier',min(recu_le),'total',coalesce(sum(montant),0)::float8) from paiements where dossier_id=d.id) as paiements,
    (select json_build_object('n',count(*),'livrees',count(*) filter (where statut='livree')) from lettres_voiture where dossier_id=d.id) as lettres
  from dossiers d join clients c on c.id=d.client_id where d.id = any($1::int[])`;

async function prochainesEtapes(ids: number[]): Promise<Map<number, ProchaineEtape>> {
  const out = new Map<number, ProchaineEtape>();
  if (!ids.length) return out;
  const [lignes, soldes] = await Promise.all([q(FAITS, [ids]), soldesDossiers(ids)]);
  const jour = aujourdhui();
  for (const r of lignes) {
    const prevue = r.visite_prevue as { debut: string; type: string; par: string } | null;
    const signe = r.signe as { le: string | null; numero: string; formule: string; montant: number } | null;
    const faits: Faits = {
      statut: r.statut,
      segment: r.type,
      aujourdhui: jour,
      demande: { le: iso(r.cree_le)!, site: !!r.request_id, source: null },
      qualifieLe: null,
      commercial: null,
      visite: { faite: iso(r.visite_faite), prevue: iso(prevue?.debut), mode: prevue?.type ?? null, par: prevue?.par ?? null },
      devis: { premierEnvoi: iso(r.premier_envoi), brouillons: r.brouillons, envoyes: r.envoyes, signe: signe ? { ...signe, le: iso(signe.le) } : null },
      paiements: r.paiements,
      commandeLe: iso(signe?.le),
      planifieLe: null,
      chargement: iso(r.date_chargement),
      livraison: iso(r.date_livraison),
      lettres: { ...(r.lettres as { n: number; livrees: number }), creeesLe: null },
      factures: { n: 0, payees: 0, premiere: null, derniereReglee: null, total: 0, impaye: 0 },
      sav: { ouverts: 0, clos: 0, le: null },
      avisLe: null,
    };
    const p = prochaineEtape(faits, { id: r.id, reste: Math.max(0, soldes.get(r.id)?.reste ?? 0), espaceId: null });
    const principale = p.actions.find((a) => a.principal) ?? p.actions[0] ?? null;
    out.set(r.id, { titre: p.titre, detail: p.detail, ton: p.ton, action: principale ? { label: principale.label, href: principale.href } : null });
  }
  return out;
}

/** Un dossier d'une liste (listDossiers, déménagements à venir), en carte. */
function carteDossier(d: Row, prochaine: ProchaineEtape | null): EntiteDossier {
  return {
    genre: "dossier",
    cle: `dossier:${d.id}`,
    id: d.id,
    ref: d.ref,
    client: d.client ?? nom(d),
    segment: d.type ?? null,
    statut: d.statut,
    depart: d.depart ?? null,
    arrivee: d.arrivee ?? null,
    chargement: jourIso(d.date_chargement),
    volume: d.volume == null ? null : Number(d.volume),
    commercial: d.commercial ?? null,
    montant: d.montant == null ? null : Number(d.montant),
    prochaine,
  };
}

/** Ce que le modèle lit d'un dossier : l'essentiel, et sa clé. */
const pourModele = (e: EntiteDossier) => ({
  cle: e.cle,
  reference: e.ref,
  client: e.client,
  etape: etapeDossier(e.statut).label,
  depart: e.depart,
  arrivee: e.arrivee,
  chargement: jourLisible(e.chargement),
  volume_m3: e.volume,
  commercial: e.commercial,
  montant_devis: e.montant,
  prochaine_etape: e.prochaine ? `${e.prochaine.titre} : ${e.prochaine.detail}` : null,
});

/* ───────── Les outils ───────── */

export async function executer(nomOutil: string, a: Args): Promise<Resultat> {
  switch (nomOutil) {
    case "chercher_dossiers": {
      const t = texte(a.texte, 80);
      const s = texte(a.statut, 20);
      const statut = (STATUTS_DOSSIER as readonly string[]).includes(s) ? s : null;
      if (!t && !statut && !a.sans_date) return { modele: { erreur: "Donner un nom, une référence ou une étape." }, entites: [] };
      const statuts = statut ? [statut] : undefined;
      let lignes = await listDossiers({ q: t || undefined, statuts });
      // « Quentin Dupuis » : prénom et nom sont deux colonnes. On cherche le mot le plus long, puis on garde ceux qui portent tous les mots.
      const mots = t.split(/\s+/).filter((m) => m.length > 1);
      if (!lignes.length && mots.length > 1) {
        const sans = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const long = [...mots].sort((x, y) => y.length - x.length)[0];
        lignes = (await listDossiers({ q: long, statuts })).filter((d) => {
          const tout = sans([d.prenom, d.nom, d.societe, d.ref].filter(Boolean).join(" "));
          return mots.every((m) => tout.includes(sans(m)));
        });
      }
      if (a.sans_date) lignes = lignes.filter((d) => !d.date_chargement);
      const total = lignes.length;
      lignes = lignes.slice(0, 10);
      const prochaines = await prochainesEtapes(lignes.map((d) => d.id));
      const entites = lignes.map((d) => carteDossier(d, prochaines.get(d.id) ?? null));
      return { modele: { trouves: total, montres: entites.length, dossiers: entites.map(pourModele) }, entites };
    }

    case "dossier": {
      const ref = texte(a.reference, 40);
      const ligne = /^\d+$/.test(ref) ? { id: Number(ref) } : await q1<{ id: number }>("select id from dossiers where ref ilike $1", [ref]);
      const d = ligne ? await getDossier(ligne.id) : null;
      if (!d) return { modele: { erreur: `Aucun dossier « ${ref} ».` }, entites: [] };
      const [prochaines, soldes] = await Promise.all([prochainesEtapes([d.id]), soldesDossiers([d.id])]);
      const solde = soldes.get(d.id);
      const signe = d.devis.find((v) => v.statut === "signe");
      const envoye = [...d.devis].filter((v) => v.envoye_le).sort((x, y) => +new Date(y.envoye_le) - +new Date(x.envoye_le))[0];
      const depart = d.stops.find((s) => s.genre === "depart")?.adresse ?? null;
      const arrivee = [...d.stops].reverse().find((s) => s.genre === "arrivee")?.adresse ?? null;
      const e: EntiteDossier = {
        ...carteDossier({ ...d, depart, arrivee, montant: signe?.montant ?? envoye?.montant ?? null }, prochaines.get(d.id) ?? null),
        fiche: {
          telephone: d.telephone ?? null,
          email: d.email ?? null,
          periode: d.periode ?? null,
          observations: texte(d.observations, 400) || null,
          devis: d.devis.map((v) => ({
            numero: v.numero,
            formule: formule(v.formule),
            montant: Number(v.montant),
            statut: v.statut,
            envoyeLe: iso(v.envoye_le),
            signeLe: iso(v.signe_le),
          })),
          rdv: d.rdvs.map((r) => ({ type: r.type, titre: r.titre, debut: iso(r.debut)!, commercial: r.commercial })),
          argent: { du: solde?.du ?? 0, encaisse: solde?.encaisse ?? 0, reste: Math.max(0, solde?.reste ?? 0) },
          activite: d.activite.slice(0, 4).map((x) => ({ quoi: x.libelle, quand: iso(x.cree_le)!, qui: x.nom ?? null })),
        },
      };
      return {
        modele: {
          ...pourModele(e),
          type_client: d.type,
          periode: d.periode,
          traite_par: d.traite_par,
          observations: e.fiche!.observations,
          trajet: d.stops.map((s) => ({ etape: s.genre, adresse: s.adresse, etage: s.etage, ascenseur: s.ascenseur })),
          devis: e.fiche!.devis.map((v) => ({ numero: v.numero, formule: v.formule, montant_ttc: v.montant, statut: v.statut, envoye_le: jourLisible(v.envoyeLe), signe_le: jourLisible(v.signeLe) })),
          argent: { du: e.fiche!.argent.du, encaisse: e.fiche!.argent.encaisse, reste_a_payer: e.fiche!.argent.reste },
          rendez_vous: e.fiche!.rdv.map((r) => ({ type: r.type, titre: r.titre, quand: quandLisible(r.debut), commercial: r.commercial })),
          activite: d.activite.slice(0, 6).map((x) => ({ quoi: x.libelle, quand: quandLisible(x.cree_le), qui: x.nom })),
        },
        entites: [e],
      };
    }

    case "agenda": {
      const jours = entier(a.jours, 7, 1, 14);
      const com = texte(a.commercial, 40);
      const p: unknown[] = [jours - 1];
      let filtre = "";
      if (com) {
        p.push(`%${com}%`);
        filtre = " and u.nom ilike $2";
      }
      const lignes = await q(
        `select r.id, r.type, r.titre, r.lieu, r.debut, r.duree_min, r.termine, r.dossier_id, d.ref, u.nom as commercial,
           coalesce(c.societe, c.prenom || ' ' || c.nom) as client
         from rendez_vous r join utilisateurs u on u.id = r.commercial_id left join dossiers d on d.id = r.dossier_id left join clients c on c.id = d.client_id
         where (r.debut at time zone 'Europe/Paris')::date between (now() at time zone 'Europe/Paris')::date and (now() at time zone 'Europe/Paris')::date + $1::int${filtre}
         order by r.debut limit 40`,
        p,
      );
      const entites: EntiteRdv[] = lignes.map((r) => ({
        genre: "rdv",
        cle: `rdv:${r.id}`,
        id: r.id,
        type: r.type,
        titre: r.titre ?? "",
        lieu: r.lieu ?? null,
        debut: iso(r.debut)!,
        dureeMin: r.duree_min ?? null,
        termine: !!r.termine,
        commercial: r.commercial,
        dossierId: r.dossier_id ?? null,
        ref: r.ref ?? null,
        client: r.client ?? null,
      }));
      return {
        modele: {
          nombre: entites.length,
          rendez_vous: entites.map((r) => ({
            cle: r.cle,
            type: { phys: "visite sur place", visio: "visite en visio", tache: "tâche", perso: "perso" }[r.type] ?? r.type,
            titre: r.titre,
            quand: quandLisible(r.debut),
            lieu: r.lieu,
            commercial: r.commercial,
            client: r.client,
            reference_dossier: r.ref,
            fait: r.termine,
          })),
        },
        entites,
      };
    }

    case "demenagements_a_venir": {
      const jours = entier(a.jours, 7, 1, 31);
      const lignes = await q(
        `select d.id, d.ref, d.date_chargement, d.volume::float8 as volume, d.statut, c.type, coalesce(c.societe, c.prenom || ' ' || c.nom) as client, cm.nom as commercial,
           (select montant::float8 from devis where dossier_id=d.id and statut in ('signe','envoye') order by case statut when 'signe' then 0 else 1 end, cree_le desc limit 1) as montant,
           (select adresse from etapes_trajet where dossier_id = d.id and genre = 'depart' order by ordre limit 1) as depart,
           (select adresse from etapes_trajet where dossier_id = d.id and genre = 'arrivee' order by ordre desc limit 1) as arrivee
         from dossiers d join clients c on c.id = d.client_id left join utilisateurs cm on cm.id = d.commercial_id
         where d.date_chargement between current_date and current_date + $1::int and d.statut <> 'perdu' order by d.date_chargement, d.id limit 30`,
        [jours],
      );
      const prochaines = await prochainesEtapes(lignes.map((d) => d.id));
      const entites = lignes.map((d) => carteDossier(d, prochaines.get(d.id) ?? null));
      return { modele: { nombre: entites.length, demenagements: entites.map(pourModele) }, entites };
    }

    case "devis_a_relancer": {
      const lignes = await q(`select * from (select distinct on (d.id) v.id, d.id as dossier_id, d.ref, coalesce(c.societe, c.prenom || ' ' || c.nom) as client,
          v.numero, v.formule, v.montant::float8 as montant, v.envoye_le, (current_date - v.envoye_le::date)::int as jours
        from devis v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id
        where v.statut = 'envoye' and d.statut = 'devis' and v.envoye_le < now() - interval '2 days' order by d.id, v.envoye_le) x
        order by jours desc limit 15`);
      const entites: EntiteDevis[] = lignes.map((v) => ({
        genre: "devis",
        cle: `devis:${v.id}`,
        id: v.id,
        dossierId: v.dossier_id,
        ref: v.ref,
        client: v.client,
        numero: v.numero,
        formule: formule(v.formule),
        montant: Number(v.montant),
        envoyeLe: iso(v.envoye_le),
        jours: v.jours,
      }));
      const total = entites.reduce((s, v) => s + v.montant, 0);
      return {
        modele: {
          nombre: entites.length,
          montant_total: total,
          devis: entites.map((v) => ({ cle: v.cle, client: v.client, reference_dossier: v.ref, numero: v.numero, formule: v.formule, montant_ttc: v.montant, jours_sans_reponse: v.jours })),
        },
        entites,
      };
    }

    case "chiffres": {
      const s = await stats();
      const m = new Date().getMonth();
      const mois = MOIS[m];
      const precedent = MOIS[(m + 11) % 12];
      const evolution = s.ca.prec > 0 ? ((s.ca.cur - s.ca.prec) / s.ca.prec) * 100 : null;
      const decides = Number(s.t30.decides) || 0;
      const taux = decides > 0 ? (Number(s.t30.signes) / decides) * 100 : null;
      const totalAnnee = s.serie.reduce((t, x) => t + Number(x.ca), 0);
      const TYPES: Record<string, string> = { particulier: "Particuliers", compte: "Clients compte", militaire: "CIMOB/DICOM", partenaire: "Partenaires", logement_social: "Logements sociaux" };
      const entites: EntiteChiffre[] = [
        {
          genre: "chiffre",
          cle: "chiffre:ca",
          titre: "CA signé",
          sous: `${mois} comparé à ${precedent}`,
          valeurs: [
            { libelle: mois, valeur: s.ca.cur, format: "eur", fort: true },
            { libelle: precedent, valeur: s.ca.prec, format: "eur" },
          ],
          evolution,
        },
        {
          genre: "chiffre",
          cle: "chiffre:ca_annee",
          titre: `CA signé ${s.annee}`,
          sous: "mois par mois, selon le mois du déménagement",
          valeurs: [{ libelle: "Depuis janvier", valeur: totalAnnee, format: "eur", fort: true }],
          serie: MOIS.map((libelle, i) => ({ libelle, valeur: Number(s.serie.find((x) => x.m === i + 1)?.ca ?? 0), courant: i === m })),
        },
        {
          genre: "chiffre",
          cle: "chiffre:devis",
          titre: "Devis",
          sous: "60 derniers jours",
          valeurs: [
            { libelle: "envoyés", valeur: Number(s.t30.envoyes) || 0, format: "nombre" },
            { libelle: "signés", valeur: Number(s.t30.signes) || 0, format: "nombre", fort: true },
            ...(taux != null ? [{ libelle: "taux de signature", valeur: taux, format: "pct" as const }] : []),
          ],
        },
        {
          genre: "chiffre",
          cle: "chiffre:tunnel",
          titre: "Tunnel commercial",
          sous: "30 derniers jours",
          valeurs: [
            { libelle: "visites", valeur: Number(s.tun.visites) || 0, format: "nombre" },
            { libelle: "devis", valeur: Number(s.tun.devis) || 0, format: "nombre" },
            { libelle: "signés", valeur: Number(s.tun.signes) || 0, format: "nombre", fort: true },
            { libelle: "planifiés", valeur: Number(s.tun.planifies) || 0, format: "nombre" },
          ],
        },
        {
          genre: "chiffre",
          cle: "chiffre:visites",
          titre: "Visites de la semaine",
          valeurs: [
            { libelle: "visites", valeur: Number(s.vis.n) || 0, format: "nombre", fort: true },
            { libelle: "sans devis", valeur: Number(s.vis.sans_devis) || 0, format: "nombre" },
          ],
        },
        { genre: "chiffre", cle: "chiffre:arrhes", titre: "Arrhes encaissées", sous: mois, valeurs: [{ libelle: mois, valeur: Number(s.arr) || 0, format: "eur", fort: true }] },
        {
          genre: "chiffre",
          cle: "chiffre:repartition",
          titre: "Nouveaux dossiers par type de client",
          sous: "90 derniers jours",
          valeurs: s.repart.map((r) => ({ libelle: TYPES[r.type] ?? r.type, valeur: r.n, format: "nombre" as const })),
        },
      ];
      return {
        modele: {
          mois_en_cours: mois,
          ca_signe: { cle: "chiffre:ca", mois: s.ca.cur, mois_precedent: s.ca.prec, evolution_pct: evolution == null ? null : Math.round(evolution * 10) / 10 },
          ca_par_mois: { cle: "chiffre:ca_annee", annee: s.annee, total: totalAnnee, mois: s.serie.map((x) => ({ mois: MOIS[x.m - 1], ca: x.ca })) },
          devis_60_jours: { cle: "chiffre:devis", ...s.t30, taux_signature_pct: taux == null ? null : Math.round(taux) },
          tunnel_30_jours: { cle: "chiffre:tunnel", ...s.tun },
          visites_semaine: { cle: "chiffre:visites", ...s.vis },
          arrhes_du_mois: { cle: "chiffre:arrhes", montant: s.arr },
          repartition_clients_90_jours: { cle: "chiffre:repartition", types: s.repart },
        },
        entites,
      };
    }

    case "demandes_du_site": {
      const statut = texte(a.statut, 20);
      const n = entier(a.nombre, 12, 1, 20);
      const toutes = await listRequests();
      let lignes = toutes.filter((r) => !statut || r.status === statut);
      if (a.tri === "potentiel") lignes = [...lignes].filter((r) => r.score_potentiel != null).sort((x, y) => (y.score_potentiel ?? 0) - (x.score_potentiel ?? 0));
      const entites: EntiteDemande[] = lignes.slice(0, n).map((r) => ({
        genre: "demande",
        cle: `demande:${r.id}`,
        id: r.id,
        client: r.client_nom || r.societe || "Client sans nom",
        etape: etapeDemande(r.status, !!r.completion_token),
        recueLe: r.created_at,
        depart: r.depart_ville,
        arrivee: r.arrivee_ville,
        volume: r.volume_m3 == null ? null : Number(r.volume_m3),
        dateSouhaitee: r.date_souhaitee,
        source: r.source,
        potentiel: r.score_potentiel,
        estimation: r.estimation_prix == null ? null : Number(r.estimation_prix),
      }));
      return {
        modele: {
          trouvees: lignes.length,
          demandes: entites.map((r) => ({
            cle: r.cle,
            client: r.client,
            etape: ETAPE_DEMANDE[r.etape].label,
            recue_le: quandLisible(r.recueLe),
            depart: r.depart,
            arrivee: r.arrivee,
            volume_m3: r.volume,
            date_souhaitee: jourLisible(r.dateSouhaitee),
            source: r.source === "email" ? "e-mail" : "formulaire",
            potentiel_sur_100: r.potentiel,
            estimation: r.estimation,
          })),
        },
        entites,
      };
    }

    default:
      return { modele: { erreur: `Outil inconnu : ${nomOutil}` }, entites: [] };
  }
}

/** La colonne d'une demande dans Demandes (src/crm/demandes/etapes.ts), avec ce que la liste du site en sait. */
function etapeDemande(statut: string, lienEnAttente: boolean): CleEtapeDemande {
  if (statut === "lost") return "perdue";
  if (statut === "archived") return "archivee";
  if (lienEnAttente) return "incomplete";
  if (statut === "new") return "nouvelle";
  if (statut === "analyzing") return "analyse";
  return "qualifiee";
}
