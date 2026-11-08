import "server-only";
import { versInterne } from "@/lib/adresses";
import { alerterEquipe } from "@/lib/alertes-equipe";
import { adressePublique } from "@/lib/espace-client/config";
import { lireDonnees } from "@/lib/espace-client/depot";
import { lienRegle } from "@/lib/espace-client/outil-metier";
import { snapshotDe } from "@/lib/espace-client/lectures";
import { euros } from "@/lib/espace-client/format";
import { calculerFrise, piecesManquantes } from "@/lib/espace-client/progression";
import { q, q1 } from "@/crm/lib/db";
import { eur, nomClient, TYPES } from "@/crm/lib/format";
import { envoyerCarte, jourParis } from "@/crm/envois";
import { lignesCatalogue, raisonDeNePasEnvoyer, type LigneModele } from "@/crm/messages/catalogue";
import {
  CANAUX, creneauOuvert, defRelance, heureParis, jourPermis, libelleCanal, plus, RELANCES, repereDe,
  defCourrier, type Canal, type Colonne, type DemandeRelance, type ElementRelance, type Regle, type Relance, type RelanceCourrier, type TypeCourrier, type TypeRelance,
} from "./regles";
import { blocRelance, elementsChoisis, surtitreRelance, varsRelance, type LiensRelance } from "./courrier";

export { RELANCES, defRelance };
export type { Colonne, Regle, Relance, TypeRelance };

/*
 * Les relances : ce qu'il faut redemander au client, dossier par dossier, et
 * quand. Elles se CALCULENT à partir des dossiers et de leurs règles — on ne
 * les sème pas : ainsi, une relance disparaît d'elle-même quand son objet est
 * réglé (devis signé, pièce reçue…) ou quand le dossier est perdu ou terminé.
 * Seules les décisions sont gardées (crm.relances) : repoussée, annulée,
 * envoyée.
 *
 * Chaque type a sa règle (crm.relances_regles) : activée ou non ; premier
 * délai, compté depuis un repère (l'envoi du devis, le déménagement…) ;
 * intervalle et nombre ; canaux ; jours et heures d'envoi ; segments exclus.
 * Chaque canal a sa carte dans « Courriers et SMS », dont la relance prend le
 * texte et l'état : un canal dont la carte est désactivée, ou dont le texte
 * reste à valider, ne part pas ; sans aucun canal prêt, la relance est
 * désactivée. Un dossier marqué « ne pas relancer » (crm.relances_exclusions)
 * n'en reçoit aucune.
 *
 * La tâche de la veille envoie celles du jour et celles en retard de trois
 * jours au plus, aux jours et heures permis ; l'équipe peut en envoyer une
 * tout de suite depuis le Kanban.
 *
 * Chaque relance porte aussi ce qu'elle demande, élément par élément
 * (`demande` : les devis envoyés sans réponse, les pièces obligatoires qui
 * manquent, les factures du dossier qui restent à régler, le questionnaire
 * des conditions, l'avis), lu dans les mêmes requêtes que son objet.
 * L'e-mail en pose la liste (courrier.ts) ; l'équipe peut n'en cocher que
 * certains à l'envoi (PanneauEnvoi), la veille les envoie tous.
 */

export async function reglesRelances(): Promise<Map<TypeRelance, Regle>> {
  await q(
    `insert into relances_regles(type, premier_delai_jours, intervalle_jours, nombre_max, repere)
     select * from unnest($1::text[], $2::int[], $3::int[], $4::int[], $5::text[]) on conflict (type) do nothing`,
    [
      RELANCES.map((r) => r.type), RELANCES.map((r) => r.defaut.premier_delai_jours), RELANCES.map((r) => r.defaut.intervalle_jours),
      RELANCES.map((r) => r.defaut.nombre_max), RELANCES.map((r) => r.reperes[0].cle),
    ],
  );
  const rows = await q<Regle>(
    `select type, actif, premier_delai_jours, intervalle_jours, nombre_max, repere, canaux, jours_envoi, heure_debut, heure_fin, segments_exclus,
            maj_le::text, maj_par from relances_regles`,
  );
  const out = new Map<TypeRelance, Regle>();
  for (const r of rows) {
    const def = defRelance(r.type);
    if (!def) continue;
    const canaux = CANAUX.map((c) => c.cle).filter((c) => r.canaux?.includes(c));
    out.set(r.type, {
      ...r,
      repere: repereDe(def, r.repere).cle,
      canaux: canaux.length ? canaux : ["email"],
      jours_envoi: r.jours_envoi?.length ? r.jours_envoi : null,
      segments_exclus: r.segments_exclus ?? [],
    });
  }
  return out;
}

type Candidat = {
  type: TypeRelance;
  objetId: string;
  dossierId: number;
  ref: string;
  client: string;
  segment: string;
  objet: string;
  /** Les dates de repère connues pour cet objet, par clé de repère (AAAA-MM-JJ). */
  dates: Record<string, string | null>;
  /** Déjà réglé (devis signé…) : la suite s'arrête, avec cette raison. */
  regle?: string | null;
  vars?: Record<string, string>;
  /** Ce que la relance demande, élément par élément (l'espace client est rattaché à la fin). */
  demande: Omit<DemandeRelance, "espace">;
  espace?: string | null;
};

const jourFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
/** « 3 novembre » : la date telle que le client la lit. */
const jourClient = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const sansDemande = (avant: string | null = null): Omit<DemandeRelance, "espace"> => ({ elements: [], avant, faits: null });

/** Les objets qui appellent une relance, type par type, avec leurs dates de repère. */
async function candidats(): Promise<Candidat[]> {
  const out: Candidat[] = [];
  const nom = (r: Record<string, unknown>) => nomClient(r as never);
  type Client = { segment: string; nom: string; prenom: string | null; societe: string | null };

  // Devis : un dossier dont un devis est envoyé et qu'aucun devis signé ne clôt. Une suite par dossier.
  type DevisEnAttente = { id: number; numero: string; formule: string; montant: number; envoye_le: string; validite: string | null; token: string | null };
  const [devis, dejaRelances] = await Promise.all([
    q<Client & { id: number; ref: string; statut: string; date_chargement: Date | null; envoye: string; numero: string; signe: boolean; attente: DevisEnAttente[] | null }>(
      `select d.id, d.ref, d.statut, d.date_chargement, c.type as segment, c.nom, c.prenom, c.societe, max(v.envoye_le)::text as envoye,
              string_agg(v.numero, ', ' order by v.numero) as numero, bool_or(v.statut = 'signe') as signe,
              -- Les devis envoyés sans réponse : ce que la relance demande, un par un.
              json_agg(json_build_object('id', v.id, 'numero', v.numero, 'formule', v.formule, 'montant', v.montant::float8,
                       'envoye_le', v.envoye_le, 'validite', v.validite, 'token', v.token) order by v.numero) filter (where v.statut = 'envoye') as attente
         from dossiers d join clients c on c.id = d.client_id join devis v on v.dossier_id = d.id
        where v.envoye_le is not null and v.statut in ('envoye','signe')
        group by d.id, c.type, c.nom, c.prenom, c.societe`,
    ),
    q<{ dossier_id: number }>("select distinct dossier_id from relances where type='devis'"),
  ]);
  const relances = new Set(dejaRelances.map((r) => r.dossier_id));
  for (const d of devis) {
    // Un dossier déjà signé n'entre que s'il a eu des relances : pour les montrer arrêtées.
    if (d.signe && !relances.has(d.id)) continue;
    const envoi = iso(new Date(d.envoye))!;
    out.push({
      type: "devis", objetId: String(d.id), dossierId: d.id, ref: d.ref, client: nom(d), segment: d.segment,
      dates: { envoi_devis: envoi, demenagement: iso(d.date_chargement) },
      objet: `Devis ${d.numero} envoyé le ${jourFr(envoi)}`,
      regle: d.signe ? "Devis signé : relances arrêtées." : ["perdu", "termine"].includes(d.statut) ? `Dossier ${d.statut === "perdu" ? "perdu" : "terminé"}.` : null,
      demande: {
        ...sansDemande(),
        elements: (d.attente ?? []).map((v) => {
          const validite = iso(v.validite);
          return {
            id: `devis:${v.id}`,
            titre: `Devis ${v.numero} · Formule ${v.formule.charAt(0).toUpperCase()}${v.formule.slice(1)}`,
            court: v.numero,
            detail: `Envoyé le ${jourClient(iso(new Date(v.envoye_le))!)}${validite ? `, valable jusqu'au ${jourClient(validite)}` : ""}.`,
            valeur: `${euros(v.montant)} TTC`,
            montant: v.montant,
            jeton: v.token,
          };
        }),
      },
    });
  }

  // Solde : une facture du CRM qui n'est pas réglée (les arrhes passent par les paiements).
  const factures = await q<Client & { id: number; dossier_id: number; ref: string; dstatut: string; numero: string; objet_facture: string | null; total: number; montant: number; emise_le: Date; date_livraison: Date | null; statut: string; dreste: number | null }>(
    // Le montant relancé est le reste à payer réel de la facture (paiements partiels déduits) ; ni avoir ni facture annulée.
    `select f.id, f.dossier_id, d.ref, d.statut as dstatut, d.date_livraison, f.numero, f.objet as objet_facture, f.montant::float8 as total,
            s.reste::float8 as montant, f.emise_le, ds.reste::float8 as dreste,
            case when f.statut = 'annulee' then 'payee' else f.statut end as statut,
            c.type as segment, c.nom, c.prenom, c.societe
       from factures f join factures_soldes s on s.id = f.id join dossiers d on d.id = f.dossier_id join clients c on c.id = d.client_id
       left join dossiers_soldes ds on ds.dossier_id = d.id
      where f.genre <> 'avoir' and (s.reste > 0 or f.id::text in (select split_part(cle, ':', 2) from relances where type='solde'))`,
  );
  // Ce qu'une relance de solde demande : les factures du dossier qui restent à régler, la sienne d'abord.
  const aRegler = (f: (typeof factures)[number]): ElementRelance => ({
    id: `facture:${f.id}`,
    titre: `Facture ${f.numero}${f.objet_facture ? ` · ${f.objet_facture}` : ""}`,
    court: `${f.numero} (${euros(f.montant)})`,
    detail: `Émise le ${jourClient(iso(f.emise_le)!)}${f.montant < f.total - 0.004 ? `, sur un total de ${euros(f.total)}` : ""}.`,
    valeur: euros(f.montant),
    montant: f.montant,
  });
  const ouvertes = factures.filter((f) => f.statut !== "payee" && f.montant > 0.004).sort((a, b) => String(iso(a.emise_le)).localeCompare(String(iso(b.emise_le))) || a.id - b.id);
  for (const f of factures) {
    out.push({
      type: "solde", objetId: String(f.id), dossierId: f.dossier_id, ref: f.ref, client: nom(f), segment: f.segment,
      dates: { facture: iso(f.emise_le), livraison: iso(f.date_livraison) },
      objet: `Facture ${f.numero} · ${eur(f.montant)}`, vars: { montant: eur(f.montant) },
      // Un dossier déjà soldé (règlement saisi sans être affecté à la facture) : le client a payé, on ne le relance pas.
      regle: f.statut === "payee" ? "Facture réglée : relances arrêtées." : f.dstatut === "perdu" ? "Dossier perdu." : f.dreste != null && f.dreste <= 0.004 ? "Dossier soldé : règlement à affecter à la facture, relances arrêtées." : null,
      demande: {
        ...sansDemande(),
        elements: [f, ...ouvertes.filter((x) => x.dossier_id === f.dossier_id && x.id !== f.id)]
          .filter((x) => x.statut !== "payee" && x.montant > 0.004)
          .map(aRegler),
      },
    });
  }

  // Pièces, conditions et avis : l'espace client des dossiers du CRM.
  // L'espace de chaque dossier du CRM, pour les liens des relances (devis et solde compris).
  const espaces = new Map<number, string>();
  try {
    const ec = await lireDonnees();
    const crm = new Map(
      (await q<Client & { id: number; ref: string; statut: string }>(
        "select d.id, d.ref, d.statut, c.type as segment, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id",
      )).map((d) => [d.id, d]),
    );
    for (const dossier of ec.dossiers) {
      if (typeof dossier.crm_dossier_id === "number" && dossier.reference && !espaces.has(dossier.crm_dossier_id)) espaces.set(dossier.crm_dossier_id, dossier.reference);
      const d = typeof dossier.crm_dossier_id === "number" ? crm.get(dossier.crm_dossier_id) : undefined;
      const s = d && snapshotDe(ec, dossier.id);
      if (!d || !s) continue;
      const fini = ["perdu", "termine"].includes(d.statut) || dossier.statut === "termine" ? `Dossier ${d.statut === "perdu" ? "perdu" : "terminé"}.` : null;
      const dates = { demenagement: dossier.periode_debut || null, commande: iso(dossier.commande_le), ouverture_espace: iso(dossier.created_at) };
      const commun = { objetId: dossier.id, dossierId: d.id, ref: d.ref, client: nom(d), segment: d.segment, dates };
      const avant = dossier.periode_debut ? iso(dossier.periode_debut) : null;
      const manquantes = piecesManquantes(s);
      const obligatoires = s.requirements.filter((r) => r.obligatoire).length;
      if (obligatoires) {
        out.push({
          ...commun, type: "pieces",
          objet: manquantes.length ? `${manquantes.length} pièce${manquantes.length > 1 ? "s" : ""} à fournir : ${manquantes.slice(0, 3).map((r) => r.libelle).join(", ")}${manquantes.length > 3 ? "…" : ""}` : "Toutes les pièces sont reçues",
          regle: !manquantes.length ? "Pièces reçues : relances arrêtées." : fini, vars: { pieces: manquantes.map((r) => r.libelle).join(", ") },
          // Chaque pièce obligatoire qui manque, avec la description que voit le client dans son espace.
          demande: {
            elements: manquantes.map((r) => ({
              id: `piece:${r.id}`, titre: r.libelle, court: r.libelle, valeur: null,
              detail: r.description?.trim() || "",
            })),
            avant,
            faits: { n: obligatoires - manquantes.length, sur: obligatoires },
          },
        });
      }
      const conditions = calculerFrise(s).find((e) => e.cle === "conditions");
      if (conditions) {
        // Le questionnaire se certifie d'un bloc : un seul élément, qui dit où il en est.
        const commence = !!s.conditions && !s.conditions.valide_at;
        out.push({
          ...commun, type: "conditions",
          objet: conditions.statut === "fait" ? "Conditions de livraison validées" : "Conditions de livraison à valider",
          regle: conditions.statut === "fait" ? "Conditions validées : relances arrêtées." : fini,
          demande: {
            ...sansDemande(avant),
            elements: [{
              id: "conditions", titre: "Questionnaire des conditions de livraison", court: "vos conditions de livraison", valeur: null,
              detail: commence ? "Vous l'avez commencé : il reste à le vérifier et à le certifier." : "Étage, ascenseur, stationnement, accès du camion.",
            }],
          },
        });
      }
      if (dossier.avis_demande_le) {
        out.push({
          ...commun, type: "avis", dates: { demande_avis: iso(dossier.avis_demande_le), fin_chantier: iso(dossier.termine_le) },
          objet: `Avis demandé le ${jourFr(iso(dossier.avis_demande_le)!)}`, regle: null,
          demande: {
            ...sansDemande(),
            elements: [{ id: "avis", titre: "Votre avis sur votre déménagement", court: "votre avis", valeur: null, detail: "Il ne vous prendra qu'une minute." }],
          },
        });
      }
    }
  } catch (e) {
    console.error("Relances : espace client illisible, pièces et conditions ignorées", e instanceof Error ? e.message : e);
  }
  return out.map((c) => ({ ...c, espace: espaces.get(c.dossierId) ?? null }));
}

interface Decision {
  cle: string;
  statut: "reportee" | "annulee" | "envoyee";
  report_au: Date | null;
  envoyee_le: string | null;
  envoi_statut: string | null;
  envoi_motif: string | null;
  canaux: Canal[] | null;
}

/** Ce que lit le moteur, une fois : le calcul se rejoue ensuite autant qu'on veut (simulation). */
interface Entrees {
  regles: Map<TypeRelance, Regle>;
  cartes: Map<string, LigneModele>;
  liste: Candidat[];
  decisions: Decision[];
  exclusions: Set<string>;
}

async function charger(): Promise<Entrees> {
  const [regles, cartes, liste, decisions, exclusions] = await Promise.all([
    reglesRelances(),
    lignesCatalogue(),
    candidats(),
    q<Decision>("select cle, statut, report_au, envoyee_le::text, envoi_statut, envoi_motif, canaux from relances"),
    q<{ dossier_id: number; type: string }>("select dossier_id, type from relances_exclusions"),
  ]);
  return { regles, cartes, liste, decisions, exclusions: new Set(exclusions.map((e) => `${e.dossier_id}:${e.type}`)) };
}

/** Pourquoi aucun canal ne peut partir, d'après les cartes de « Courriers et SMS ». */
function motifCartes(def: NonNullable<ReturnType<typeof defRelance>>, canaux: Canal[], cartes: Map<string, LigneModele>) {
  const etat = (k: Canal) => {
    const c = cartes.get(def.cartes[k]) ?? null;
    return c?.corps.trim() ? "carte désactivée" : "texte à valider";
  };
  if (canaux.length === 1) {
    const c = cartes.get(def.cartes[canaux[0]]) ?? null;
    return c?.corps.trim() ? "Carte désactivée dans « Courriers et SMS »." : "Texte de la carte à valider dans « Courriers et SMS ».";
  }
  return `Aucun canal prêt dans « Courriers et SMS » : ${canaux.map((k) => `${libelleCanal(k).toLowerCase()} (${etat(k)})`).join(", ")}.`;
}

export interface Calcul {
  relances: Relance[];
  /** Les objets ignorés faute de date pour le repère choisi, par type. */
  sansDate: Map<TypeRelance, number>;
}

/*
 * Une relance envoyée à la main (Kanban, fiche de l'espace client) prend le
 * rang suivant de sa suite, comme si la veille l'avait envoyée : la suite
 * continue ensuite à son calendrier, mais la relance suivante ne part jamais
 * moins de `intervalle_jours` après la dernière réellement partie — un envoi
 * à la main en avance ne fait pas recevoir deux relances coup sur coup.
 *
 * Quand la suite n'a plus de rang à offrir (toutes parties, ou la suivante
 * tomberait après le déménagement, ou le repère n'a pas de date), la fiche de
 * l'espace client peut quand même relancer : c'est une relance « hors suite »
 * (option `manuelles`), qui prend le rang suivant — au-delà du nombre de la
 * règle s'il le faut (3/2) — et compte comme les autres. La veille n'en
 * produit jamais.
 */
export interface OptionsRanger {
  /** Proposer aussi, pour chaque objet encore à relancer, une relance à la main hors du calendrier de la veille. */
  manuelles?: boolean;
}

/** Range les relances, à partir des entrées lues, pour un jour donné. Sans effet de bord. */
function ranger(e: Entrees, aujourdhui: string, regles = e.regles, o: OptionsRanger = {}): Calcul {
  const parCle = new Map(e.decisions.map((d) => [d.cle, d]));
  const envoyeesParObjet = new Map<string, Decision[]>();
  for (const d of e.decisions) {
    if (d.statut !== "envoyee") continue;
    const objet = d.cle.split(":").slice(0, 2).join(":");
    envoyeesParObjet.set(objet, [...(envoyeesParObjet.get(objet) ?? []), d]);
  }
  const out: Relance[] = [];
  const sansDate = new Map<TypeRelance, number>();
  const limite = plus(aujourdhui, -60);

  for (const c of e.liste) {
    const def = defRelance(c.type)!;
    const regle = regles.get(c.type)!;
    const repere = repereDe(def, regle.repere);
    const base = c.dates[repere.cle] ?? null;
    const sens = repere.sens === "apres" ? 1 : -1;
    const commun = {
      type: c.type, libelle: def.libelle, dossierId: c.dossierId, ref: c.ref, client: c.client, segment: c.segment, objet: c.objet, sur: regle.nombre_max, vars: c.vars ?? {},
      demande: { ...c.demande, espace: c.espace ?? null },
    };
    const parties = envoyeesParObjet.get(`${c.type}:${c.objetId}`) ?? [];
    // La dernière relance réellement partie : la suivante attend au moins l'intervalle après elle.
    const derniere = parties.map((d) => (d.envoyee_le ? jourParis(new Date(d.envoyee_le)) : null)).filter((x): x is string => !!x).sort().at(-1) ?? null;
    const auPlusTot = derniere ? jourPermis(plus(derniere, regle.intervalle_jours), regle.jours_envoi) : null;
    const auCalendrier = (rang: number) => (base ? jourPermis(plus(base, sens * regle.premier_delai_jours + (rang - 1) * regle.intervalle_jours), regle.jours_envoi) : null);
    const calculee = (rang: number) => {
      const prevue = auCalendrier(rang);
      return prevue && auPlusTot && auPlusTot > prevue ? auPlusTot : prevue;
    };

    // Les relances déjà parties restent visibles, quelle que soit la règle d'aujourd'hui.
    for (const dec of parties) {
      const rang = Number(dec.cle.split(":")[2]) || 1;
      out.push({
        ...commun, cle: dec.cle, rang, prevue: auCalendrier(rang) ?? iso(dec.envoyee_le) ?? aujourdhui, colonne: "envoyee",
        motif: dec.envoi_motif, envoyeeLe: dec.envoyee_le, envoiStatut: dec.envoi_statut, canaux: dec.canaux?.length ? dec.canaux : ["email"], reportee: false,
      });
    }

    const canauxPrets = regle.canaux.filter((k) => !raisonDeNePasEnvoyer(e.cartes.get(def.cartes[k]) ?? null));
    // Une carte sans texte ne bloque pas un envoi à la main : l'écran d'envoi propose un texte à relire.
    const sansTexte = regle.canaux.filter((k) => !e.cartes.get(def.cartes[k])?.corps.trim());
    const exclu = e.exclusions.has(`${c.dossierId}:*`) ? "Dossier marqué « ne pas relancer »." : e.exclusions.has(`${c.dossierId}:${c.type}`) ? "Dossier exclu de cette relance." : null;
    const segment = regle.segments_exclus.includes(c.segment) ? `Segment « ${TYPES[c.segment] ?? c.segment} » exclu de cette relance.` : null;
    const blocage = !regle.actif ? "Règle désactivée." : (exclu ?? segment);
    const coupee = blocage ?? (canauxPrets.length ? null : motifCartes(def, regle.canaux, e.cartes));
    const aRediger = !blocage && !canauxPrets.length && sansTexte.length > 0;
    let pousse = false;

    if (!base) {
      if (!c.regle) sansDate.set(c.type, (sansDate.get(c.type) ?? 0) + 1);
    } else {
      // « Avant » un repère, ou pour ce qu'il faut avant le déménagement : rien au-delà.
      const borne = repere.sens === "avant" ? base : def.borne ? (c.dates[def.borne] ?? null) : null;
      if (borne && aujourdhui >= borne) continue;

      for (let rang = 1; rang <= regle.nombre_max; rang++) {
        const cle = `${c.type}:${c.objetId}:${rang}`;
        const dec = parCle.get(cle);
        if (dec?.statut === "envoyee") continue;
        const prevue = dec?.statut === "reportee" && dec.report_au ? jourPermis(iso(dec.report_au)!, regle.jours_envoi) : calculee(rang)!;
        if (borne && prevue >= borne) break;
        const base2 = { ...commun, cle, rang, prevue, envoyeeLe: null, envoiStatut: null, reportee: dec?.statut === "reportee" };
        const annulee = dec?.statut === "annulee";
        const motif = annulee ? "Annulée par l'équipe." : (c.regle ?? coupee);
        if (motif) {
          if (prevue >= limite || annulee || o.manuelles) {
            // Ce qui bloque même à la main : tout, sauf une carte sans texte (l'écran d'envoi en propose un à relire).
            const bloquee = annulee || c.regle ? motif : (blocage ?? (aRediger ? null : coupee));
            out.push({ ...base2, colonne: "desactivee", motif, canaux: regle.canaux, bloquee, reglee: !annulee && !!c.regle, aRediger: !bloquee && aRediger });
            pousse = true;
          }
          break;
        }
        out.push({ ...base2, motif: null, canaux: canauxPrets, colonne: prevue > aujourdhui ? "avenir" : prevue === aujourdhui ? "aujourdhui" : "retard", bloquee: null });
        pousse = true;
        break;
      }
    }

    // À la main, hors du calendrier : l'objet reste à relancer, mais la veille n'a plus de rang à offrir.
    if (o.manuelles && !pousse && !c.regle) {
      const rangs = parties.map((d) => Number(d.cle.split(":")[2]) || 1);
      let rang = 1;
      while (rangs.includes(rang)) rang++;
      const horsSuite =
        rang > regle.nombre_max
          ? `Les ${regle.nombre_max} relance${regle.nombre_max > 1 ? "s" : ""} prévue${regle.nombre_max > 1 ? "s" : ""} sont parties : celle-ci s'ajoute à la main, hors suite.`
          : !base
            ? "Hors calendrier : le repère de la règle n'a pas de date pour ce dossier."
            : "Hors calendrier : la veille ne l'enverrait plus avant le déménagement.";
      out.push({
        ...commun, cle: `${c.type}:${c.objetId}:${rang}`, rang, prevue: aujourdhui, envoyeeLe: null, envoiStatut: null, reportee: false,
        colonne: blocage || !canauxPrets.length ? "desactivee" : "aujourdhui", motif: coupee, canaux: canauxPrets.length ? canauxPrets : regle.canaux,
        bloquee: blocage ?? (canauxPrets.length || aRediger ? null : coupee), aRediger: !blocage && aRediger, horsSuite,
      });
    }
  }
  out.sort((a, b) => a.prevue.localeCompare(b.prevue));
  return { relances: out, sansDate };
}

/**
 * Toutes les relances, rangées dans les colonnes du Kanban : la prochaine de
 * chaque suite (à venir, aujourd'hui, en retard), celles déjà envoyées, et
 * celles que rien ne fera partir (désactivées), avec la raison.
 */
export async function listerRelances(aujourdhui = jourParis(), o: OptionsRanger = {}): Promise<Relance[]> {
  return ranger(await charger(), aujourdhui, undefined, o).relances;
}

/** La même chose, avec les règles lues (évite une seconde lecture). */
export async function relancesEtRegles(aujourdhui = jourParis(), o: OptionsRanger = {}): Promise<Calcul & { regles: Map<TypeRelance, Regle> }> {
  const e = await charger();
  return { ...ranger(e, aujourdhui, undefined, o), regles: e.regles };
}

/**
 * La simulation d'une règle : les relances qu'elle engendrerait, à côté de
 * celles de la règle enregistrée. Rien n'est envoyé ni enregistré.
 */
export async function simulerRegle(type: TypeRelance, brouillon: Regle, aujourdhui = jourParis()) {
  const e = await charger();
  const avant = ranger(e, aujourdhui);
  const apres = ranger(e, aujourdhui, new Map([...e.regles, [type, brouillon]]));
  return {
    avant: avant.relances.filter((r) => r.type === type),
    apres: apres.relances.filter((r) => r.type === type),
    sansDate: { avant: avant.sansDate.get(type) ?? 0, apres: apres.sansDate.get(type) ?? 0 },
    regle: e.regles.get(type)!,
  };
}

/** Le meilleur statut d'une relance envoyée par plusieurs canaux. */
const RANG_STATUT = ["envoye", "bac_a_sable", "journalise", "bloque", "fictif", "incertain", "echec"];

/**
 * Les liens d'une relance : la page de signature de chaque devis, et pour le
 * bouton, la rubrique de l'espace client (pièces, conditions, factures) ou le
 * lien de dépôt d'avis. Sans espace client ni lien, pas de bouton.
 */
export async function liensRelance(type: TypeCourrier, demande: DemandeRelance): Promise<LiensRelance> {
  const espace = demande.espace ? `${await adressePublique()}/espace-client/${encodeURIComponent(demande.espace)}` : null;
  const parElement: Record<string, string> = {};
  for (const e of demande.elements) {
    if (e.jeton) parElement[e.id] = versInterne(`/signature/${e.jeton}`);
    else if (e.chemin && espace) parElement[e.id] = `${espace}/${e.chemin}`;
  }
  if (type === "avis") return { parElement, principal: lienRegle() };
  const page = ({ pieces: "/documents#pieces", conditions: "/documents#conditions", solde: "/devis#factures", espace: "" } as Partial<Record<TypeCourrier, string>>)[type];
  return { parElement, principal: espace && page != null ? `${espace}${page}` : null };
}

/**
 * Ce que la relance a demandé, gardé avec elle (crm.relances.elements) : les
 * éléments retenus, sur combien ; et, pour un envoi à la main, si le texte
 * était personnalisé, ou proposé par la plateforme et relu, et si la relance
 * était hors suite.
 */
export interface ElementsInclus {
  inclus: { id: string; titre: string }[];
  total: number;
  tout: boolean;
  personnalisee?: boolean;
  texte?: "propose";
  horsSuite?: boolean;
}

/** Un envoi à la main : ses éléments cochés, ses canaux, et le texte de cet envoi quand il n'est pas celui de la carte. */
export interface EnvoiManuel {
  /** Les éléments cochés (leurs id) ; sans choix, tous — c'est ce que fait la veille. */
  choix?: readonly string[] | null;
  /** Les canaux de cet envoi ; par défaut, ceux prêts de la relance. */
  canaux?: Canal[];
  /** Le texte de cet envoi, par canal (avec ses variables et {elements}) : personnalisé, ou proposé et relu. */
  textes?: Partial<Record<Canal, { objet: string | null; corps: string }>>;
  /** L'équipe a modifié le texte (et pas seulement relu celui proposé). */
  personnalisee?: boolean;
}

/**
 * Envoie une relance par chacun de ses canaux, chaque fois avec sa clé
 * (« relance:<cle> », « relance:<cle>:sms ») : elle ne part jamais deux fois.
 *
 * Sans `envoi`, c'est la veille : tous les éléments, les canaux prêts, les
 * textes des cartes. L'e-mail porte la liste de ce qui est retenu, et la
 * relance garde, avec sa décision, ce qu'elle a demandé et comment.
 */
export async function envoyerRelance(
  r: RelanceCourrier,
  par: string,
  envoi: EnvoiManuel = {},
): Promise<{ ok: boolean; libelle: string; activite?: string; elements?: ElementsInclus }> {
  const def = defCourrier(r.type)!;
  const canaux = envoi.canaux ?? r.canaux;
  if (!canaux.length) return { ok: false, libelle: "aucun canal prêt dans « Courriers et SMS »" };
  const { choix } = envoi;
  const choisis = elementsChoisis(r.demande, choix);
  if (choix && !choisis.length) return { ok: false, libelle: "aucun élément coché n'est encore à demander" };
  const proposes = canaux.filter((k) => envoi.textes?.[k]);
  const inclus: ElementsInclus = {
    inclus: choisis.map((e) => ({ id: e.id, titre: e.titre })), total: r.demande.elements.length, tout: choisis.length === r.demande.elements.length,
    ...(envoi.personnalisee ? { personnalisee: true } : proposes.length ? { texte: "propose" as const } : {}),
    ...(r.horsSuite ? { horsSuite: true } : {}),
  };
  const bloc = choisis.length ? blocRelance(r.type, r.demande, choisis, await liensRelance(r.type, r.demande)) : undefined;
  const vars = choisis.length ? varsRelance(r.type, r.vars, choisis) : r.vars;
  const issues: { canal: Canal; statut: string; motif: string | null; libelle: string; parti: boolean }[] = [];
  for (const canal of canaux) {
    const e = await envoyerCarte(def.cartes[canal], r.dossierId, {
      cle: canal === "email" ? `relance:${r.cle}` : `relance:${r.cle}:${canal}`,
      origine: par === "tâche planifiée" ? "veille" : "crm",
      vars,
      texte: envoi.textes?.[canal] ?? null,
      ...(canal === "email" ? { bloc, surtitre: surtitreRelance(r.ref) } : {}),
    });
    const statut = e.resultat?.statut ?? "echec";
    issues.push({ canal, statut, motif: e.resultat?.motif ?? null, libelle: e.libelle, parti: !!e.resultat && !["echec", "incertain"].includes(statut) });
  }
  const parties = issues.filter((i) => i.parti);
  const libelle = issues.map((i) => (canaux.length > 1 ? `${libelleCanal(i.canal)} : ${i.libelle}` : i.libelle)).join(" · ");
  const rangEnClair = r.type === "espace" ? `n° ${r.rang}` : `${r.rang}/${r.sur}`;
  // Une relance « partie » pour l'équipe : envoyée, ou traitée par les garde-fous (journalisée, recette…),
  // par un canal au moins. Un échec partout ne la marque pas : elle reste à envoyer.
  let activite: string | undefined;
  if (parties.length) {
    const statut = RANG_STATUT.find((s) => parties.some((i) => i.statut === s)) ?? parties[0].statut;
    const motif = parties.map((i) => i.motif).filter(Boolean).join(" · ") || null;
    await q(
      `insert into relances(cle, type, dossier_id, rang, statut, envoyee_le, envoi_statut, envoi_motif, par, canaux, elements) values($1,$2,$3,$4,'envoyee',now(),$5,$6,$7,$8,$9)
       on conflict (cle) do update set statut='envoyee', envoyee_le=now(), envoi_statut=$5, envoi_motif=$6, par=$7, canaux=$8, elements=$9, report_au=null, maj_le=now()`,
      [r.cle, r.type, r.dossierId, r.rang, statut, motif, par, parties.map((i) => i.canal), inclus.total || inclus.personnalisee || inclus.texte || inclus.horsSuite ? JSON.stringify(inclus) : null],
    );
    // Une partie seulement des éléments : le fil du dossier dit lesquels ; et si le texte n'est pas celui de la carte.
    const quoi = inclus.tout ? "" : ` · ${inclus.inclus.length} élément${inclus.inclus.length > 1 ? "s" : ""} sur ${inclus.total} : ${choisis.map((e) => e.court).join(", ")}`;
    const comment = [inclus.personnalisee ? "texte personnalisé" : inclus.texte ? "texte proposé, relu" : null, inclus.horsSuite ? "hors suite" : null].filter(Boolean).join(", ");
    activite = `${r.libelle} (${rangEnClair}) : ${libelle}${quoi}${comment ? ` · ${comment}` : ""}`;
    await q("insert into activite(dossier_id, libelle) values($1,$2)", [r.dossierId, activite]).catch(() => undefined);
  } else {
    // Aucun canal n'est parti : l'alerte de l'équipe « Relance en échec », à ses abonnés.
    const commercial = await q1<{ email: string | null }>("select u.email from dossiers d left join utilisateurs u on u.id = d.commercial_id where d.id = $1", [r.dossierId]).catch(() => undefined);
    await alerterEquipe("relance_echec", {
      evenement: `${r.cle}-${jourParis()}`, reference: r.ref, conseillers: [commercial?.email],
      vars: { client: r.client || r.ref, reference: r.ref, relance: `${r.libelle} ${rangEnClair}`, motif: libelle },
      lien: { chemin: `/relances?dossier=${r.dossierId}`, libelle: "Ouvrir ses relances" },
    });
  }
  return { ok: parties.length > 0, libelle, activite, elements: inclus };
}

export async function decider(cle: string, decision: { statut: "reportee"; au: string } | { statut: "annulee" } | { statut: "reactivee" }, par: string) {
  const [type, , rang] = cle.split(":");
  const r = (await listerRelances()).find((x) => x.cle === cle);
  const dossierId = r?.dossierId ?? (await q1<{ dossier_id: number }>("select dossier_id from relances where cle=$1", [cle]))?.dossier_id;
  if (!dossierId || !defRelance(type)) throw new Error("Relance introuvable.");
  if (decision.statut === "reactivee") {
    await q("delete from relances where cle=$1 and statut in ('annulee','reportee')", [cle]);
    return;
  }
  await q(
    `insert into relances(cle, type, dossier_id, rang, statut, report_au, par) values($1,$2,$3,$4,$5,$6,$7)
     on conflict (cle) do update set statut=$5, report_au=$6, par=$7, maj_le=now() where relances.statut <> 'envoyee'`,
    [cle, type, dossierId, Number(rang) || 1, decision.statut, decision.statut === "reportee" ? decision.au : null, par],
  );
}

/**
 * Au-delà, une relance en retard ne part plus toute seule : elle attend une
 * décision de l'équipe (envoyer, repousser, annuler). Sans cette borne, le
 * premier passage de la veille relancerait tous les vieux devis d'un coup.
 */
export const RATTRAPAGE_JOURS = 3;


/** Les relances que la veille enverrait maintenant : du jour, ou en retard de trois jours au plus, aux jours et heures permis. */
export function duesPourLaVeille(relances: Relance[], regles: Map<TypeRelance, Regle>, maintenant = new Date()) {
  const jour = jourParis(maintenant);
  const heure = heureParis(maintenant);
  const borne = plus(jour, -RATTRAPAGE_JOURS);
  const candidates = relances.filter((r) => (r.colonne === "aujourdhui" || r.colonne === "retard") && r.prevue >= borne);
  const dues = candidates.filter((r) => creneauOuvert(regles.get(r.type)!, jour, heure));
  return {
    dues,
    horsCreneau: candidates.length - dues.length,
    enAttente: relances.filter((r) => r.colonne === "retard" && r.prevue < borne).length,
  };
}

/** La tâche de la veille : les relances dues, une fois chacune. Une règle désactivée n'envoie rien (ses relances sont désactivées). */
export async function envoyerRelancesDuJour(maintenant = new Date()): Promise<{
  envoyees: number; echecs: number; enAttente: number; horsCreneau: number; details: { cle: string; libelle: string }[];
}> {
  const { relances, regles } = await relancesEtRegles(jourParis(maintenant));
  const { dues, horsCreneau, enAttente } = duesPourLaVeille(relances, regles, maintenant);
  let envoyees = 0;
  let echecs = 0;
  const details: { cle: string; libelle: string }[] = [];
  for (const r of dues) {
    const e = await envoyerRelance(r, "tâche planifiée");
    if (e.ok) envoyees++;
    else echecs++;
    details.push({ cle: r.cle, libelle: e.libelle });
  }
  return { envoyees, echecs, enAttente, horsCreneau, details };
}
