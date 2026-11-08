import "server-only";
import { q } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { lireDemandes } from "@/crm/demandes/donnees";
import { etapeDe } from "@/crm/demandes/etapes";
import {
  cleAppel, DEVIS_SANS_REPONSE_JOURS, FAITS_JOURS, NOUVELLES_QUALIFIEES_JOURS, scoreAppel, SIGNAL_CHAUD_HEURES, sourceDe,
  type Appel, type AppelFait, type SourceAppel,
} from "./regles";

/*
 * Les appels à passer, calculés à chaque lecture à partir de quatre sources.
 * Chacune reprend une règle qui existait déjà (aucune n'est inventée) :
 *
 *   rappel    un rappel demandé (public.request_events, type « rappel »)
 *             encore ouvert : statut « à rappeler » ou « en cours » — la
 *             liste « À rappeler » de Demandes (lib/rappels.ts, OUVERTS) ;
 *   nouvelle  une demande du site dans la colonne « Nouvelle » ou
 *             « Incomplète » du Kanban de Demandes (etapeDe, demandes/
 *             etapes.ts), ou « En analyse » / « Qualifiée » depuis moins de
 *             NOUVELLES_QUALIFIEES_JOURS (l'analyse les qualifie d'office en
 *             une seconde : personne ne les a encore appelées), avec un
 *             téléphone, sans rappel ouvert (le rappel la porte déjà) ;
 *   devis     un dossier du CRM au statut « devis », non archivé, dont un
 *             devis est « envoyé » depuis plus de DEVIS_SANS_REPONSE_JOURS
 *             (le dernier envoi compte), aucun devis signé, et que l'équipe
 *             n'a pas marqué « ne pas relancer » (crm.relances_exclusions,
 *             type « * » ou « devis ») — la règle de la cloche ;
 *   visite    une visite (physique ou visio) de demain, heure de Paris, pas
 *             terminée ni classée sans suite, dont un SMS (confirmation ou
 *             rappel de la veille) est parti sans réponse du client (ni 1 ni
 *             2) — la règle de la cloche, « Sans réponse » (rdv/sms.ts).
 *
 * Seules les décisions de l'équipe sont gardées (crm.appels, voir
 * schema.ts) : un appel fait ne revient pas (sauf nouvelle occurrence), un
 * appel reporté revient à l'heure dite.
 *
 * Les devis du site (public.devis) ne sont pas une source : ils ne gardent
 * pas leur date d'envoi.
 */

const TZ = "Europe/Paris";
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const jourParis = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** « il y a 5 min », « il y a 2 h », « il y a 6 jours », « il y a 4 mois ». */
function ilYa(quand: string, maintenant: number) {
  const min = Math.max(0, Math.round((maintenant - Date.parse(quand)) / 60000));
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  const j = Math.round(min / 1440);
  if (j < 60) return `il y a ${j} jour${j > 1 ? "s" : ""}`;
  return `il y a ${Math.round(j / 30)} mois`;
}

/** « depuis 5 min », « depuis 2 h », « depuis 6 j », « depuis 4 mois ». */
function depuis(quand: string, maintenant: number) {
  const min = Math.round((maintenant - Date.parse(quand)) / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `depuis ${min} min`;
  if (min < 1440) return `depuis ${Math.round(min / 60)} h`;
  const j = Math.round(min / 1440);
  return j < 60 ? `depuis ${j} j` : `depuis ${Math.round(j / 30)} mois`;
}

/** « 9 h », « 9 h 30 ». */
function heureFr(d: Date) {
  const [h, m] = d.toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":");
  return `${Number(h)} h${m !== "00" ? ` ${m}` : ""}`;
}

/** « aujourd'hui 15 h », « demain 9 h », « lun. 10 nov. 9 h ». */
export function momentFr(quand: string, maintenant = Date.now()) {
  const d = new Date(quand);
  const j = jourParis(d);
  const auj = jourParis(new Date(maintenant));
  const dem = jourParis(new Date(maintenant + 864e5));
  const hier = jourParis(new Date(maintenant - 864e5));
  const jour =
    j === auj ? "aujourd'hui" : j === dem ? "demain" : j === hier ? "hier" : d.toLocaleDateString("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
  return `${jour} ${heureFr(d)}`;
}

/** « A », « A et B », « A, B et C ». */
const enumerer = (l: string[]) => (l.length <= 1 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} et ${l[l.length - 1]}`);
const trajet = (a: string | null, b: string | null) => (a || b ? `${a ?? "?"} → ${b ?? "?"}` : null);
const nombre = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Un appel calculé, avant les décisions de l'équipe. */
type Brut = Omit<Appel, "cle" | "depuis" | "echeanceLibelle" | "score" | "reporteAu" | "reporteLibelle">;

function finir(b: Brut, maintenant: number): Appel {
  const attenteHeures = Math.max(0, (maintenant - Date.parse(b.echeance)) / 36e5);
  return {
    ...b,
    cle: cleAppel(b.source, b.objetId, b.occurrence),
    depuis: depuis(b.echeance, maintenant),
    echeanceLibelle: momentFr(b.echeance, maintenant),
    score: scoreAppel({ source: b.source, potentiel: b.potentiel, montant: b.montant, attenteHeures, chaud: !!b.signal }),
    reporteAu: null,
    reporteLibelle: null,
  };
}

/* ─────────────── Les sources ─────────────── */

async function rappels(maintenant: number): Promise<Brut[]> {
  const rows = await q(
    `select e.id::text as id, e.request_id::text as request_id, e.created_at, e.payload,
            r.client_nom, r.client_email, r.client_tel, r.score_potentiel, r.estimation_prix::float8 as estimation, r.depart_ville, r.arrivee_ville,
            (select d.id from crm.dossiers d where d.request_id = r.id order by d.id limit 1) as dossier_id
       from public.request_events e join public.requests r on r.id = e.request_id
      where e.type = 'rappel' and coalesce(e.payload->>'statut', 'a_rappeler') in ('a_rappeler', 'en_cours')`,
  );
  return rows.map((r) => {
    const p = (r.payload ?? {}) as { statut?: string; priorite?: number; montant_ttc?: number | null; creneau?: string | null };
    const quand = iso(r.created_at);
    const creneau = p.creneau?.trim();
    return {
      source: "rappel",
      objetId: r.id,
      occurrence: "",
      client: r.client_nom?.trim() || r.client_email || "Client sans nom",
      telephone: r.client_tel?.trim() || null,
      motif: `Rappel demandé ${ilYa(quand, maintenant)}`,
      detail: [creneau ? `Créneau souhaité : ${creneau}` : null, trajet(r.depart_ville, r.arrivee_ville)].filter(Boolean).join(" · ") || null,
      marque: p.statut === "en_cours" ? "En cours" : null,
      echeance: quand,
      potentiel: nombre(r.score_potentiel) ?? nombre(p.priorite),
      montant: nombre(p.montant_ttc) ?? nombre(r.estimation),
      lien: { href: `/dashboard/${r.request_id}`, libelle: "Ouvrir la demande" },
      dossierId: r.dossier_id ?? null,
      requestId: r.request_id,
      resume: "rappel demandé",
      objetFeed: { type: "rappel", id: r.id },
    } satisfies Brut;
  });
}

async function nouvelles(maintenant: number): Promise<Brut[]> {
  const demandes = await lireDemandes();
  return demandes
    .filter((d) => {
      const etape = etapeDe(d);
      const rappelOuvert = d.rappel === "a_rappeler" || d.rappel === "en_cours";
      const recente = maintenant - Date.parse(d.recueLe) < NOUVELLES_QUALIFIEES_JOURS * 864e5;
      const aContacter = etape === "nouvelle" || etape === "incomplete" || ((etape === "analyse" || etape === "qualifiee") && recente);
      return aContacter && !!d.telephone?.trim() && !rappelOuvert;
    })
    .map((d) => ({
      source: "nouvelle",
      objetId: d.id,
      occurrence: "",
      client: d.client,
      telephone: d.telephone!.trim(),
      motif: `Demande du site reçue ${ilYa(d.recueLe, maintenant)}, pas encore contactée`,
      detail: [trajet(d.depart, d.arrivee), d.volume ? `${String(Math.round(d.volume * 10) / 10).replace(".", ",")} m³` : null, d.parcoursLabel].filter(Boolean).join(" · ") || null,
      marque: etapeDe(d) === "incomplete" ? "Incomplète" : null,
      echeance: d.recueLe,
      potentiel: d.potentiel,
      montant: d.estimation,
      lien: { href: `/dashboard/${d.id}`, libelle: "Ouvrir la demande" },
      dossierId: null,
      requestId: d.id,
      resume: "nouvelle demande du site",
      objetFeed: { type: "demande", id: d.id },
    }) satisfies Brut);
}

async function devis(maintenant: number): Promise<Brut[]> {
  const rows = await q(
    `select d.id, d.ref, d.request_id::text as request_id, c.nom, c.prenom, c.societe, c.telephone, c.type as segment,
            max(v.envoye_le) as envoye, array_agg(v.numero order by v.numero) as numeros, max(v.montant)::float8 as montant,
            (array_agg(v.id order by v.envoye_le desc))[1] as devis_id, q.score_potentiel,
            -- Le signal chaud (regles.ts, SIGNAL_CHAUD_HEURES) : la dernière ouverture ou le dernier clic CERTAINS de l'e-mail
            -- d'un devis de ce dossier (clé crm:devis:…) ou de sa relance (relance:devis:…), relevés par le suivi des e-mails
            -- (src/crm/suivi, tables posées au démarrage).
            (select jsonb_build_object('quand', e.cree_le, 'type', e.type, 'lien', e.lien_libelle)
               from public.envois_evenements e join public.envois x on x.id = e.envoi_id
              where (x.cle like 'crm:devis:%' or x.cle like 'relance:devis:%') and x.reference = d.ref
                and e.type in ('ouverture', 'clic') and not e.automatique and e.cree_le > now() - make_interval(hours => $2)
              order by e.cree_le desc limit 1) as signal
       from crm.devis v join crm.dossiers d on d.id = v.dossier_id join crm.clients c on c.id = d.client_id
       left join public.requests q on q.id = d.request_id
      where v.statut = 'envoye' and v.envoye_le is not null and d.statut = 'devis' and d.archive_le is null
        and not exists (select 1 from crm.devis x where x.dossier_id = d.id and x.statut = 'signe')
        and not exists (select 1 from crm.relances_exclusions e where e.dossier_id = d.id and e.type in ('*', 'devis'))
      group by d.id, d.ref, d.request_id, c.nom, c.prenom, c.societe, c.telephone, c.type, q.score_potentiel
     having max(v.envoye_le) < now() - make_interval(days => $1)`,
    [DEVIS_SANS_REPONSE_JOURS, SIGNAL_CHAUD_HEURES],
  );
  return rows.map((r) => {
    const envoye = iso(r.envoye);
    const numeros = (r.numeros as string[]) ?? [];
    const echeance = new Date(Date.parse(envoye) + DEVIS_SANS_REPONSE_JOURS * 864e5).toISOString();
    const signal = r.signal as { quand: string; type: string; lien: string | null } | null;
    return {
      signal: signal ? `${signal.type === "clic" ? `A cliqué${signal.lien ? ` « ${signal.lien} »` : " le devis"}` : "A ouvert le devis"} ${momentFr(signal.quand, maintenant)}` : null,
      source: "devis",
      objetId: String(r.id),
      occurrence: envoye,
      client: nomClient(r as never) || r.ref,
      telephone: r.telephone?.trim() || null,
      motif: `Devis ${enumerer(numeros)} envoy${numeros.length > 1 ? "és" : "é"} ${ilYa(envoye, maintenant)}, pas de réponse`,
      detail: `Dossier ${r.ref}`,
      marque: null,
      echeance,
      potentiel: nombre(r.score_potentiel),
      montant: nombre(r.montant),
      lien: { href: `/dossiers/${r.id}`, libelle: "Ouvrir le dossier" },
      dossierId: r.id,
      requestId: r.request_id ?? null,
      resume: `devis ${enumerer(numeros)} sans réponse`,
      objetFeed: { type: "devis", id: String(r.devis_id) },
    } satisfies Brut;
  });
}

async function visites(): Promise<Brut[]> {
  const rows = await q(
    `select r.id, r.dossier_id, r.titre, r.type, r.debut, d.ref, d.request_id::text as request_id, c.nom, c.prenom, c.societe, c.telephone,
            s.numero, u.nom as commercial, q.score_potentiel,
            (select max(v.montant)::float8 from crm.devis v where v.dossier_id = d.id and v.statut in ('envoye', 'signe')) as montant,
            greatest(((r.debut at time zone 'Europe/Paris')::date - 1)::timestamp at time zone 'Europe/Paris',
                     case when s.confirmation_statut = 'envoye' then s.confirmation_le end,
                     case when s.rappel_statut = 'envoye' then s.rappel_le end) as echeance,
            greatest(case when s.confirmation_statut = 'envoye' then s.confirmation_le end, case when s.rappel_statut = 'envoye' then s.rappel_le end) as sms_le
       from crm.rdv_sms s join crm.rendez_vous r on r.id = s.rendez_vous_id
       left join crm.dossiers d on d.id = r.dossier_id left join crm.clients c on c.id = d.client_id
       left join crm.utilisateurs u on u.id = r.commercial_id
       left join public.requests q on q.id = d.request_id
      where r.type in ('phys', 'visio') and r.debut > now() and not r.termine and not coalesce(r.sans_suite, false)
        and s.reponse is null and (s.confirmation_statut = 'envoye' or s.rappel_statut = 'envoye')
        and (r.debut at time zone 'Europe/Paris')::date = ((now() at time zone 'Europe/Paris')::date + 1)`,
  );
  return rows.map((r) => {
    const debut = new Date(r.debut);
    const qui = nomClient(r as never) || r.titre;
    return {
      source: "visite",
      objetId: String(r.id),
      occurrence: debut.toISOString(),
      client: qui,
      telephone: r.telephone?.trim() || r.numero || null,
      motif: `${r.type === "visio" ? "Visio" : "Visite"} demain ${heureFr(debut)} non confirmée`,
      detail: [`SMS parti ${momentFr(iso(r.sms_le))}, ni 1 ni 2 en réponse`, r.commercial ? `avec ${r.commercial}` : null].filter(Boolean).join(" · "),
      marque: r.type === "visio" ? "Visio" : null,
      echeance: iso(r.echeance),
      potentiel: nombre(r.score_potentiel),
      montant: nombre(r.montant),
      lien: r.dossier_id ? { href: `/dossiers/${r.dossier_id}`, libelle: "Ouvrir le dossier" } : { href: "/planning", libelle: "Ouvrir le planning" },
      dossierId: r.dossier_id ?? null,
      requestId: r.request_id ?? null,
      resume: `${r.type === "visio" ? "visio" : "visite"} du ${debut.toLocaleDateString("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })} à ${heureFr(debut)} non confirmée`,
      objetFeed: { type: "rdv", id: String(r.id) },
    } satisfies Brut;
  });
}

const LECTEURS: Record<SourceAppel, (maintenant: number) => Promise<Brut[]>> = { rappel: rappels, nouvelle: nouvelles, devis, visite: visites };

/** Les appels d'une source (ou de toutes), sans les décisions. Une source illisible n'empêche pas les autres. */
async function calculer(sources: SourceAppel[], maintenant: number): Promise<Appel[]> {
  const lots = await Promise.all(
    sources.map((s) =>
      LECTEURS[s](maintenant).catch((e) => {
        console.error(`Appels : source « ${s} » illisible`, e instanceof Error ? e.message : e);
        return [] as Brut[];
      }),
    ),
  );
  return lots.flat().map((b) => finir(b, maintenant));
}

type Decision = { source: string; objet_id: string; occurrence: string; etat: "fait" | "reporte" | "ferme"; reporte_au: Date | null };

async function decisions(appels: Appel[]): Promise<Map<string, Decision>> {
  if (!appels.length) return new Map();
  const rows = await q<Decision>(
    "select source, objet_id, occurrence, etat, reporte_au from crm.appels where objet_id = any($1::text[])",
    [[...new Set(appels.map((a) => a.objetId))]],
  );
  return new Map(rows.map((d) => [cleAppel(d.source as SourceAppel, d.objet_id, d.occurrence), d]));
}

/**
 * Les appels à passer maintenant (`aFaire`) et ceux reportés à plus tard,
 * triés par échéance (la plus ancienne d'abord) : l'écran les retrie selon
 * le choix de chacun.
 */
export async function lireAppels(): Promise<{ aFaire: Appel[]; reportes: Appel[] }> {
  const maintenant = Date.now();
  const tous = await calculer(["visite", "rappel", "devis", "nouvelle"], maintenant);
  const dec = await decisions(tous);
  const aFaire: Appel[] = [];
  const reportes: Appel[] = [];
  for (const a of tous) {
    const d = dec.get(a.cle);
    if (d?.etat === "fait" || d?.etat === "ferme") continue;
    if (d?.etat === "reporte" && d.reporte_au && d.reporte_au.getTime() > maintenant) {
      const au = d.reporte_au.toISOString();
      reportes.push({ ...a, reporteAu: au, reporteLibelle: momentFr(au, maintenant) });
    } else aFaire.push(a);
  }
  const parEcheance = (x: Appel, y: Appel) => Date.parse(x.echeance) - Date.parse(y.echeance);
  return { aFaire: aFaire.sort(parEcheance), reportes: reportes.sort((x, y) => Date.parse(x.reporteAu!) - Date.parse(y.reporteAu!)) };
}

/** Un appel encore dû (à faire ou reporté), retrouvé par sa clé : les actions ne notent que ceux-là. */
export async function trouverAppel(source: SourceAppel, objetId: string, occurrence: string): Promise<Appel | null> {
  const maintenant = Date.now();
  const l = await calculer([source], maintenant);
  return l.find((a) => a.objetId === objetId && a.occurrence === occurrence) ?? null;
}

/** Les appels notés « faits » ou « fermés » ces derniers jours, du plus récent au plus ancien. */
export async function appelsFaits(jours = FAITS_JOURS): Promise<AppelFait[]> {
  const maintenant = Date.now();
  const rows = await q(
    `select source, objet_id, occurrence, etat, client, motif, telephone, note, par_nom, quand, lien from crm.appels
      where etat in ('fait', 'ferme') and quand > now() - make_interval(days => $1) order by quand desc limit 200`,
    [jours],
  ).catch(() => []);
  return rows.map((r) => {
    const quand = iso(r.quand);
    return {
      cle: cleAppel(r.source, r.objet_id, r.occurrence),
      source: sourceDe(r.source)?.cle ?? "rappel",
      etat: r.etat === "ferme" ? "ferme" : "fait",
      client: r.client ?? "Client",
      motif: r.motif ?? "",
      telephone: r.telephone ?? null,
      note: r.note ?? null,
      par: r.par_nom ?? null,
      quand,
      quandLibelle: momentFr(quand, maintenant),
      lien: r.lien ?? null,
    };
  });
}
