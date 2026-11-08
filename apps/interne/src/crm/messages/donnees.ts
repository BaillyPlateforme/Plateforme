import "server-only";
import { listAlerts } from "@/lib/alerts";
import { modeleEffectif } from "@/lib/email-defauts";
import { eventLabel, pieceJointeDuModele, TEMPLATE_BLOCS, TEMPLATE_VARIABLES, type AlertRow, type MessageTemplate, type RuleKind } from "@/lib/messaging";
import { listTemplates } from "@/lib/templates";
import { q } from "@/crm/lib/db";
import { defRelance, reglesRelances } from "@/crm/relances/moteur";
import { delaiEnClair } from "@/crm/relances/regles";
import { TEXTES_PROPOSES } from "@/crm/relances/courrier";
import { CATALOGUE, ETAPES, lignesCatalogue, type Etape } from "./catalogue";

/*
 * Ce que montre « Courriers et SMS » : une carte par message, quelle que soit
 * la table qui porte son texte. Les cartes du CRM et de l'espace client
 * viennent du catalogue (crm.modeles_messages) ; celles des questionnaires,
 * de leurs règles et de leurs modèles (public.alerts, message_templates), lus
 * tels quels : une carte par règle, et une par modèle qu'aucune règle
 * n'envoie (depuis le 08/11/2026, l'ancienne messagerie ayant rejoint cette
 * page, chaque modèle a sa carte).
 */

/** Un modèle des questionnaires, tel que l'éditeur le reprend (texte effectif : celui qui part). */
export interface GabaritVue {
  id: string;
  name: string;
  channel: "email" | "sms";
  event: string;
  sujet: string;
  contenu: string;
  pieceJointe: "" | "estimation";
  active: boolean;
}

/** Une règle des questionnaires : quand, à qui et sous quelles conditions un modèle part. */
export interface RegleVue {
  id: string;
  name: string;
  kind: RuleKind;
  event: string;
  montant_min: number | null;
  condition_champ: string | null;
  condition_source: string | null;
  destinataire: "client" | "custom";
  destinataire_custom: string | null;
  active: boolean;
}

export interface CarteVue {
  id: string;
  source: "crm" | "questionnaires";
  cle: string | null;
  alerteId: string | null;
  modeleId: string | null;
  /** Cartes des questionnaires : la règle (aucune pour un modèle qu'aucune règle n'envoie) et le modèle. */
  regle: RegleVue | null;
  gabarit: GabaritVue | null;
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
  /** Un texte proposé par la plateforme, à valider, pour une carte encore vide (cartes des relances). */
  propose?: { objet: string | null; corps: string } | null;
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
  conseiller: "Qui a répondu (prénom et nom)", dossier: "Référence du dossier",
  periode: "Période du déménagement (« en mars 2027 », « le 12 mars 2027 »)", email: "Adresse de connexion du client",
  elements: "Ce que la relance demande, tel que coché à l'envoi : seule sur son paragraphe, la liste mise en page (sinon posée avant la signature) ; dans une phrase ou un SMS, la liste courte",
};

function etapeQuestionnaire(event: string): Etape {
  return event.startsWith("devis") ? "devis" : "demande";
}

function versGabarit(t: MessageTemplate): GabaritVue {
  const e = modeleEffectif(t);
  return {
    id: t.id, name: t.name, channel: t.channel, event: t.event, sujet: e.sujet ?? "", contenu: e.contenu,
    // Celle qui s'applique vraiment : sans réglage, un message qui montre l'estimation la joint.
    pieceJointe: (pieceJointeDuModele(e) ?? "") as "" | "estimation",
    active: t.active,
  };
}

function versRegle(a: AlertRow): RegleVue {
  return {
    id: a.id, name: a.name, kind: a.kind, event: a.event, montant_min: a.montant_min == null ? null : Number(a.montant_min),
    condition_champ: a.condition_champ, condition_source: a.condition_source, destinataire: a.destinataire,
    destinataire_custom: a.destinataire_custom, active: a.active,
  };
}

/** Les jetons d'un modèle des questionnaires : ses variables, et ses blocs pour un e-mail. */
function variablesQuestionnaire(canal: "email" | "sms") {
  return [
    ...TEMPLATE_VARIABLES.map((v) => ({ jeton: v.token, libelle: v.label })),
    ...(canal === "email" ? TEMPLATE_BLOCS.map((b) => ({ jeton: b.token, libelle: `Bloc : ${b.label} — ${b.aide}` })) : []),
  ];
}

export async function cartesMessages(): Promise<{ cartes: CarteVue[]; etapes: typeof ETAPES; modeles: GabaritVue[] }> {
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
      id: `crm:${e.cle}`, source: "crm", cle: e.cle, alerteId: null, modeleId: null, regle: null, gabarit: null,
      titre: e.titre, etape: e.etape, canal: e.canal, declencheur: e.declencheur, delai,
      destinataire: "Au client",
      actif: e.verrouillee ? true : (l?.actif ?? false),
      verrouillee: e.verrouillee ?? null,
      aValider: !e.texteCode && (!!l?.a_valider || !l?.corps.trim()),
      aBrancher: !!e.aBrancher, texteCode: !!e.texteCode,
      modele: l?.nom ?? e.titre, objet: l?.objet ?? null, corps: l?.corps ?? "",
      variables: e.variables.map((v) => ({ jeton: `{${v}}`, libelle: LIBELLES_VARIABLES[v] ?? v })),
      propose: l?.corps.trim() ? null : (TEXTES_PROPOSES[e.cle] ?? null),
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
      regle: versRegle(a), gabarit: t ? versGabarit(t) : null,
      titre: a.name, etape: etapeQuestionnaire(a.event), canal: a.channel,
      declencheur: `Questionnaires du site · ${eventLabel(a.event)}${conditions.length ? ` (${conditions.join(", ")})` : ""}.`,
      delai: a.event === "manual" ? null : "Aussitôt",
      destinataire: a.destinataire === "custom" ? `À ${a.destinataire_custom ?? "l'équipe"}` : "Au client",
      actif: a.active && !!t?.active, verrouillee: null, aValider: !t, aBrancher: false, texteCode: false,
      modele: t?.name ?? "Sans modèle", objet: effectif?.sujet ?? null, corps: effectif?.contenu ?? "",
      variables: variablesQuestionnaire(a.channel),
      envois: h?.envoyes ?? 0, retenus: (h?.total ?? 0) - (h?.envoyes ?? 0),
      majLe: t?.updated_at ?? null,
    });
  }

  // Les modèles qu'aucune règle n'envoie : ils n'avaient de place que dans l'ancienne messagerie.
  for (const t of modeles.filter((m) => !alertes.some((a) => a.template_id === m.id))) {
    const g = versGabarit(t);
    cartes.push({
      id: `m:${t.id}`, source: "questionnaires", cle: null, alerteId: null, modeleId: t.id, regle: null, gabarit: g,
      titre: t.name, etape: etapeQuestionnaire(t.event), canal: t.channel,
      declencheur: `Questionnaires du site · ${eventLabel(t.event)}. Aucune règle ne l'envoie.`,
      delai: null, destinataire: "Sans règle d'envoi",
      actif: t.active, verrouillee: null, aValider: false, aBrancher: false, texteCode: false,
      modele: t.name, objet: g.sujet || null, corps: g.contenu,
      variables: variablesQuestionnaire(t.channel),
      // Sans règle, un modèle ne part qu'à la main : le journal des envois le connaît par son nom.
      ...compter([t.name], t.channel),
      majLe: t.updated_at ?? null,
    });
  }
  const ordre = new Map(ETAPES.map((e, i) => [e.cle, i]));
  cartes.sort((a, b) => (ordre.get(a.etape) ?? 0) - (ordre.get(b.etape) ?? 0));
  return { cartes, etapes: ETAPES, modeles: modeles.map(versGabarit).sort((a, b) => a.name.localeCompare(b.name, "fr")) };
}
