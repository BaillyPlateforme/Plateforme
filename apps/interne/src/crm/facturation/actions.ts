"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { q, q1, transaction, type Db, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { projeterEspace } from "@/crm/lib/espace";
import { totaux, arrondi, aujourdhuiParis, jourIso, MODE, GENRE, euros2, type LigneSaisie } from "./calcul";
import { chercherClients, mentionsEmetteur, payeurDe, reglagesFacturation, tauxParDefaut, CHAMPS_REGLAGES, type Payeur, type Reglages } from "./donnees";

/*
 * Les actions de l'encaissement et de la facturation. Comme toutes celles du
 * CRM, elles vérifient la session d'abord (une action serveur s'appelle
 * depuis n'importe quelle adresse), écrivent dans le schéma `crm`, notent ce
 * qu'elles font dans le fil d'activité du dossier et projettent l'espace
 * client. Elles rendent { ok, erreur } : la fenêtre affiche le refus tel quel.
 *
 * Les règles tenues ici, en plus des déclencheurs de la base (schema.ts) :
 * - une facture émise ne se modifie pas : on l'annule par un avoir ;
 * - un règlement qui solde une facture, ou reçu en ligne, ne se modifie
 *   ni ne se supprime ;
 * - la numérotation des factures est chronologique et continue (FA-année-n°,
 *   factures et factures d'arrhes sur la même suite ; AV-année-n° pour les
 *   avoirs) : une facture ne peut pas être datée avant la dernière émise.
 */

export type Issue = { ok: true; id?: number; numero?: string; message?: string } | { ok: false; erreur: string };
const refus = (erreur: string): Issue => ({ ok: false, erreur });

const exiger = () => currentUser();
async function noter(dossierId: number | null | undefined, libelle: string) {
  if (!dossierId) return;
  const u = await currentUser();
  await q("insert into activite(dossier_id,utilisateur_id,libelle) values($1,$2,$3)", [dossierId, u.id, libelle]);
  await q("update dossiers set maj_le=now() where id=$1", [dossierId]);
}
async function apres(...dossiers: (number | null | undefined)[]) {
  for (const id of new Set(dossiers.filter((x): x is number => !!x))) await projeterEspace(id);
  revalidatePath("/(interne)", "layout");
  for (const id of dossiers) if (id) revalidatePath(`/dossiers/${id}`);
}
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const texte = (max = 400) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const fr = (n: number) => euros2(n);
const dateFr = (j: string) => j.split("-").reverse().join("/");

/**
 * La règle de « Marquer payée » (actions.ts, facturePayee) : un déménagement planifié dont la facture de solde
 * est réglée est terminé. Un encaissement qui solde cette facture (règlement saisi ou réaffecté) suit la même
 * règle : sinon le dossier restait « Planifié » au Kanban et au Parcours, payé.
 */
async function terminerSiSoldeRegle(dossierId: number) {
  const r = await q1<{ id: number }>(
    `update dossiers set statut='termine', maj_le=now() where id=$1 and statut='planifie'
       and exists (select 1 from factures where dossier_id=$1 and genre='solde' and statut='payee') returning id`,
    [dossierId],
  );
  if (r) await noter(dossierId, "Facture de solde réglée · dossier terminé");
}

/* ---------- encaisser ---------- */

const SaisieReglement = z.object({
  dossierId: z.number().int().positive(),
  factureId: z.number().int().positive().nullable().optional(),
  nature: z.enum(["arrhes", "reglement", "remboursement"]),
  montant: z.number().positive("Le montant doit être positif.").max(10_000_000),
  mode: z.enum(["cheque", "virement", "carte", "especes", "prelevement", "autre"]),
  recuLe: jour,
  datePrevue: jour.nullable().optional(),
  banque: texte(120), numeroCheque: texte(60), titulaire: texte(160), compte: texte(160), commentaire: texte(1000),
});
export type SaisieReglement = z.input<typeof SaisieReglement>;

/** Le libellé d'un règlement (repris dans l'espace client). Sans numéro de facture : un règlement se réaffecte, l'affectation se lit à part. */
function libelleReglement(s: z.output<typeof SaisieReglement>) {
  const tete = s.nature === "arrhes" ? "Arrhes" : s.nature === "remboursement" ? "Remboursement" : "Règlement";
  const detail = s.mode === "cheque" ? `chèque${s.numeroCheque ? ` n° ${s.numeroCheque}` : ""}${s.banque ? ` (${s.banque})` : ""}` : MODE[s.mode].toLowerCase();
  return `${tete} · ${detail}`;
}

/** La facture à laquelle on affecte un montant : du même dossier, ni avoir, ni annulée, ni soldée, et assez de reste. */
async function factureAffectable(factureId: number, dossierId: number, montant: number, sauf?: number) {
  const [f] = await q<Row>(`select f.id, f.numero, f.genre, f.statut, f.dossier_id, f.montant::float8 as ttc,
      coalesce((select sum(montant) from paiements where facture_id = f.id and id <> coalesce($2, 0)), 0)::float8 as affecte
      from factures f where f.id = $1`, [factureId, sauf ?? null]);
  if (!f || f.dossier_id !== dossierId) return { erreur: "Cette facture n'appartient pas au dossier." };
  if (f.genre === "avoir") return { erreur: "Un avoir ne reçoit pas de règlement." };
  if (f.statut === "annulee") return { erreur: `La facture ${f.numero} est annulée : elle ne reçoit plus de règlement.` };
  if (f.statut === "payee") return { erreur: `La facture ${f.numero} est soldée.` };
  const reste = arrondi(f.ttc - f.affecte);
  if (montant - reste > 0.004) return { erreur: `Le montant dépasse le reste à payer de la facture ${f.numero} (${fr(reste)}). Enregistrez le surplus sans facture : il restera au crédit du dossier.` };
  return { facture: f };
}

export async function encaisser(saisie: SaisieReglement): Promise<Issue> {
  const u = await exiger();
  const p = SaisieReglement.safeParse(saisie);
  if (!p.success) return refus(p.error.issues[0]?.message ?? "Saisie incomplète.");
  const s = p.data;
  if (!(await q1("select 1 from dossiers where id=$1", [s.dossierId]))) return refus("Dossier introuvable.");
  if (s.recuLe > aujourdhuiParis()) return refus("La date du règlement est dans le futur : indiquez-la en « date prévue d'encaissement ».");
  let numero: string | null = null;
  if (s.factureId) {
    if (s.nature === "remboursement") return refus("Un remboursement ne s'affecte pas à une facture.");
    const a = await factureAffectable(s.factureId, s.dossierId, s.montant);
    if (a.erreur) return refus(a.erreur);
    numero = a.facture!.numero;
  }
  const montant = s.nature === "remboursement" ? -s.montant : s.montant;
  const r = await q1<{ id: number }>(
    `insert into paiements(dossier_id, libelle, montant, recu_le, mode, nature, banque, numero_cheque, titulaire, compte_encaissement, date_prevue, commentaire, facture_id, saisi_par)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
    [s.dossierId, libelleReglement(s), montant, s.recuLe, s.mode, s.nature, s.banque, s.numeroCheque, s.titulaire, s.compte, s.datePrevue ?? null, s.commentaire, s.factureId ?? null, u.id],
  );
  const tete = s.nature === "arrhes" ? "Arrhes" : s.nature === "remboursement" ? "Remboursement" : "Règlement";
  await noter(s.dossierId, `${tete} de ${fr(s.montant)} enregistré${s.nature === "arrhes" ? "es" : ""} · ${MODE[s.mode].toLowerCase()}${numero ? ` · facture ${numero}` : ""}`);
  if (s.factureId) await terminerSiSoldeRegle(s.dossierId);
  await apres(s.dossierId);
  return { ok: true, id: r?.id };
}

/** Un règlement qu'on peut encore toucher : ni reçu en ligne, ni partie d'une facture soldée. */
async function reglementModifiable(id: number) {
  const r = await q1(`select p.*, p.montant::float8 as montant, f.numero as facture_numero, f.statut as facture_statut
      from paiements p left join factures f on f.id = p.facture_id where p.id = $1`, [id]);
  if (!r) return { erreur: "Règlement introuvable." };
  if (r.session_paiement_id) return { erreur: "Ce règlement a été fait en ligne par le client : il ne se modifie pas." };
  if (r.facture_statut === "payee") return { erreur: `Ce règlement solde la facture ${r.facture_numero} : une facture soldée ne se modifie plus, ses règlements non plus.` };
  return { reglement: r };
}

export async function modifierReglement(id: number, saisie: SaisieReglement): Promise<Issue> {
  await exiger();
  const m = await reglementModifiable(id);
  if (m.erreur) return refus(m.erreur);
  const p = SaisieReglement.safeParse(saisie);
  if (!p.success) return refus(p.error.issues[0]?.message ?? "Saisie incomplète.");
  const s = p.data;
  if (m.reglement!.dossier_id !== s.dossierId) return refus("Ce règlement appartient à un autre dossier.");
  if (s.recuLe > aujourdhuiParis()) return refus("La date du règlement est dans le futur : indiquez-la en « date prévue d'encaissement ».");
  let numero: string | null = null;
  if (s.factureId) {
    const a = await factureAffectable(s.factureId, s.dossierId, s.montant, id);
    if (a.erreur) return refus(a.erreur);
    numero = a.facture!.numero;
  }
  await q(`update paiements set libelle=$2, montant=$3, recu_le=$4, mode=$5, nature=$6, banque=$7, numero_cheque=$8, titulaire=$9, compte_encaissement=$10,
      date_prevue=$11, commentaire=$12, facture_id=$13 where id=$1`,
    [id, libelleReglement(s), s.nature === "remboursement" ? -s.montant : s.montant, s.recuLe, s.mode, s.nature, s.banque, s.numeroCheque, s.titulaire, s.compte, s.datePrevue ?? null, s.commentaire, s.factureId ?? null]);
  await noter(s.dossierId, `Règlement du ${dateFr(s.recuLe)} modifié (${fr(s.montant)}${numero ? ` · facture ${numero}` : " · au crédit du dossier"})`);
  await apres(s.dossierId);
  return { ok: true };
}

export async function supprimerReglement(id: number): Promise<Issue> {
  await exiger();
  const m = await reglementModifiable(id);
  if (m.erreur) return refus(m.erreur);
  const r = m.reglement!;
  await q("delete from paiements where id=$1", [id]);
  await noter(r.dossier_id, `Règlement supprimé : ${r.libelle} (${fr(Number(r.montant))})`);
  await apres(r.dossier_id);
  return { ok: true };
}

/**
 * « Réaffecter » (Créagidem : Réaf. Ar.) : un règlement passe à une autre
 * facture du dossier, au crédit du dossier (sans facture), ou à un autre
 * dossier — des arrhes versées pour une commande annulée, reprises sur la
 * suivante. Un règlement qui solde une facture reste où il est.
 */
export async function reaffecterReglement(id: number, cible: { factureId?: number | null; dossierRef?: string | null }): Promise<Issue> {
  await exiger();
  const r = await q1(`select p.*, p.montant::float8 as montant, f.numero as facture_numero, f.statut as facture_statut from paiements p
      left join factures f on f.id = p.facture_id where p.id = $1`, [id]);
  if (!r) return refus("Règlement introuvable.");
  if (r.facture_statut === "payee") return refus(`Ce règlement solde la facture ${r.facture_numero} : une facture soldée ne se modifie plus.`);
  let dossier: number = r.dossier_id;
  const ref = cible.dossierRef?.trim().toUpperCase();
  if (ref) {
    const autre = await q1<{ id: number }>("select id from dossiers where upper(ref) = $1", [ref]);
    if (!autre) return refus(`Aucun dossier ${ref}.`);
    dossier = autre.id;
    if (cible.factureId) return refus("Vers un autre dossier, le règlement va au crédit de ce dossier : affectez-le ensuite à sa facture.");
  }
  let numero: string | null = null;
  if (cible.factureId) {
    const a = await factureAffectable(cible.factureId, dossier, Number(r.montant), id);
    if (a.erreur) return refus(a.erreur);
    numero = a.facture!.numero;
  }
  await q("update paiements set dossier_id=$2, facture_id=$3 where id=$1", [id, dossier, cible.factureId ?? null]);
  const refs = await q<{ id: number; ref: string }>("select id, ref from dossiers where id = any($1)", [[r.dossier_id, dossier]]);
  const refDe = (x: number) => refs.find((d) => d.id === x)?.ref ?? String(x);
  const vers = numero ? `à la facture ${numero}` : "au crédit du dossier";
  if (dossier !== r.dossier_id) {
    await noter(r.dossier_id, `Règlement de ${fr(Number(r.montant))} réaffecté au dossier ${refDe(dossier)}`);
    await noter(dossier, `Règlement de ${fr(Number(r.montant))} repris du dossier ${refDe(r.dossier_id)} · ${vers}`);
  } else {
    await noter(dossier, `Règlement de ${fr(Number(r.montant))} réaffecté ${vers}`);
  }
  if (cible.factureId) await terminerSiSoldeRegle(dossier);
  await apres(r.dossier_id, dossier);
  return { ok: true };
}

/* ---------- émettre une facture ---------- */

const Ligne = z.object({
  genre: z.enum(["prestation", "texte", "deduction"]),
  libelle: z.string().trim().max(300),
  detail: texte(500),
  quantite: z.number().finite().min(-100000).max(100000),
  unite: texte(20),
  prixUnitaireHt: z.number().finite().min(-10_000_000).max(10_000_000),
  tauxTva: z.number().finite().min(0).max(100),
  factureDeduiteId: z.number().int().positive().nullable().optional(),
});
const SaisieFacture = z.object({
  dossierId: z.number().int().positive(),
  genre: z.enum(["facture", "solde", "acompte"]),
  objet: z.string().trim().min(1, "Donnez un objet à la facture.").max(200),
  dateMode: z.enum(["jour", "chargement", "livraison", "libre"]),
  date: jour.nullable().optional(),
  echeance: jour.nullable().optional(),
  conditions: texte(1500),
  bonCommande: texte(80),
  lignes: z.array(Ligne).min(1, "Ajoutez au moins une ligne.").max(200),
  affecter: z.array(z.number().int().positive()).max(100).default([]),
  devisId: z.number().int().positive().nullable().optional(),
});
export type SaisieFacture = z.input<typeof SaisieFacture>;

async function prochainNumero(db: Db, prefixe: "FA" | "AV", annee: string) {
  await db.query("select pg_advisory_xact_lock(hashtext($1))", [`bailly.crm.numero.${prefixe}`]);
  const [r] = await db.query<{ n: number }>("select coalesce(max(substring(numero from '[0-9]+$')::int),0) + 1 as n from factures where numero like $1", [`${prefixe}-${annee}-%`]);
  return `${prefixe}-${annee}-${String(r.n).padStart(4, "0")}`;
}

/** Le payeur figé sur la facture : le client payeur du dossier, sinon son client. */
async function payeurDuDossier(dossierId: number): Promise<{ payeur: Payeur; origineId: number; payeurId: number | null }> {
  const d = await q1("select client_id, payeur_client_id from dossiers where id=$1", [dossierId]);
  const cols = "id,type,civilite,prenom,nom,societe,email,telephone,facturation_adresse,facturation_cp,facturation_ville,facturation_pays,siren,tva_intracom";
  const c = await q1(`select ${cols} from clients where id=$1`, [d!.payeur_client_id ?? d!.client_id]);
  return { payeur: payeurDe(c)!, origineId: d!.client_id, payeurId: d!.payeur_client_id ?? null };
}

export async function emettreFacture(saisie: SaisieFacture): Promise<Issue> {
  const u = await exiger();
  const p = SaisieFacture.safeParse(saisie);
  if (!p.success) return refus(p.error.issues[0]?.message ?? "Saisie incomplète.");
  const s = p.data;
  const d = await q1("select id, ref, statut, date_chargement, date_livraison from dossiers where id=$1", [s.dossierId]);
  if (!d) return refus("Dossier introuvable.");

  // La date de facturation : du jour, du chargement, de la livraison, ou choisie.
  const date = s.dateMode === "jour" ? aujourdhuiParis() : s.dateMode === "chargement" ? jourIso(d.date_chargement) : s.dateMode === "livraison" ? jourIso(d.date_livraison) : s.date ?? null;
  if (!date) return refus(s.dateMode === "chargement" ? "Le dossier n'a pas de date de chargement : posez-la au planning ou choisissez une autre date." : s.dateMode === "livraison" ? "Le dossier n'a pas de date de livraison : posez-la au planning ou choisissez une autre date." : "Indiquez la date de la facture.");
  if (date > aujourdhuiParis()) return refus("Une facture ne se date pas dans le futur.");
  if (s.echeance && s.echeance < date) return refus("L'échéance précède la date de la facture.");

  const lignes: LigneSaisie[] = s.lignes.filter((l) => l.libelle || l.genre !== "texte").map((l) => ({ ...l, libelle: l.libelle || "Prestation" }));
  if (lignes.some((l) => l.genre === "deduction" && !l.factureDeduiteId)) return refus("Une ligne de déduction doit reprendre une facture d'arrhes.");
  if (s.genre !== "solde" && lignes.some((l) => l.genre === "deduction")) return refus("Seule la facture de solde déduit les factures d'arrhes.");
  const t = totaux(lignes);
  if (t.ttc < 0) return refus("Le total est négatif : c'est un avoir, pas une facture.");
  if (s.genre === "acompte" && t.ttc <= 0) return refus("Une facture d'arrhes a un montant.");

  // Les factures d'arrhes déduites : de ce dossier, actives, pas déjà déduites ailleurs.
  const deduites = [...new Set(lignes.map((l) => l.factureDeduiteId).filter((x): x is number => !!x))];
  if (deduites.length) {
    const ok = await q<{ id: number; numero: string; deja: string | null }>(`select f.id, f.numero,
        (select x.numero from factures_lignes l join factures x on x.id = l.facture_id where l.facture_deduite_id = f.id and x.statut <> 'annulee' and x.genre <> 'avoir' limit 1) as deja
        from factures f where f.id = any($1) and f.dossier_id = $2 and f.genre = 'acompte' and f.statut <> 'annulee'`, [deduites, s.dossierId]);
    if (ok.length !== deduites.length) return refus("Une facture d'arrhes déduite n'est pas valable (annulée ou d'un autre dossier).");
    const deja = ok.find((x) => x.deja);
    if (deja) return refus(`La facture d'arrhes ${deja.numero} est déjà déduite sur la facture ${deja.deja}.`);
  }
  // Les règlements affectés : du dossier, libres, et pas plus que la facture.
  const regs = s.affecter.length
    ? await q<{ id: number; montant: number }>("select id, montant::float8 as montant from paiements where id = any($1) and dossier_id = $2 and facture_id is null and montant > 0", [s.affecter, s.dossierId])
    : [];
  if (regs.length !== s.affecter.length) return refus("Un règlement choisi n'est plus libre : rechargez la page.");
  const affecte = arrondi(regs.reduce((a, r) => a + r.montant, 0));
  if (affecte - t.ttc > 0.004) return refus(`Les règlements choisis (${fr(affecte)}) dépassent le total de la facture (${fr(t.ttc)}). Décochez-en un : il restera au crédit du dossier.`);

  const { payeur, origineId, payeurId } = await payeurDuDossier(s.dossierId);
  const mentions = Object.fromEntries(Object.entries(await mentionsEmetteur()).filter(([, v]) => v != null && v !== ""));
  const annee = date.slice(0, 4);

  let r: { id: number; numero: string } | { erreur: string };
  try {
    r = await transaction(async (db) => {
      const numero = await prochainNumero(db, "FA", annee);
      const [dern] = await db.query<{ le: Date | null; numero: string | null }>("select emise_le as le, numero from factures where numero like 'FA-%' order by emise_le desc, id desc limit 1");
      if (dern?.le && jourIso(dern.le)! > date) return { erreur: `La date choisie (${dateFr(date)}) précède celle de la facture ${dern.numero} (${dateFr(jourIso(dern.le)!)}) : la numérotation des factures doit rester chronologique. Choisissez la date du jour.` };
      const [f] = await db.query<{ id: number }>(
        `insert into factures(dossier_id, numero, objet, montant, montant_ht, montant_tva, statut, emise_le, genre, devis_id, date_mode, echeance_le, conditions_reglement,
           bon_commande, origine_client_id, payeur_client_id, payeur, mentions, emise_par)
         values($1,$2,$3,$4,$5,$6,'emise',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
        [s.dossierId, numero, s.objet, t.ttc, t.ht, t.tva, date, s.genre, s.devisId ?? null, s.dateMode, s.echeance ?? null, s.conditions, s.bonCommande,
          origineId, payeurId, JSON.stringify(payeur), JSON.stringify(mentions), u.id]);
      let ordre = 0;
      for (const l of t.lignes) {
        await db.query(`insert into factures_lignes(facture_id, ordre, genre, libelle, detail, quantite, unite, prix_unitaire_ht, taux_tva, montant_ht, montant_tva, montant_ttc, facture_deduite_id)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [f.id, ordre++, l.genre, l.libelle, l.detail ?? null, l.quantite, l.unite ?? null, l.prixUnitaireHt, l.tauxTva, l.ht, l.tva, l.ttc, l.factureDeduiteId ?? null]);
      }
      if (regs.length) await db.query("update paiements set facture_id=$1 where id = any($2)", [f.id, regs.map((x) => x.id)]);
      if (t.ttc === 0) await db.query("update factures set statut='payee', payee_le=$2 where id=$1", [f.id, date]);
      return { id: f.id, numero };
    });
  } catch (e) {
    return refus(`La facture n'a pas pu être enregistrée : ${e instanceof Error ? e.message : "erreur inconnue"}.`);
  }
  if ("erreur" in r) return refus(r.erreur);
  await q("update dossiers set bon_commande=coalesce($2, bon_commande) where id=$1", [s.dossierId, s.bonCommande]);
  const modeDate = s.dateMode === "jour" ? "" : ` · datée du ${s.dateMode === "chargement" ? "chargement" : s.dateMode === "livraison" ? "jour de livraison" : dateFr(date)}`;
  await noter(s.dossierId, `${GENRE[s.genre]} ${r.numero} émise : ${fr(t.ttc)} TTC${affecte ? ` · ${fr(affecte)} déjà réglés` : ""}${modeDate}`);
  await apres(s.dossierId);
  revalidatePath("/factures");
  return { ok: true, id: r.id, numero: r.numero };
}

/* ---------- facturer une période de garde-meuble ---------- */

/**
 * La facture d'une période d'un contrat de garde-meuble, émise comme les
 * autres : numéro FA- sous verrou et chronologique, une ligne HT/TVA au taux
 * par défaut, le payeur et les mentions figés. Le montant est recalculé ici
 * (loyer × mois de la période), jamais repris du navigateur. Le loyer est lu
 * TTC, comme tous les montants saisis du CRM.
 */
export async function facturerPeriodeGardeMeuble(contratId: number): Promise<Issue> {
  const u = await exiger();
  const g = await q1<Row>(
    "select id, dossier_id, client, nb_caisses, periodicite, loyer_mensuel::float8 as loyer, actif from garde_meuble where id=$1",
    [contratId],
  );
  if (!g) return refus("Contrat introuvable.");
  if (!g.actif) return refus("Ce contrat est clos : il ne se facture plus.");
  const mois = g.periodicite === "trimestrielle" ? 3 : 1;
  const montant = arrondi(Number(g.loyer ?? 0) * mois);
  if (montant <= 0) return refus("Le loyer du contrat est à 0 € : rien à facturer.");
  const reglages = await reglagesFacturation();
  const taux = tauxParDefaut(reglages);
  const objet = `Garde-meuble (${g.periodicite}) : ${g.nb_caisses} caisse(s)`;
  const t = totaux([{ genre: "prestation", libelle: objet, quantite: 1, prixUnitaireHt: arrondi(montant / (1 + taux / 100)), tauxTva: taux }]);
  const date = aujourdhuiParis();
  const p = g.dossier_id ? await payeurDuDossier(g.dossier_id) : null;
  const payeur: Payeur = p?.payeur ?? {
    clientId: null, type: null, nom: g.client, contact: null, email: null, telephone: null,
    adresse: null, codePostal: null, ville: null, pays: null, siren: null, tvaIntracom: null,
  };
  const mentions = Object.fromEntries(Object.entries(await mentionsEmetteur()).filter(([, v]) => v != null && v !== ""));

  let r: { id: number; numero: string } | { erreur: string };
  try {
    r = await transaction(async (db) => {
      const numero = await prochainNumero(db, "FA", date.slice(0, 4));
      const [dern] = await db.query<{ le: Date | null; numero: string | null }>("select emise_le as le, numero from factures where numero like 'FA-%' order by emise_le desc, id desc limit 1");
      if (dern?.le && jourIso(dern.le)! > date) return { erreur: `La facture ${dern.numero} est datée du ${dateFr(jourIso(dern.le)!)} : la numérotation des factures doit rester chronologique.` };
      const [f] = await db.query<{ id: number }>(
        `insert into factures(dossier_id, garde_meuble_id, numero, objet, montant, montant_ht, montant_tva, statut, emise_le, genre, origine_client_id, payeur_client_id, payeur, mentions, emise_par)
         values($1,$2,$3,$4,$5,$6,$7,'emise',$8,'facture',$9,$10,$11,$12,$13) returning id`,
        [g.dossier_id, g.id, numero, objet, t.ttc, t.ht, t.tva, date, p?.origineId ?? null, p?.payeurId ?? null, JSON.stringify(payeur), JSON.stringify(mentions), u.id],
      );
      const l = t.lignes[0];
      await db.query(
        `insert into factures_lignes(facture_id, ordre, genre, libelle, quantite, prix_unitaire_ht, taux_tva, montant_ht, montant_tva, montant_ttc)
         values($1,0,'prestation',$2,1,$3,$4,$5,$6,$7)`,
        [f.id, objet, l.prixUnitaireHt, l.tauxTva, l.ht, l.tva, l.ttc],
      );
      await db.query("update garde_meuble set derniere_facture=$2 where id=$1", [g.id, date]);
      return { id: f.id, numero };
    });
  } catch (e) {
    return refus(`La facture n'a pas pu être enregistrée : ${e instanceof Error ? e.message : "erreur inconnue"}.`);
  }
  if ("erreur" in r) return refus(r.erreur);
  await noter(g.dossier_id, `Facture de garde-meuble ${r.numero} émise (${g.client}) : ${fr(t.ttc)} TTC`);
  await apres(g.dossier_id);
  revalidatePath("/factures");
  revalidatePath("/garde-meuble");
  revalidatePath(`/garde-meuble/${g.id}`);
  return { ok: true, id: r.id, numero: r.numero };
}

/* ---------- annuler par un avoir ---------- */

export async function annulerParAvoir(factureId: number, motif: string): Promise<Issue> {
  const u = await exiger();
  const m = motif.trim().slice(0, 500);
  if (!m) return refus("Indiquez le motif de l'annulation : il figure sur l'avoir.");
  const f = await q1("select f.*, f.montant::float8 as ttc from factures f where f.id=$1", [factureId]);
  if (!f) return refus("Facture introuvable.");
  if (f.genre === "avoir") return refus("Un avoir ne s'annule pas.");
  if (f.statut === "annulee") return refus(`La facture ${f.numero} est déjà annulée.`);
  const dessus = await q1<{ numero: string }>(`select x.numero from factures_lignes l join factures x on x.id = l.facture_id
      where l.facture_deduite_id = $1 and x.statut <> 'annulee' and x.genre <> 'avoir' limit 1`, [factureId]);
  if (dessus) return refus(`Cette facture d'arrhes est déduite sur la facture ${dessus.numero} : annulez d'abord celle-ci.`);
  const aujourd = aujourdhuiParis();
  let r: { id: number; numero: string; liberes: number };
  try {
    r = await transaction(async (db) => {
      const numero = await prochainNumero(db, "AV", aujourd.slice(0, 4));
      const mentions = Object.fromEntries(Object.entries(await mentionsEmetteur()).filter(([, v]) => v != null && v !== ""));
      // L'avoir reprend la facture, ligne pour ligne, pour le même montant ; il ne se règle pas (statut « payée »).
      const [a] = await db.query<{ id: number }>(
        `insert into factures(dossier_id, garde_meuble_id, numero, objet, montant, montant_ht, montant_tva, statut, emise_le, payee_le, genre, facture_origine_id, devis_id,
           date_mode, origine_client_id, payeur_client_id, payeur, mentions, motif, emise_par, bon_commande)
         select dossier_id, garde_meuble_id, $2, 'Avoir sur la facture ' || numero, montant, montant_ht, montant_tva, 'payee', $3, $3, 'avoir', id, devis_id,
           'jour', origine_client_id, payeur_client_id, payeur, $4, $5, $6, bon_commande from factures where id = $1 returning id`,
        [factureId, numero, aujourd, JSON.stringify(mentions), m, u.id]);
      const lignes = await db.query("select count(*)::int as n from factures_lignes where facture_id=$1", [factureId]);
      if ((lignes[0] as Row).n > 0) {
        await db.query(`insert into factures_lignes(facture_id, ordre, genre, libelle, detail, quantite, unite, prix_unitaire_ht, taux_tva, montant_ht, montant_tva, montant_ttc, facture_deduite_id)
            select $2, ordre, genre, libelle, detail, quantite, unite, prix_unitaire_ht, taux_tva, montant_ht, montant_tva, montant_ttc, facture_deduite_id from factures_lignes where facture_id=$1`, [factureId, a.id]);
      }
      const liberes = await db.query<{ id: number }>("update paiements set facture_id=null where facture_id=$1 returning id", [factureId]);
      await db.query("update factures set statut='annulee', annulee_le=$2, motif=coalesce(motif, $3) where id=$1", [factureId, aujourd, m]);
      return { id: a.id, numero, liberes: liberes.length };
    });
  } catch (e) {
    return refus(`L'avoir n'a pas pu être émis : ${e instanceof Error ? e.message : "erreur inconnue"}.`);
  }
  await noter(f.dossier_id, `Facture ${f.numero} annulée par l'avoir ${r.numero} (${fr(f.ttc)}) · motif : ${m}${r.liberes ? ` · ${r.liberes} règlement(s) remis au crédit du dossier` : ""}`);
  await apres(f.dossier_id);
  revalidatePath("/factures");
  return { ok: true, id: r.id, numero: r.numero };
}

/* ---------- le client payeur ---------- */

export async function chercherPayeurs(texteCherche: string, dossierId?: number | null) {
  await exiger();
  const exclure = dossierId ? (await q1<{ client_id: number }>("select client_id from dossiers where id=$1", [dossierId]))?.client_id : null;
  return chercherClients(String(texteCherche ?? "").slice(0, 80), exclure);
}

/** « Client facturé : lui-même / un compte » : le payeur du dossier (null : le client lui-même) et le bon de commande du compte. */
export async function choisirPayeur(dossierId: number, payeurClientId: number | null, bonCommande?: string | null): Promise<Issue> {
  await exiger();
  const d = await q1("select id, client_id from dossiers where id=$1", [dossierId]);
  if (!d) return refus("Dossier introuvable.");
  const payeur = payeurClientId && payeurClientId !== d.client_id ? payeurClientId : null;
  let nom = "le client lui-même";
  if (payeur) {
    const c = await q1("select nom, prenom, societe from clients where id=$1", [payeur]);
    if (!c) return refus("Ce client n'existe plus.");
    nom = c.societe || [c.prenom, c.nom].filter(Boolean).join(" ");
  }
  const bc = bonCommande?.trim().slice(0, 80) || null;
  await q("update dossiers set payeur_client_id=$2, bon_commande=$3 where id=$1", [dossierId, payeur, bc]);
  await noter(dossierId, `Client facturé : ${nom}${bc ? ` · bon de commande ${bc}` : ""}`);
  await apres(dossierId);
  return { ok: true };
}

const SaisieAdresse = z.object({
  adresse: texte(300), codePostal: texte(20), ville: texte(120), pays: texte(60), siren: texte(20), tvaIntracom: texte(30),
});
const SaisiePayeur = SaisieAdresse.extend({
  type: z.enum(["compte", "partenaire", "particulier", "militaire", "logement_social"]),
  societe: texte(160), civilite: texte(20), prenom: texte(80), nom: texte(120), email: texte(160), telephone: texte(40),
});
export type SaisiePayeur = z.input<typeof SaisiePayeur>;
export type SaisieAdresse = z.input<typeof SaisieAdresse>;

/** Un nouveau client payeur (un compte, une entreprise), créé et choisi pour le dossier. */
export async function creerPayeur(dossierId: number, saisie: SaisiePayeur, bonCommande?: string | null): Promise<Issue> {
  await exiger();
  const p = SaisiePayeur.safeParse(saisie);
  if (!p.success) return refus(p.error.issues[0]?.message ?? "Saisie incomplète.");
  const s = p.data;
  if (!s.societe && !s.nom) return refus("Donnez au moins la société ou le nom du payeur.");
  if (!(await q1("select 1 from dossiers where id=$1", [dossierId]))) return refus("Dossier introuvable.");
  const c = await q1<{ id: number }>(`insert into clients(type, civilite, prenom, nom, societe, email, telephone, facturation_adresse, facturation_cp, facturation_ville, facturation_pays, siren, tva_intracom)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [s.type, s.civilite, s.prenom, s.nom ?? s.societe, s.societe, s.email, s.telephone, s.adresse, s.codePostal, s.ville, s.pays, s.siren, s.tvaIntracom]);
  return choisirPayeur(dossierId, c!.id, bonCommande);
}

/** L'adresse de facturation d'un client (le client du dossier ou son payeur), et ses identifiants d'entreprise. */
export async function majAdresseFacturation(clientId: number, saisie: SaisieAdresse, dossierId?: number | null): Promise<Issue> {
  await exiger();
  const p = SaisieAdresse.safeParse(saisie);
  if (!p.success) return refus(p.error.issues[0]?.message ?? "Saisie incomplète.");
  const s = p.data;
  const c = await q1("select id, nom, prenom, societe from clients where id=$1", [clientId]);
  if (!c) return refus("Client introuvable.");
  await q("update clients set facturation_adresse=$2, facturation_cp=$3, facturation_ville=$4, facturation_pays=$5, siren=$6, tva_intracom=$7 where id=$1",
    [clientId, s.adresse, s.codePostal, s.ville, s.pays, s.siren, s.tvaIntracom]);
  if (dossierId) await noter(dossierId, `Adresse de facturation de ${c.societe || [c.prenom, c.nom].filter(Boolean).join(" ")} mise à jour`);
  await apres(dossierId);
  return { ok: true };
}

/* ---------- les réglages (Paramètres › Facturation) ---------- */

export async function lireReglagesFacturation(): Promise<{ reglages: Reglages; entreprise: { siret: string | null; adresse: string | null; nom: string } }> {
  await exiger();
  const [reglages, m] = await Promise.all([reglagesFacturation(), mentionsEmetteur()]);
  return { reglages, entreprise: { siret: m.siret, adresse: m.adresseLibre, nom: m.nom } };
}

export async function enregistrerReglagesFacturation(saisie: Partial<Record<keyof Reglages, string | number | null>>): Promise<Issue> {
  const u = await exiger();
  const valeurs: (string | number | null)[] = [];
  for (const k of CHAMPS_REGLAGES) {
    const v = saisie[k];
    if (k === "delai_paiement_jours") {
      const x = v === "" || v == null ? null : Math.round(Number(v));
      if (x != null && (!Number.isFinite(x) || x < 0 || x > 365)) return refus("Le délai de paiement se compte en jours, de 0 à 365.");
      valeurs.push(x);
    } else if (k === "taux_tva_defaut") {
      const x = v === "" || v == null ? null : Number(String(v).replace(",", "."));
      if (x != null && (!Number.isFinite(x) || x < 0 || x > 100)) return refus("Le taux de TVA est un pourcentage, de 0 à 100.");
      valeurs.push(x);
    } else {
      valeurs.push(v == null ? null : String(v).trim().slice(0, 2000) || null);
    }
  }
  const cols = CHAMPS_REGLAGES.join(",");
  const params = CHAMPS_REGLAGES.map((_, i) => `$${i + 1}`).join(",");
  const maj = CHAMPS_REGLAGES.map((k) => `${k}=excluded.${k}`).join(",");
  await q(`insert into facturation_reglages(id, ${cols}, maj_le, maj_par) values(true, ${params}, now(), $${CHAMPS_REGLAGES.length + 1})
      on conflict (id) do update set ${maj}, maj_le=now(), maj_par=excluded.maj_par`, [...valeurs, u.nom]);
  revalidatePath("/dashboard/parametres/facturation");
  revalidatePath("/(interne)", "layout");
  return { ok: true };
}
