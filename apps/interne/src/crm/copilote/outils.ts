import "server-only";
import { Type, type FunctionDeclaration } from "@google/genai";
import { q, q1 } from "@/crm/lib/db";
import { getDossier, listDossiers, stats } from "@/crm/lib/data";
import { listRequests } from "@/lib/requests";

/*
 * Les outils du Copilote : des LECTURES du CRM, rien d'autre. Le modèle choisit
 * l'outil et ses paramètres ; le serveur l'exécute ici, avec la session de
 * l'équipe déjà vérifiée par la route. Aucun outil n'écrit : le Copilote ne
 * peut ni créer, ni modifier, ni envoyer quoi que ce soit.
 *
 * Chaque résultat est réduit à ce qui sert à répondre (pas de prix d'achat,
 * pas de jetons de signature), et borné en taille.
 */

type Args = Record<string, unknown>;
const texte = (v: unknown, max = 120) => String(v ?? "").slice(0, max).trim();
const entier = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const nom = (r: { societe?: string | null; prenom?: string | null; nom?: string | null }) => r.societe || [r.prenom, r.nom].filter(Boolean).join(" ");
const jour = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : null);

export const DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "chercher_dossiers",
    description: "Cherche des dossiers du CRM par nom du client, société ou référence (BD-AAAA-NNNN). Renvoie au plus 8 dossiers.",
    parameters: { type: Type.OBJECT, properties: { texte: { type: Type.STRING, description: "Nom, société ou référence" } }, required: ["texte"] },
  },
  {
    name: "dossier",
    description: "Le détail d'un dossier : client, statut, trajet, période, volume, commercial, devis, factures, paiements, rendez-vous et dernière activité.",
    parameters: { type: Type.OBJECT, properties: { reference: { type: Type.STRING, description: "Référence BD-AAAA-NNNN ou identifiant numérique" } }, required: ["reference"] },
  },
  {
    name: "agenda",
    description: "Les rendez-vous des commerciaux (visites, visios, tâches) à partir d'aujourd'hui, sur un nombre de jours donné.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        jours: { type: Type.INTEGER, description: "Nombre de jours, de 1 à 14 (7 par défaut)" },
        commercial: { type: Type.STRING, description: "Prénom ou nom du commercial, facultatif" },
      },
    },
  },
  {
    name: "demenagements_a_venir",
    description: "Les déménagements (date de chargement) des prochains jours.",
    parameters: { type: Type.OBJECT, properties: { jours: { type: Type.INTEGER, description: "Nombre de jours, de 1 à 31 (7 par défaut)" } } },
  },
  {
    name: "devis_a_relancer",
    description: "Les devis envoyés depuis plus de 2 jours sans réponse.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "chiffres",
    description: "Les chiffres de l'agence : CA signé du mois et du mois précédent, CA par mois de l'année, devis envoyés et signés (60 jours), visites de la semaine, arrhes du mois, tunnel commercial (30 jours), répartition des clients.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "demandes_du_site",
    description: "Les demandes reçues par les formulaires du site (les questionnaires), les plus récentes d'abord.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        statut: { type: Type.STRING, description: "Facultatif : new, analyzing, qualified, quoted, won, lost, archived" },
        nombre: { type: Type.INTEGER, description: "De 1 à 20 (10 par défaut)" },
      },
    },
  },
];

export async function executer(nomOutil: string, a: Args): Promise<unknown> {
  switch (nomOutil) {
    case "chercher_dossiers": {
      const lignes = await listDossiers({ q: texte(a.texte, 80) });
      return lignes.slice(0, 8).map((d) => ({
        id: d.id, reference: d.ref, client: nom(d), type: d.type, statut: d.statut, depart: d.depart, arrivee: d.arrivee,
        volume_m3: d.volume, periode: d.periode, chargement: jour(d.date_chargement), commercial: d.commercial, montant_devis: d.montant,
      }));
    }
    case "dossier": {
      const ref = texte(a.reference, 40);
      const ligne = /^\d+$/.test(ref) ? { id: Number(ref) } : await q1<{ id: number }>("select id from dossiers where ref ilike $1", [ref]);
      const d = ligne ? await getDossier(ligne.id) : null;
      if (!d) return { erreur: `Aucun dossier « ${ref} ».` };
      return {
        id: d.id, reference: d.ref, client: nom(d), type: d.type, email: d.email, telephone: d.telephone, statut: d.statut,
        periode: d.periode, chargement: jour(d.date_chargement), volume_m3: d.volume, commercial: d.commercial, traite_par: d.traite_par,
        observations: texte(d.observations, 600) || null,
        trajet: d.stops.map((s) => ({ etape: s.genre, adresse: s.adresse, etage: s.etage, ascenseur: s.ascenseur })),
        devis: d.devis.map((v) => ({ numero: v.numero, formule: v.formule, montant_ttc: v.montant, statut: v.statut, envoye_le: jour(v.envoye_le), signe_le: jour(v.signe_le) })),
        factures: d.factures.map((f) => ({ numero: f.numero, objet: f.objet, montant: f.montant, statut: f.statut, emise_le: jour(f.emise_le) })),
        paiements: d.paiements.map((p) => ({ libelle: p.libelle, montant: p.montant, recu_le: jour(p.recu_le) })),
        rendez_vous: d.rdvs.map((r) => ({ type: r.type, titre: r.titre, debut: r.debut, commercial: r.commercial })),
        activite: d.activite.slice(0, 6).map((x) => ({ quoi: x.libelle, quand: x.cree_le, qui: x.nom })),
      };
    }
    case "agenda": {
      const jours = entier(a.jours, 7, 1, 14);
      const com = texte(a.commercial, 40);
      const p: unknown[] = [jours - 1];
      let filtre = "";
      if (com) { p.push(`%${com}%`); filtre = " and u.nom ilike $2"; }
      return q(`select r.type, r.titre, r.lieu, r.debut, r.duree_min, r.termine, r.dossier_id, d.ref as reference_dossier, u.nom as commercial
        from rendez_vous r join utilisateurs u on u.id = r.commercial_id left join dossiers d on d.id = r.dossier_id
        where (r.debut at time zone 'Europe/Paris')::date between (now() at time zone 'Europe/Paris')::date and (now() at time zone 'Europe/Paris')::date + $1::int${filtre}
        order by r.debut limit 40`, p);
    }
    case "demenagements_a_venir": {
      const jours = entier(a.jours, 7, 1, 31);
      return q(`select d.id, d.ref as reference, d.date_chargement, d.volume::float8 as volume_m3, d.statut, coalesce(c.societe, c.prenom || ' ' || c.nom) as client,
          (select adresse from etapes_trajet where dossier_id = d.id and genre = 'depart' order by ordre limit 1) as depart,
          (select adresse from etapes_trajet where dossier_id = d.id and genre = 'arrivee' order by ordre desc limit 1) as arrivee
        from dossiers d join clients c on c.id = d.client_id
        where d.date_chargement between current_date and current_date + $1::int and d.statut <> 'perdu' order by d.date_chargement limit 30`, [jours]);
    }
    case "devis_a_relancer":
      return q(`select * from (select distinct on (d.id) d.id, d.ref as reference, coalesce(c.societe, c.prenom || ' ' || c.nom) as client,
          v.numero as devis, v.formule, v.montant::float8 as montant_ttc, (current_date - v.envoye_le::date)::int as jours_sans_reponse
        from devis v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id
        where v.statut = 'envoye' and d.statut = 'devis' and v.envoye_le < now() - interval '2 days' order by d.id, v.envoye_le) x
        order by jours_sans_reponse desc limit 15`);
    case "chiffres": {
      const s = await stats();
      return {
        annee: s.annee, ca_signe_mois: s.ca.cur, ca_signe_mois_precedent: s.ca.prec, ca_par_mois: s.serie,
        devis_60_jours: s.t30, visites_semaine: s.vis, arrhes_du_mois: s.arr, tunnel_30_jours: s.tun, repartition_clients_90_jours: s.repart,
      };
    }
    case "demandes_du_site": {
      const statut = texte(a.statut, 20);
      const n = entier(a.nombre, 10, 1, 20);
      const toutes = await listRequests();
      return toutes.filter((r) => !statut || r.status === statut).slice(0, n).map((r) => ({
        id: r.id, client: r.client_nom, statut: r.status, recue_le: r.created_at, depart: r.depart_ville, arrivee: r.arrivee_ville,
        volume_m3: r.volume_m3, date_souhaitee: r.date_souhaitee, source: r.source,
      }));
    }
    default:
      return { erreur: `Outil inconnu : ${nomOutil}` };
  }
}
