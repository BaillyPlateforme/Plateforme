import "server-only";
import { listAlerts } from "@/lib/alerts";
import { modeleEffectif } from "@/lib/email-defauts";
import { eventLabel, TEMPLATE_BLOCS, TEMPLATE_VARIABLES } from "@/lib/messaging";
import { listTemplates } from "@/lib/templates";
import { q } from "@/crm/lib/db";
import { defRelance, reglesRelances } from "@/crm/relances/moteur";
import { delaiEnClair } from "@/crm/relances/regles";
import { CATALOGUE, ETAPES, lignesCatalogue, type Etape } from "./catalogue";

/*
 * Ce que montre « Courriers et SMS » : une carte par message, quelle que soit
 * la table qui porte son texte. Les cartes du CRM et de l'espace client
 * viennent du catalogue (crm.modeles_messages) ; celles des questionnaires,
 * de leurs règles et de leurs modèles (public.alerts, message_templates), lus
 * tels quels.
 */

export interface CarteVue {
  id: string;
  source: "crm" | "questionnaires";
  cle: string | null;
  alerteId: string | null;
  modeleId: string | null;
  titre: string;
  etape: Etape;
  canal: "email" | "sms";
  declencheur: string;
  delai: string | null;
  destinataire: string;
  actif: boolean;
  verrouillee: string | null;
  aValider: boolean;
  aBrancher: boolean;
  texteCode: boolean;
  /** Le nom du modèle, tel qu'il figure au journal. */
  modele: string;
  objet: string | null;
  corps: string;
  /** Les jetons insérables : {client} pour le CRM, {{client_nom}} pour les questionnaires. */
  variables: { jeton: string; libelle: string }[];
  envois: number;
  /** Les messages passés par la carte sans partir (journalisés, bloqués, fictifs…). */
  retenus: number;
  majLe: string | null;
}

const LIBELLES_VARIABLES: Record<string, string> = {
  client: "Client", commercial: "Commercial", date: "Date", heure: "Heure", ref: "Référence du dossier", montant: "Montant",
  salutation: "Madame / Monsieur Nom", document: "Document", nb: "Nombre de cartons", jour: "Jour", debut: "Début du créneau", fin: "Fin du créneau",
  adresse: "Adresse", contact: "Personne présente", telephone: "Téléphone du conseiller", prenom: "Prénom", libelle: "Objet du paiement",
  reference: "Référence de la transaction", numero: "Numéro de déclaration", objets: "Objets abîmés", trajet: "Trajet", pieces: "Pièces manquantes",
};

function etapeQuestionnaire(event: string): Etape {
  return event.startsWith("devis") ? "devis" : "demande";
}

export async function cartesMessages(): Promise<{ cartes: CarteVue[]; etapes: typeof ETAPES }> {
  const [lignes, compte, regles, alertes, modeles, historique] = await Promise.all([
    lignesCatalogue(),
    q<{ modele: string; canal: string; envoyes: number; total: number }>(
      "select modele, canal, count(*) filter (where statut = 'envoye')::int as envoyes, count(*)::int as total from public.envois where modele is not null group by modele, canal",
    ).catch(() => []),
    reglesRelances(),
    listAlerts().catch(() => []),
    listTemplates().catch(() => []),
    // Les questionnaires gardent leur propre historique, plus ancien que le journal des envois.
    q<{ template: string; envoyes: number; total: number }>(
      "select template, count(*) filter (where status = 'envoye')::int as envoyes, count(*)::int as total from public.emails where template like 'Alerte : %' group by template",
    ).catch(() => []),
  ]);

  const compter = (noms: string[], canal: string) => {
    const l = compte.filter((c) => noms.includes(c.modele) && c.canal === canal);
    return { envois: l.reduce((n, c) => n + c.envoyes, 0), retenus: l.reduce((n, c) => n + c.total - c.envoyes, 0) };
  };

  const cartes: CarteVue[] = CATALOGUE.map((e) => {
    const l = lignes.get(e.cle);
    const regle = e.regle ? regles.get(e.regle as never) : undefined;
    const def = e.regle ? defRelance(e.regle) : null;
    const delai = regle && def
      ? `${delaiEnClair(def, regle)}${regle.actif ? (regle.canaux.includes(e.canal) ? "" : ` · canal non retenu par la règle`) : " · règle désactivée"}`
      : (e.delai ?? null);
    const noms = [...e.journal, ...(l?.nom ? [l.nom] : [])];
    return {
      id: `crm:${e.cle}`, source: "crm", cle: e.cle, alerteId: null, modeleId: null,
      titre: e.titre, etape: e.etape, canal: e.canal, declencheur: e.declencheur, delai,
      destinataire: "Au client",
      actif: e.verrouillee ? true : (l?.actif ?? false),
      verrouillee: e.verrouillee ?? null,
      aValider: !e.texteCode && (!!l?.a_valider || !l?.corps.trim()),
      aBrancher: !!e.aBrancher, texteCode: !!e.texteCode,
      modele: l?.nom ?? e.titre, objet: l?.objet ?? null, corps: l?.corps ?? "",
      variables: e.variables.map((v) => ({ jeton: `{${v}}`, libelle: LIBELLES_VARIABLES[v] ?? v })),
      ...compter(noms, e.canal),
      majLe: l?.maj_le ?? null,
    };
  });

  for (const a of alertes) {
    const t = modeles.find((m) => m.id === a.template_id);
    const effectif = t ? modeleEffectif(t) : null;
    const h = historique.find((x) => x.template === `Alerte : ${a.name}`);
    const conditions = [
      a.montant_min != null ? `à partir de ${a.montant_min} €` : null,
      a.condition_champ ? `si le champ « ${a.condition_champ} » manque` : null,
      a.condition_source ? `demandes venues ${a.condition_source === "email" ? "par e-mail" : "du formulaire"}` : null,
    ].filter(Boolean);
    cartes.push({
      id: `q:${a.id}`, source: "questionnaires", cle: null, alerteId: a.id, modeleId: t?.id ?? null,
      titre: a.name, etape: etapeQuestionnaire(a.event), canal: a.channel,
      declencheur: `Questionnaires du site · ${eventLabel(a.event)}${conditions.length ? ` (${conditions.join(", ")})` : ""}.`,
      delai: a.event === "manual" ? null : "Aussitôt",
      destinataire: a.destinataire === "custom" ? `À ${a.destinataire_custom ?? "l'équipe"}` : "Au client",
      actif: a.active && !!t?.active, verrouillee: null, aValider: !t, aBrancher: false, texteCode: false,
      modele: t?.name ?? "Sans modèle", objet: effectif?.sujet ?? null, corps: effectif?.contenu ?? "",
      variables: [
        ...TEMPLATE_VARIABLES.map((v) => ({ jeton: v.token, libelle: v.label })),
        ...(a.channel === "email" ? TEMPLATE_BLOCS.map((b) => ({ jeton: b.token, libelle: `Bloc : ${b.label}` })) : []),
      ],
      envois: h?.envoyes ?? 0, retenus: (h?.total ?? 0) - (h?.envoyes ?? 0),
      majLe: t?.updated_at ?? null,
    });
  }
  const ordre = new Map(ETAPES.map((e, i) => [e.cle, i]));
  cartes.sort((a, b) => (ordre.get(a.etape) ?? 0) - (ordre.get(b.etape) ?? 0));
  return { cartes, etapes: ETAPES };
}
