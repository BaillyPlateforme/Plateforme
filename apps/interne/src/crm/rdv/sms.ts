import "server-only";
import { alerterEquipe } from "@/lib/alertes-equipe";
import type { ResultatEnvoi } from "@/lib/envois";
import { normaliserTelephone } from "@/lib/envois/garde-fous";
import { q, q1, type Db } from "@/crm/lib/db";
import { appel, destinataire, envoyerSmsRendezVous } from "@/crm/envois";
import { modeleDe, remplir, type LigneModele } from "@/crm/messages/catalogue";
import { jourParis } from "@/lib/visite/regles";
import { carteSms, cleSmsRdv, LIBELLES_RAPPEL, momentDuRappel, rappelUtile, type CarteSmsRdv, type MomentRappel } from "./calendrier";

/*
 * Les SMS des rendez-vous de visite, sur place ou en visio (cahier des
 * charges, §3.2 ; retours de Céline, 16/11/2026) :
 *   - la confirmation, dès la prise du rendez-vous (cartes « Visite
 *     confirmée » et « Visio confirmée ») ;
 *   - les rappels de l'avant-veille et de la veille (« Rappel J−2 », « Rappel
 *     de la veille », et leurs cartes visio), par la tâche de la veille —
 *     le calendrier est dans calendrier.ts ;
 *   - la réponse du client : 1 confirme, 2 annule. Mise de côté le 16/11/2026
 *     (« pour l'instant oublions les options 1 et 2 ») : voir
 *     REPONSE_SMS_DEMANDEE.
 *
 * L'état de chaque rendez-vous (crm.rdv_sms) s'affiche au planning commercial
 * et dans le dossier ; un rendez-vous annulé par le client sonne dans la
 * cloche.
 *
 * Ce module ne touche pas au planning ni aux rendez-vous eux-mêmes (le module
 * des visites techniques les tient) : il lit crm.rendez_vous, il écrit dans
 * crm.rdv_sms.
 */

/**
 * Les SMS demandent-ils au client de répondre 1 (confirmer) ou 2 (annuler) ?
 * Non depuis le 16/11/2026 : les textes ne le proposent plus (modèles de
 * « Courriers et SMS »). Le traitement des réponses reste en place et actif —
 * une réponse « 1 » ou « 2 » qui arrive quand même (webhook de Brevo,
 * /api/sms/reponses) est enregistrée, et l'équipe peut toujours noter au
 * dossier « Confirmé » ou « Annulé par le client » après un appel. Ce qui
 * change ici : un SMS sans réponse n'est plus une anomalie — l'état se lit
 * « SMS envoyé », sans couleur d'alerte, et la cloche ne sonne plus pour les
 * visites de demain restées sans réponse. Revenir aux options 1 et 2 : passer
 * ceci à true et remettre la phrase dans les modèles.
 */
export const REPONSE_SMS_DEMANDEE = false;

export type EtatRdv = "confirme" | "annule" | "sans_reponse" | "non_parti";

export const ETATS_RDV: Record<EtatRdv, { libelle: string; ton: "g" | "r" | "w" | "i" }> = {
  confirme: { libelle: "Confirmé par le client", ton: "g" },
  annule: { libelle: "Annulé par le client", ton: "r" },
  sans_reponse: REPONSE_SMS_DEMANDEE ? { libelle: "SMS envoyé, sans réponse", ton: "w" } : { libelle: "SMS envoyé", ton: "i" },
  non_parti: { libelle: "SMS non parti", ton: "i" },
};

interface LigneRdvSms {
  rendez_vous_id: number;
  numero: string | null;
  confirmation_le: string | null;
  confirmation_statut: string | null;
  rappel_le: string | null;
  rappel_statut: string | null;
  reponse: "confirme" | "annule" | null;
  reponse_le: string | null;
  reponse_source: "sms" | "manuel" | null;
  reponse_texte: string | null;
  vue_le: string | null;
}

/** Inscrit un envoi (confirmation ou rappel) d'un rendez-vous, avec le numéro qui l'a reçu. */
export async function noterEnvoiRdv(rdvId: number, type: "confirmation" | "rappel", resultat: ResultatEnvoi | null, numero: string | null) {
  if (!resultat || resultat.doublon) return;
  const col = type === "confirmation" ? "confirmation" : "rappel";
  await q(
    `insert into rdv_sms(rendez_vous_id, numero, ${col}_le, ${col}_statut) values($1, $2, now(), $3)
     on conflict (rendez_vous_id) do update set numero = coalesce(excluded.numero, rdv_sms.numero), ${col}_le = now(), ${col}_statut = excluded.${col}_statut, maj_le = now()`,
    [rdvId, numero ? normaliserTelephone(numero) : null, resultat.statut],
  );
}

/** La confirmation d'un rendez-vous : envoyée par SMS, inscrite, et dite au fil du dossier. */
export async function envoyerConfirmationRdv(dossierId: number, rdvId: number) {
  const r = await envoyerSmsRendezVous(dossierId, rdvId, "confirmation");
  if (!r) return null;
  await noterEnvoiRdv(rdvId, "confirmation", r.resultat, r.numero);
  return r;
}

/**
 * La confirmation d'une visite qui vient d'être prise (planificateur,
 * réservation depuis la fiche du dossier), avec sa ligne au fil du dossier :
 * dès le rendez-vous pris (retours de Céline, 16/11/2026). Un envoi qui
 * échoue ne défait pas le rendez-vous : le dossier propose de le renvoyer.
 */
export async function confirmerRdvPris(dossierId: number, rdvId: number, utilisateurId: number | null) {
  try {
    const r = await envoyerConfirmationRdv(dossierId, rdvId);
    if (!r) return;
    const libelle = r.resultat ? `SMS de confirmation ${r.libelle} : « ${r.texte} »` : "Pas de SMS de confirmation : pas de numéro de téléphone sur la fiche client";
    await q("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [dossierId, utilisateurId, libelle]);
  } catch (e) {
    console.error(`BaillyCRM : confirmation du rendez-vous ${rdvId} non envoyée`, e instanceof Error ? e.message : e);
  }
}

/** La réponse du client, par SMS ou saisie par l'équipe. La plus récente l'emporte. */
export async function enregistrerReponseRdv(rdvId: number, reponse: "confirme" | "annule", source: "sms" | "manuel", o: { texte?: string | null; par?: string | null } = {}) {
  await q(
    `insert into rdv_sms(rendez_vous_id, reponse, reponse_le, reponse_source, reponse_texte, reponse_par) values($1,$2,now(),$3,$4,$5)
     on conflict (rendez_vous_id) do update set reponse=$2, reponse_le=now(), reponse_source=$3, reponse_texte=$4, reponse_par=$5, vue_le=null, maj_le=now()`,
    [rdvId, reponse, source, o.texte?.slice(0, 300) ?? null, o.par ?? null],
  );
  const rdv = await q1<{ dossier_id: number | null }>("select dossier_id from rendez_vous where id=$1", [rdvId]);
  if (rdv?.dossier_id) {
    await q("insert into activite(dossier_id, libelle) values($1, $2)", [
      rdv.dossier_id,
      `${reponse === "confirme" ? "Rendez-vous confirmé" : "Rendez-vous annulé"} par le client (${source === "sms" ? `réponse au SMS${o.texte ? ` : « ${o.texte.slice(0, 40)} »` : ""}` : `saisi par ${o.par ?? "l'équipe"}`})`,
    ]);
  }
}

/** « 1 », « 1 oui », « 2. » → la réponse ; tout autre texte n'en est pas une. */
export function lireReponse(texte: string): "confirme" | "annule" | null {
  const t = texte.trim().toLowerCase();
  if (/^1(\b|\s|[.!,]|$)/.test(t) || /^oui\b/.test(t)) return "confirme";
  if (/^2(\b|\s|[.!,]|$)/.test(t) || /^non\b/.test(t)) return "annule";
  return null;
}

/**
 * Une réponse reçue par SMS : rattachée au rendez-vous à venir (ou d'hier au
 * plus) dont le dernier SMS est parti vers ce numéro. Rend le rendez-vous
 * trouvé, ou null — la réponse est alors ignorée (aucune donnée gardée).
 */
export async function reponseSmsRecue(numeroBrut: string, texte: string): Promise<{ rdvId: number; reponse: "confirme" | "annule" } | { rdvId: null; raison: string }> {
  const reponse = lireReponse(texte);
  if (!reponse) return { rdvId: null, raison: "réponse ni 1 ni 2" };
  const numero = normaliserTelephone(numeroBrut);
  if (!/^\d{8,15}$/.test(numero)) return { rdvId: null, raison: "numéro illisible" };
  const r = await q1<{ rendez_vous_id: number }>(
    `select s.rendez_vous_id from rdv_sms s join rendez_vous r on r.id = s.rendez_vous_id
      where s.numero = $1 and r.debut > now() - interval '1 day'
      order by greatest(coalesce(s.confirmation_le, 'epoch'), coalesce(s.rappel_le, 'epoch')) desc limit 1`,
    [numero],
  );
  if (!r) return { rdvId: null, raison: "aucun rendez-vous à venir pour ce numéro" };
  await enregistrerReponseRdv(r.rendez_vous_id, reponse, "sms", { texte });
  if (reponse === "annule") await alerterRdvAnnule(r.rendez_vous_id);
  return { rdvId: r.rendez_vous_id, reponse };
}

/** L'alerte de l'équipe « Rendez-vous annulé par le client », à ses abonnés (Relances › Alertes de l'équipe). */
async function alerterRdvAnnule(rdvId: number) {
  const r = await q1<{ debut: string; dossier_id: number | null; ref: string | null; nom: string | null; prenom: string | null; societe: string | null; commercial: string | null; titre: string }>(
    `select r.debut, r.dossier_id, r.titre, d.ref, c.nom, c.prenom, c.societe, u.email as commercial
       from rendez_vous r left join dossiers d on d.id = r.dossier_id left join clients c on c.id = d.client_id left join utilisateurs u on u.id = r.commercial_id where r.id = $1`,
    [rdvId],
  ).catch(() => undefined);
  if (!r) return;
  const quand = new Date(r.debut).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  await alerterEquipe("rdv_annule", {
    evenement: `rdv-${rdvId}-${new Date(r.debut).toISOString()}`, reference: r.ref, conseillers: [r.commercial],
    vars: { client: r.nom || r.societe ? appel({ civilite: null, prenom: r.prenom, nom: r.nom, societe: r.societe }) : r.titre, reference: r.ref ?? "sans dossier", date: quand },
    lien: r.dossier_id ? { chemin: `/dossiers/${r.dossier_id}`, libelle: "Ouvrir le dossier" } : { chemin: "/planning", libelle: "Ouvrir le planning" },
  });
}

export interface EtatAffiche {
  etat: EtatRdv;
  libelle: string;
  ton: "g" | "r" | "w" | "i";
  detail: string;
}

/** L'état des rendez-vous, pour le planning et le dossier. Ceux sans SMS n'ont pas d'état. */
export async function etatsRdv(ids: number[]): Promise<Map<number, EtatAffiche>> {
  const out = new Map<number, EtatAffiche>();
  if (!ids.length) return out;
  const lignes = await q<LigneRdvSms>("select * from rdv_sms where rendez_vous_id = any($1)", [ids]).catch(() => [] as LigneRdvSms[]);
  for (const l of lignes) {
    const e = etatDeLigne(l);
    if (e) out.set(l.rendez_vous_id, e);
  }
  return out;
}

/** Pour la cloche : les rendez-vous annulés par le client (pas encore vus), et ceux de demain restés sans réponse. */
export async function alertesRdv(): Promise<{ id: string; titre: string; sous: string; href: string }[]> {
  try {
    const lignes = await q<{ id: number; dossier_id: number | null; titre: string; debut: string; reponse: string | null; reponse_source: string | null; nom: string | null; prenom: string | null; societe: string | null }>(
      `select r.id, r.dossier_id, r.titre, r.debut, s.reponse, s.reponse_source, c.nom, c.prenom, c.societe
         from rdv_sms s join rendez_vous r on r.id = s.rendez_vous_id
         left join dossiers d on d.id = r.dossier_id left join clients c on c.id = d.client_id
        where r.debut > now() and not r.termine
          and ((s.reponse = 'annule' and s.vue_le is null)
            or ($1 and s.reponse is null and (s.confirmation_statut = 'envoye' or s.rappel_statut = 'envoye')
                and (r.debut at time zone 'Europe/Paris')::date = ((now() at time zone 'Europe/Paris')::date + 1)))
        order by r.debut limit 8`,
      // Sans réponse demandée au client, une visite de demain sans réponse ne sonne pas (REPONSE_SMS_DEMANDEE).
      [REPONSE_SMS_DEMANDEE],
    );
    return lignes.map((l) => {
      const qui = [l.prenom, l.nom].filter(Boolean).join(" ") || l.societe || l.titre;
      const quand = new Date(l.debut).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      return l.reponse === "annule"
        ? { id: `rdv-a${l.id}`, titre: `Rendez-vous annulé par ${qui}`, sous: `${quand} · ${l.reponse_source === "sms" ? "réponse « 2 » au SMS" : "noté par l'équipe"}`, href: l.dossier_id ? `/dossiers/${l.dossier_id}` : "/planning" }
        : { id: `rdv-s${l.id}`, titre: `Sans réponse : ${qui}`, sous: `Visite de demain, ${quand}`, href: l.dossier_id ? `/dossiers/${l.dossier_id}` : "/planning" };
    });
  } catch {
    return [];
  }
}

/** L'équipe a vu l'annulation : elle quitte la cloche. */
export async function marquerVu(rdvId: number) {
  await q("update rdv_sms set vue_le = now(), maj_le = now() where rendez_vous_id = $1", [rdvId]);
}

/**
 * Un rendez-vous déplacé (ou annulé) : son état SMS est oublié. La
 * confirmation, le rappel et la réponse du client (1 ou 2) portaient sur
 * l'ancien horaire — le SMS dit « confirmé le {date} à {heure} ». Gardé, il
 * ferait passer pour confirmé un horaire que le client n'a jamais vu,
 * rattacherait une réponse tardive à l'ancien SMS au nouvel horaire, et un
 * « 2 » d'hier priverait le nouvel horaire de son rappel de la veille.
 *
 * L'historique ne se perd pas : chaque envoi est au journal des envois, et la
 * réponse du client au fil du dossier. Rend l'état oublié (pour le dire à
 * l'équipe), ou null s'il n'y en avait pas. Peut lire et écrire dans une
 * transaction (`db`).
 */
export async function oublierEtatRdv(rdvId: number, db?: Db): Promise<EtatAffiche | null> {
  const sql = "delete from rdv_sms where rendez_vous_id = $1 returning *";
  const [l] = db ? await db.query<LigneRdvSms>(sql, [rdvId]) : await q<LigneRdvSms>(sql, [rdvId]);
  return l ? (etatDeLigne(l) ?? null) : null;
}

/** L'état affiché d'une ligne de crm.rdv_sms (voir etatsRdv). */
function etatDeLigne(l: LigneRdvSms): EtatAffiche | undefined {
  const quand = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : "");
  let etat: EtatRdv | null = null;
  let detail = "";
  if (l.reponse) {
    etat = l.reponse;
    detail = `${l.reponse_source === "sms" ? "Réponse au SMS" : "Saisi par l'équipe"} le ${quand(l.reponse_le)}`;
  } else if (l.confirmation_statut === "envoye" || l.rappel_statut === "envoye") {
    etat = "sans_reponse";
    detail = `SMS parti le ${quand(l.rappel_statut === "envoye" ? l.rappel_le : l.confirmation_le)}`;
  } else if (l.confirmation_statut || l.rappel_statut) {
    etat = "non_parti";
    detail = `SMS ${l.confirmation_statut ?? l.rappel_statut} (voir Envois et veille)`;
  }
  return etat ? { etat, ...ETATS_RDV[etat], detail } : undefined;
}

/** Un SMS de rappel, pour la tâche de la veille (taches/rappels-visites.ts). */
export interface RappelSms {
  canal: "sms";
  destinataire: string;
  texte: string;
  dossierId: number;
  rendezVousId: number;
  cle: string;
  /** La carte de « Courriers et SMS » : désactivée, le rappel reste au journal. */
  carte: CarteSmsRdv;
  /** Le nom du modèle, au journal des envois. */
  modele: string;
  /** « Rappel J−2 » ou « Rappel de la veille », pour le fil du dossier. */
  libelle: string;
}

/**
 * Les SMS de rappel que la tâche du jour `jour` envoie (calendrier.ts) : à
 * J−2 et à J−1, les visites sur place et les visios rattachées à un dossier
 * encore ouvert, pas terminées, pas classées sans suite, sans compte-rendu
 * signé, que le client n'a pas annulées. Chacune avec la carte de son type
 * (une visio ne dit pas « passera chez vous »).
 *
 * Un rappel ne part pas le jour où la confirmation de cet horaire est partie.
 * Les clés du rappel de la veille sont celles d'avant (crm:rdv:<id>:rappel:…) :
 * un rappel déjà parti ne repart pas.
 */
export async function rappelsSmsRendezVous(jour: Date): Promise<RappelSms[]> {
  const j = jourParis(jour);
  const rdvs = await q<{ id: number; dossier_id: number; type: string; debut: string; commercial: string | null; confirmation_le: string | null; confirmation_statut: string | null }>(
    `select r.id, r.dossier_id, r.type, r.debut, u.nom as commercial, s.confirmation_le, s.confirmation_statut
       from rendez_vous r join utilisateurs u on u.id = r.commercial_id
       join dossiers d on d.id = r.dossier_id
       left join rdv_sms s on s.rendez_vous_id = r.id
      where r.type in ('phys','visio') and not r.journee and not r.termine and not r.sans_suite
        and (r.debut at time zone 'Europe/Paris')::date in (($1::date + 1), ($1::date + 2))
        and d.statut not in ('perdu', 'termine') and coalesce(s.reponse, '') <> 'annule'
        and not exists (select 1 from visites v where v.rendez_vous_id = r.id and v.statut = 'signee')
      order by r.debut, r.id`,
    [j],
  );
  const modeles = new Map<CarteSmsRdv, LigneModele | null>();
  const modele = async (c: CarteSmsRdv) => {
    if (!modeles.has(c)) modeles.set(c, await modeleDe(c));
    return modeles.get(c) ?? null;
  };
  const out: RappelSms[] = [];
  for (const r of rdvs) {
    const moment: MomentRappel | null = momentDuRappel(r.debut, j);
    if (!moment || !rappelUtile({ le: r.confirmation_le, statut: r.confirmation_statut }, j)) continue;
    const c = await destinataire(r.dossier_id);
    if (!c?.telephone) continue;
    const carte = carteSms(r.type, moment);
    const m = await modele(carte);
    const d = new Date(r.debut);
    out.push({
      canal: "sms",
      destinataire: c.telephone,
      texte: remplir(m?.corps ?? "", {
        client: appel(c), commercial: r.commercial ?? "", ref: c.ref,
        date: d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }),
        heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
      }),
      dossierId: r.dossier_id,
      rendezVousId: r.id,
      cle: cleSmsRdv(r.id, moment, d),
      carte,
      modele: m?.nom ?? LIBELLES_RAPPEL[moment],
      libelle: `${LIBELLES_RAPPEL[moment]}${r.type === "visio" ? " (visio)" : ""}`,
    });
  }
  return out;
}
