import "server-only";
import { q1 } from "@/crm/lib/db";
import { compterNouvelles } from "@/lib/requests";

/*
 * L'accueil du Copilote : « en ce moment », quelques nombres lus dans le CRM
 * à l'ouverture de la page (lecture seule), chacun relié à la question qui
 * le détaille. Seuls ceux qui ne sont pas nuls sont montrés ; le CA du mois
 * l'est toujours. Chaque question est de celles que les outils savent traiter.
 */

export type Puce = { cle: string; nombre: string; libelle: string; question: string; ton: "indigo" | "violet" | "vert" | "ambre" | "ciel" | "rose" };

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const s = (n: number, mot: string, pluriel = `${mot}s`) => (n > 1 ? pluriel : mot);

export async function apercuCopilote(): Promise<{ puces: Puce[]; clientRecent: string | null }> {
  const [c, nouvelles, recent] = await Promise.all([
    q1<{ relances: number; rdv_jour: number; visites_demain: number; demenagements: number; a_planifier: number; ca: number }>(`select
      (select count(distinct d.id) from devis v join dossiers d on d.id = v.dossier_id
        where v.statut = 'envoye' and d.statut = 'devis' and v.envoye_le < now() - interval '2 days')::int as relances,
      (select count(*) from rendez_vous where type in ('phys','visio','tache')
        and (debut at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date)::int as rdv_jour,
      (select count(*) from rendez_vous where type in ('phys','visio')
        and (debut at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date + 1)::int as visites_demain,
      (select count(*) from dossiers where date_chargement between current_date and current_date + 6 and statut <> 'perdu')::int as demenagements,
      (select count(*) from dossiers where statut = 'commande' and date_chargement is null and archive_le is null)::int as a_planifier,
      (select coalesce(sum(v.montant), 0) from devis v join dossiers d on d.id = v.dossier_id where v.statut = 'signe'
        and coalesce(d.date_chargement, d.mois_ca) >= date_trunc('month', current_date)
        and coalesce(d.date_chargement, d.mois_ca) < date_trunc('month', current_date) + interval '1 month')::float8 as ca`),
    compterNouvelles().catch(() => 0),
    // Le client du prochain déménagement : celui dont on risque de demander des nouvelles.
    q1<{ prenom: string | null; nom: string | null; societe: string | null }>(`select c.prenom, c.nom, c.societe from dossiers d join clients c on c.id = d.client_id
      where d.archive_le is null and d.statut in ('commande', 'planifie') and d.date_chargement >= current_date
      order by d.date_chargement, d.id limit 1`),
  ]);

  // Par ordre d'urgence ; quatre au plus, puis le CA du mois : la rangée tient sur une ligne.
  const puces: Puce[] = [];
  if (c?.relances) puces.push({ cle: "relances", nombre: String(c.relances), libelle: `${s(c.relances, "devis", "devis")} à relancer`, question: "Quels devis dois-je relancer ?", ton: "ambre" });
  if (nouvelles) puces.push({ cle: "nouvelles", nombre: String(nouvelles), libelle: `${s(nouvelles, "nouvelle demande", "nouvelles demandes")} du site`, question: "Les nouvelles demandes du site", ton: "vert" });
  if (c?.rdv_jour) puces.push({ cle: "jour", nombre: String(c.rdv_jour), libelle: `${s(c.rdv_jour, "rendez-vous", "rendez-vous")} aujourd'hui`, question: "Les rendez-vous d'aujourd'hui", ton: "indigo" });
  if (c?.visites_demain) puces.push({ cle: "demain", nombre: String(c.visites_demain), libelle: `${s(c.visites_demain, "visite")} demain`, question: "Les visites de demain", ton: "ciel" });
  if (c?.a_planifier) puces.push({ cle: "planifier", nombre: String(c.a_planifier), libelle: `${s(c.a_planifier, "dossier signé", "dossiers signés")} sans date`, question: "Les dossiers signés qui n'ont pas encore de date de déménagement", ton: "rose" });
  if (c?.demenagements) puces.push({ cle: "demenagements", nombre: String(c.demenagements), libelle: `${s(c.demenagements, "déménagement")} sur 7 jours`, question: "Les déménagements des 7 prochains jours", ton: "violet" });
  puces.splice(4);
  puces.push({ cle: "ca", nombre: eur(c?.ca ?? 0), libelle: `signés en ${MOIS[new Date().getMonth()]}`, question: "Le chiffre d'affaires du mois, comparé au mois dernier", ton: "vert" });

  const clientRecent = recent ? recent.societe || [recent.prenom, recent.nom].filter(Boolean).join(" ") || null : null;
  return { puces, clientRecent };
}
