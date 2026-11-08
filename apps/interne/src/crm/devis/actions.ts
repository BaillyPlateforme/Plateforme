"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { q, q1, transaction, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { projeterEspace, signerDevisUnique } from "@/crm/lib/espace";
import { envoyerDevisParEmail } from "@/crm/envois";
import { encaisser } from "@/crm/facturation/actions";
import { formules } from "@/crm/lib/tarif";
import {
  FORMULES, lireAchats, lireAssurance, lireInternational, lireLignes, lireMoyens, lirePrestations,
  nomDevis, nouvelId, prestationsType, type EtatDevis, type Formule,
} from "./modele";
import { calculer, lignesPourBase, r2 } from "./calcul";
import { copierDevisDans } from "./copie";
import { chercherModeles, lireParametres } from "./donnees";
import { CLES_PARAMETRES, PARAMETRES_VIDES, effectifs, type ParametresDevis } from "./parametres";

/*
 * Les actions du devis complet (audit Créagidem, sections H à K). Comme
 * toutes celles du CRM, chacune vérifie d'abord la session : une action
 * serveur peut être appelée depuis n'importe quelle adresse de l'app.
 */

const exiger = () => currentUser();
const s = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const n = (f: FormData, k: string) => { const v = s(f, k); if (v == null) return null; const x = Number(v.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(x) ? x : null; };
const texte = (v: unknown, max = 4000) => String(v ?? "").slice(0, max);
const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const aujourdhui = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const plusJours = (j: number) => { const d = new Date(`${aujourdhui()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + j); return d.toISOString().slice(0, 10); };
const FORMULE_OK = (v: unknown): v is Formule => FORMULES.some((f) => f.cle === v);

async function noter(dossierId: number, libelle: string) {
  const u = await currentUser();
  await q("insert into activite(dossier_id,utilisateur_id,libelle) values($1,$2,$3)", [dossierId, u.id, libelle]);
  await q("update dossiers set maj_le=now() where id=$1", [dossierId]);
  // Le dossier a changé : son espace client suit (devis envoyés, montants).
  await projeterEspace(dossierId);
}
function rafraichir(dossierId: number, devisId?: number) {
  revalidatePath("/(interne)", "layout");
  revalidatePath(`/dossiers/${dossierId}`);
  if (devisId) revalidatePath(`/dossiers/${dossierId}/devis/${devisId}`);
}
async function numero() {
  const an = new Date().getFullYear();
  const r = await q1<{ n: number }>("select coalesce(max(substring(numero from '[0-9]+$')::int),0) + 1 as n from devis where numero like $1", [`DV-${an}-%`]);
  return `DV-${an}-${String(r!.n).padStart(4, "0")}`;
}
/** Insère un devis ; le numéro est repris en cas de collision (deux créations simultanées). */
async function inserer(colonnes: Record<string, unknown>) {
  for (let essai = 0; essai < 3; essai++) {
    const c: Record<string, unknown> = { ...colonnes, numero: await numero() };
    const cles = Object.keys(c);
    try {
      const r = await q1<{ id: number }>(
        `insert into devis(${cles.join(",")}) values(${cles.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
        cles.map((k) => { const v = c[k]; return v !== null && typeof v === "object" ? JSON.stringify(v) : v; }),
      );
      return r!.id;
    } catch (e) {
      if (!(e instanceof Error && /devis_numero_key/.test(e.message)) || essai === 2) throw e;
    }
  }
  throw new Error("numéro de devis introuvable");
}

/* ---------- enregistrer la fenêtre Devis ---------- */

export type IssueEnregistrement = { ok: true; maj: string; montant: number } | { ok: false; erreur: string };

/**
 * « Enregistrer » : tout l'état de la fenêtre Devis d'un geste, comme le
 * « Valider » de Créagidem. Les champs du dossier (type, adresses et accès,
 * remarques…) sont ceux du dossier : la fiche les voit aussitôt.
 * `maj` protège d'un enregistrement fait entre-temps par quelqu'un d'autre.
 */
export async function enregistrerDevis(devisId: number, brut: EtatDevis, maj: string | null): Promise<IssueEnregistrement> {
  await exiger();
  const v = await q1<{ dossier_id: number; numero: string; maj_le: Date | null; client_id: number }>(
    "select v.dossier_id, v.numero, v.maj_le, d.client_id from devis v join dossiers d on d.id=v.dossier_id where v.id=$1", [devisId]);
  if (!v) return { ok: false, erreur: "Ce devis n'existe plus." };
  if (v.maj_le && maj !== new Date(v.maj_le).toISOString()) {
    return { ok: false, erreur: "Ce devis a été enregistré entre-temps par quelqu'un d'autre. Rechargez la page pour voir sa version." };
  }
  const p = await lireParametres();
  const eff = effectifs(p);
  const c = brut.contrat ?? ({} as EtatDevis["contrat"]);
  const chiffrage = {
    mode: brut.chiffrage?.mode === "forfait" ? "forfait" as const : "postes" as const,
    saisie: brut.chiffrage?.saisie === "ht" ? "ht" as const : "ttc" as const,
    remisePct: Math.min(100, Math.max(0, nombre(brut.chiffrage?.remisePct) ?? 0)),
    lignes: lireLignes(brut.chiffrage?.lignes).map((l) => ({ ...l, libelle: texte(l.libelle, 300), detail: texte(l.detail, 300), unite: texte(l.unite, 20) })).slice(0, 200),
    assurance: lireAssurance(brut.chiffrage?.assurance),
  };
  const calcul = calculer(chiffrage, eff.tvaAssurance);
  const tvaAssurance = chiffrage.assurance.tva ?? eff.tvaAssurance;
  const lignes = lignesPourBase(chiffrage, calcul, tvaAssurance);
  const prestations = lirePrestations(brut.prestations).map((x) => ({ ...x, libelle: texte(x.libelle, 300) })).slice(0, 60);
  const achats = lireAchats(brut.achats, []).slice(0, 100);
  const moyens = lireMoyens(brut.moyens);
  const international = lireInternational(brut.international);
  const dos = brut.dossier ?? ({} as EtatDevis["dossier"]);
  const TYPES_D = ["national", "international", "maritime", "aerien", "gm", "bureau"];
  const TYPES_C = ["particulier", "compte", "militaire", "partenaire", "logement_social"];

  const r = await transaction(async (db) => {
    const [row] = await db.query<{ maj_le: Date }>(
      `update devis set titre=$2, formule=$3, categorie_specifique=$4, categorie_libelle=$5, commercial_id=$6, date_devis=$7, date_visite=$8, validite=$9,
         distance_km=$10, poids_lourds=$11, deplacement=$12, groupage=$13, arrhes_pct=$14, reglement_solde=$15, conditions=$16, commentaire_interne=$17,
         ref_interne=$18, mode=$19, saisie=$20, remise_pct=$21, lignes=$22, montant=$23, montant_ht=$24, montant_tva=$25, prestations=$26, assurance=$27,
         achats=$28, moyens=$29, international=$30, maj_le=now()
       where id=$1 returning maj_le`,
      [
        devisId, texte(c.titre, 120) || null, FORMULE_OK(c.formule) ? c.formule : "libre", !!c.categorieSpecifique, texte(c.categorieLibelle, 120) || null,
        nombre(c.commercialId), date(c.dateDevis), date(c.dateVisite), date(c.validite),
        nombre(c.distanceKm) != null ? Math.round(nombre(c.distanceKm)!) : null, texte(c.poidsLourds, 300) || null, c.deplacement === "urbain" ? "urbain" : "route", !!c.groupage,
        nombre(c.arrhesPct) != null ? Math.min(100, Math.max(0, nombre(c.arrhesPct)!)) : null, texte(c.reglementSolde, 300) || null, texte(c.conditions) || null,
        texte(c.commentaireInterne) || null, texte(c.refInterne, 120) || null,
        chiffrage.mode, chiffrage.saisie, chiffrage.remisePct, JSON.stringify(lignes), calcul.ttc, calcul.ht, calcul.tva,
        JSON.stringify(prestations), JSON.stringify(chiffrage.assurance), JSON.stringify(achats), JSON.stringify(moyens), JSON.stringify(international),
      ],
    );
    await db.query("update dossiers set type_demenagement=$2, passer_en_dernier=$3, origine_demande=$4, observations=$5, maj_le=now() where id=$1", [
      v.dossier_id, TYPES_D.includes(String(dos.typeDemenagement)) ? dos.typeDemenagement : "national", !!dos.passerEnDernier,
      texte(dos.origineDemande, 120) || null, texte(dos.observations) || null,
    ]);
    if (TYPES_C.includes(String(dos.typeClient))) await db.query("update clients set type=$2 where id=$1", [v.client_id, dos.typeClient]);

    // Les adresses et les accès : ceux du dossier. Départ et arrivée ne se retirent jamais.
    const etapes = Array.isArray(brut.etapes) ? brut.etapes.slice(0, 12) : [];
    if (etapes.length) {
      const existantes = await db.query<{ id: number; genre: string }>("select id, genre from etapes_trajet where dossier_id=$1", [v.dossier_id]);
      const gardees = new Set<number>();
      for (const [i, e] of etapes.entries()) {
        const vals = [
          texte(e.adresse, 300) || null, texte(e.codePostal, 12) || null, texte(e.ville, 120) || null, texte(e.pays, 60) || null, texte(e.telephone, 40) || null,
          texte(e.etage, 20) || null, !!e.ascenseur, !!e.monteCharge, !!e.transbordement,
          nombre(e.portage) != null && nombre(e.portage)! >= 0 && nombre(e.portage)! <= 1000 ? Math.round(nombre(e.portage)!) : null,
          ["oui", "non", "a_evaluer"].includes(e.monteMeuble) ? e.monteMeuble : null,
          ["facile", "autorisation", "reserve_client"].includes(e.stationnement) ? e.stationnement : null, texte(e.acces, 500) || null,
        ];
        const ex = existantes.find((x) => x.id === e.id);
        if (ex) {
          gardees.add(ex.id);
          await db.query(`update etapes_trajet set ordre=$3, adresse=$4, code_postal=$5, ville=$6, pays=$7, telephone=$8, etage=$9, ascenseur=$10, monte_charge=$11,
            transbordement=$12, portage_m=$13, monte_meuble=$14, stationnement=$15, acces=$16 where id=$1 and dossier_id=$2`, [ex.id, v.dossier_id, i, ...vals]);
        } else {
          const genre = e.genre === "garde_meuble" ? "garde_meuble" : "autre";
          await db.query(`insert into etapes_trajet(dossier_id, ordre, genre, adresse, code_postal, ville, pays, telephone, etage, ascenseur, monte_charge, transbordement,
            portage_m, monte_meuble, stationnement, acces) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [v.dossier_id, i, genre, ...vals]);
        }
      }
      for (const ex of existantes) {
        if (!gardees.has(ex.id) && ["autre", "garde_meuble"].includes(ex.genre)) await db.query("delete from etapes_trajet where id=$1", [ex.id]);
      }
    }
    return row;
  });
  await noter(v.dossier_id, `Devis ${v.numero} enregistré · ${calcul.ttc.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} TTC`);
  rafraichir(v.dossier_id, devisId);
  return { ok: true, maj: new Date(r.maj_le).toISOString(), montant: calcul.ttc };
}

/* ---------- créer : devis libre, formules, copie ---------- */

async function contexteDossier(dossierId: number) {
  return q1<Row>(`select d.id, d.volume::float8 as volume, d.statut, d.commercial_id, d.type_demenagement,
      (select debut from rendez_vous where dossier_id=d.id and type in ('phys','visio') order by debut desc limit 1) as visite,
      (select distance_km from devis where dossier_id=d.id and distance_km is not null order by cree_le desc limit 1) as distance_km
    from dossiers d where d.id=$1`, [dossierId]);
}
async function colonnesCommunes(d: Row, p: ParametresDevis) {
  const u = await currentUser();
  const eff = effectifs(p);
  return {
    dossier_id: d.id,
    commercial_id: d.commercial_id ?? (u.role === "commercial" ? u.id : null),
    date_devis: aujourdhui(),
    date_visite: d.visite ? new Date(d.visite).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) : null,
    validite: plusJours(eff.validiteJours),
    arrhes_pct: eff.arrhesPct,
    distance_km: d.distance_km ?? null,
    maj_le: new Date().toISOString(),
  };
}
async function apresCreation(dossierId: number, libelle: string) {
  await q("update dossiers set statut='devis' where id=$1 and statut in ('prospect','visite')", [dossierId]);
  await q("update rendez_vous set devis_etabli=true where dossier_id=$1 and type in ('phys','visio')", [dossierId]);
  await noter(dossierId, libelle);
  rafraichir(dossierId);
}

/** Les cinq postes du tarif du CRM (lib/tarif.ts), libellés seuls : le prix se saisit. */
const POSTES_TARIF = () => formules(20)[0].lignes.map((l) => l.libelle);

/**
 * « Nouveau » : un devis libre (vierge, forfait ou 5 postes), une ou
 * plusieurs formules du tarif (seulement celles qu'on veut proposer), ou la
 * copie d'un devis — de ce dossier ou d'un autre client, pris pour modèle.
 */
export async function creerDevis(dossierId: number, f: FormData) {
  await exiger();
  const d = await contexteDossier(dossierId);
  if (!d) redirect("/devis");
  const p = await lireParametres();
  const eff = effectifs(p);
  const genre = s(f, "genre");

  if (genre === "formules") {
    const cles = f.getAll("formule").map(String).filter((k) => ["economique", "standard", "premium"].includes(k));
    if (!cles.length) redirect(`/devis?dossier=${dossierId}&nouveau=formules&erreur=formule`);
    const base = await colonnesCommunes(d, p);
    const ids: number[] = [];
    for (const fo of formules(d.volume > 0 ? d.volume : 0).filter((x) => cles.includes(x.cle))) {
      ids.push(await inserer({ ...base, formule: fo.cle, origine: "formules", saisie: "ttc", mode: "postes", lignes: fo.lignes, montant: fo.montant, prestations: prestationsType(fo.cle) }));
    }
    await apresCreation(dossierId, `${ids.length > 1 ? `${ids.length} formules établies` : "Formule établie"} : ${cles.map((k) => FORMULES.find((x) => x.cle === k)?.nom).join(", ")}`);
    redirect(ids.length === 1 ? `/dossiers/${dossierId}/devis/${ids[0]}` : `/devis?dossier=${dossierId}`);
  }

  if (genre === "copie") {
    const source = n(f, "source");
    if (!source) redirect(`/devis?dossier=${dossierId}&nouveau=copie&erreur=source`);
    const c = await copier(source, d, p);
    if (!c) redirect(`/devis?dossier=${dossierId}&nouveau=copie&erreur=source`);
    redirect(`/dossiers/${dossierId}/devis/${c.id}?onglet=chiffrage&duplique=${source}`);
  }

  // Devis libre.
  const formule: Formule = FORMULE_OK(s(f, "categorie")) ? (s(f, "categorie") as Formule) : "libre";
  const mode = s(f, "mode") === "postes" ? "postes" : "forfait";
  const libelles = mode === "postes" ? POSTES_TARIF() : ["Prix de base"];
  const lignes = libelles.map((libelle) => ({ id: nouvelId(), groupe: "base", libelle, qte: 1, pu: 0, tva: eff.tva, charge: "bailly", prix: 0 }));
  const id = await inserer({
    ...(await colonnesCommunes(d, p)), formule, titre: s(f, "titre"), origine: "libre", saisie: "ht", mode,
    lignes, montant: 0, montant_ht: 0, montant_tva: 0, prestations: prestationsType(formule),
  });
  await apresCreation(dossierId, `Devis libre créé (${mode === "postes" ? "5 postes" : "forfait"})`);
  redirect(`/dossiers/${dossierId}/devis/${id}?onglet=chiffrage`);
}

/**
 * La duplication d'un devis (src/crm/devis/copie.ts : ce qui suit et ce qui
 * ne suit pas), en brouillon, dans le dossier `d`. Le dossier d'origine, s'il
 * est un autre, garde la trace de la copie dans son fil.
 */
async function copier(sourceId: number, d: Row, p: ParametresDevis) {
  const u = await currentUser();
  const c = await transaction((db) => copierDevisDans(db, sourceId, d.id, p, u));
  if (!c) return null;
  const libelle = c.memeDossier
    ? `Devis ${c.source.numero} dupliqué en ${c.numero} (brouillon)`
    : `Devis ${c.numero} dupliqué depuis le devis ${c.source.numero} (${c.source.client}, dossier ${c.source.ref})${c.volumeDiffere ? " · montants à vérifier, le volume diffère" : ""}`;
  await apresCreation(d.id, libelle);
  if (!c.memeDossier) {
    const cible = await q1<{ ref: string }>("select ref from dossiers where id=$1", [d.id]);
    await noter(c.source.dossierId, `Devis ${c.source.numero} dupliqué vers le dossier ${cible?.ref ?? d.id} (${c.numero}, brouillon)`);
  }
  await journaliser({
    action: "devis.duplique", libelle, objet: { type: "devis", id: c.id }, dossierId: d.id, activite: libelle,
    details: { source: c.source.numero, numero: c.numero, dossier_source: c.source.ref, volume_differe: c.volumeDiffere || undefined },
  });
  return c;
}

/**
 * « Dupliquer » un devis (fiche du dossier, liste des devis, éditeur) : dans
 * son dossier (`cible` = son dossier) ou dans un autre, choisi dans la
 * fenêtre. La copie s'ouvre dans l'éditeur, avec un bandeau qui ramène au
 * devis d'origine.
 */
export async function dupliquerDevis(devisId: number, f: FormData) {
  await exiger();
  const v = await q1<{ dossier_id: number }>("select dossier_id from devis where id=$1", [devisId]);
  if (!v) redirect("/devis");
  const cible = n(f, "cible") ?? v.dossier_id;
  const d = await contexteDossier(cible);
  // Le dossier de destination a pu disparaître entre la recherche et l'envoi.
  if (!d) redirect(`/dossiers/${v.dossier_id}/devis/${devisId}?erreur=cible`);
  const c = await copier(devisId, d, await lireParametres());
  if (!c) redirect(`/dossiers/${v.dossier_id}/devis/${devisId}?erreur=cible`);
  redirect(`/dossiers/${cible}/devis/${c.id}?onglet=chiffrage&duplique=${devisId}`);
}

/** La recherche de la fenêtre « Dupliquer un devis » : tous les dossiers, du plus récent au plus ancien. */
export async function rechercherModeles(texteRecherche: string) {
  await exiger();
  const rows = await chercherModeles(texteRecherche);
  return rows.map((r) => ({
    id: r.id as number, numero: r.numero as string, nom: nomDevis(r), statut: r.statut as string, montant: r.montant as number,
    client: (r.societe as string) || [r.prenom, r.nom].filter(Boolean).join(" "), ref: r.ref as string, did: r.did as number,
    volume: r.volume as number, lignes: Number(r.nb_lignes ?? 0), mode: r.mode as string,
  }));
}

/* ---------- retirer, remettre ---------- */

/**
 * « Retirer une formule » : un brouillon est supprimé ; un devis déjà envoyé
 * reste au dossier, marqué retiré (il quitte la proposition et ne se signe
 * plus). Un devis signé ne se retire pas.
 */
export async function retirerDevis(devisId: number) {
  await exiger();
  const v = await q1<{ dossier_id: number; numero: string; statut: string; montant: number }>("select dossier_id, numero, statut, montant::float8 as montant from devis where id=$1", [devisId]);
  if (!v || v.statut === "signe") return;
  if (v.statut === "brouillon") {
    const parti = await q1("delete from devis where id=$1 and statut='brouillon' returning id", [devisId]);
    const libelle = `Devis ${v.numero} supprimé (brouillon)`;
    await noter(v.dossier_id, libelle);
    if (parti) await journaliser({ action: "devis.supprime", libelle, objet: { type: "devis", id: devisId }, dossierId: v.dossier_id, details: { numero: v.numero, statut: v.statut, montant: v.montant }, activite: libelle });
  } else {
    await q("update devis set statut='refuse', retire_le=now(), maj_le=now() where id=$1 and statut in ('envoye','refuse')", [devisId]);
    await noter(v.dossier_id, `Devis ${v.numero} retiré de la proposition`);
  }
  rafraichir(v.dossier_id);
  redirect(`/devis?dossier=${v.dossier_id}`);
}
export async function remettreDevis(devisId: number) {
  await exiger();
  const v = await q1<{ dossier_id: number; numero: string }>(
    `update devis set statut=case when envoye_le is null then 'brouillon' else 'envoye' end, retire_le=null, maj_le=now()
      where id=$1 and retire_le is not null and not exists (select 1 from devis x where x.dossier_id=devis.dossier_id and x.statut='signe')
      returning dossier_id, numero`, [devisId]);
  if (!v) return;
  await noter(v.dossier_id, `Devis ${v.numero} remis dans la proposition`);
  rafraichir(v.dossier_id, devisId);
}

/* ---------- signature, validation ---------- */

/** « Envoyer pour signature » : le lien part au client par e-mail (garde-fous de la plateforme). */
export async function envoyerPourSignatureDevis(devisId: number) {
  await exiger();
  const v = await q1<Row>(
    `update devis set token=coalesce(token, $2), statut='envoye', envoye_le=coalesce(envoye_le, now()), maj_le=now()
      where id=$1 and statut in ('brouillon','envoye') and retire_le is null
        and not exists (select 1 from devis x where x.dossier_id=devis.dossier_id and x.statut='signe')
      returning id, dossier_id, numero, formule, titre, categorie_specifique, categorie_libelle, montant::float8 as montant, token`,
    [devisId, randomBytes(12).toString("hex")],
  );
  if (!v) return;
  await q("update dossiers set statut='devis' where id=$1 and statut in ('prospect','visite')", [v.dossier_id]);
  await q("update rendez_vous set devis_etabli=true where dossier_id=$1 and type in ('phys','visio')", [v.dossier_id]);
  const e = await envoyerDevisParEmail(v.dossier_id, { id: v.id, numero: v.numero, formule: nomDevis(v), montant: v.montant, token: v.token });
  await noter(v.dossier_id, `Devis ${v.numero} envoyé pour signature électronique · e-mail ${e.libelle}`);
  rafraichir(v.dossier_id, devisId);
}

/** Le mode de règlement saisi, ramené aux modes de la facturation (« Chèque », « CB », « vir. »…). */
function modeReglement(m: string | null | undefined): "cheque" | "virement" | "carte" | "especes" | "prelevement" | "autre" {
  const t = (m ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (["cheque", "virement", "carte", "especes", "prelevement", "autre"].includes(t)) return t as "cheque";
  if (/^ch/.test(t)) return "cheque";
  if (/^vir/.test(t)) return "virement";
  if (/^(cb|carte)/.test(t)) return "carte";
  if (/^esp/.test(t)) return "especes";
  if (/^pr/.test(t)) return "prelevement";
  return "autre";
}

/**
 * « Valider » un devis (Créagidem, section J) : transfert en commande — la
 * signature, sous la règle de la base (un seul devis signé par dossier) — et,
 * si un montant est saisi, l'encaissement des arrhes avec ses références.
 * Les références du règlement sont gardées dans le devis (`validation`) ;
 * l'encaissement lui-même passe par le module de facturation (`encaisser`).
 */
export async function validerDevis(devisId: number, f: FormData) {
  const u = await exiger();
  const v = await q1<{ dossier_id: number; numero: string; statut: string }>("select dossier_id, numero, statut from devis where id=$1", [devisId]);
  if (!v) return;
  const issue = await signerDevisUnique(devisId, "equipe", { utilisateurId: u.id });
  if (issue !== "signe" && issue !== "deja_signe") {
    redirect(`/dossiers/${v.dossier_id}/devis/${devisId}?onglet=commande&erreur=${issue}`);
  }
  const montant = n(f, "montant");
  const detail = {
    date: s(f, "date") ?? aujourdhui(), montant, mode: s(f, "mode"), banque: s(f, "banque"), cheque: s(f, "cheque"), titulaire: s(f, "titulaire"),
    compte: s(f, "compte"), encaissement_prevu: s(f, "encaissement_prevu"), commentaire: s(f, "commentaire"), par: u.nom, le: new Date().toISOString(),
  };
  await q("update devis set validation=$2, maj_le=now() where id=$1", [devisId, JSON.stringify(detail)]);
  await noter(v.dossier_id, `Devis ${v.numero} validé en commande`);
  if (montant && montant > 0) {
    // L'encaissement passe par le module de facturation, comme tout règlement : mode, banque, chèque,
    // titulaire et compte dans leurs colonnes, fil d'activité, projection de l'espace client.
    const r = await encaisser({
      dossierId: v.dossier_id, nature: "arrhes", montant: r2(montant), mode: modeReglement(detail.mode),
      recuLe: date(detail.date) ?? aujourdhui(), datePrevue: date(detail.encaissement_prevu),
      banque: detail.banque, numeroCheque: detail.cheque, titulaire: detail.titulaire, compte: detail.compte,
      commentaire: [`Devis ${v.numero}`, detail.commentaire].filter(Boolean).join(" · "),
    });
    if (!r.ok) {
      await noter(v.dossier_id, `Arrhes du devis ${v.numero} non enregistrées : ${r.erreur}`);
      rafraichir(v.dossier_id, devisId);
      redirect(`/dossiers/${v.dossier_id}/devis/${devisId}?onglet=commande&erreur=encaissement`);
    }
  }
  rafraichir(v.dossier_id, devisId);
  redirect(`/dossiers/${v.dossier_id}/devis/${devisId}?onglet=commande&ok=valide`);
}

/* ---------- paramètres ---------- */

export async function enregistrerParametres(f: FormData) {
  const u = await exiger();
  const liste = (k: string) => String(f.get(k) ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 40);
  const valeurs: ParametresDevis = {
    ...PARAMETRES_VIDES,
    cgv: String(f.get("cgv") ?? "").slice(0, 60000),
    arrhesPct: n(f, "arrhesPct"), validiteJours: n(f, "validiteJours"), tvaDefaut: n(f, "tvaDefaut"), tvaAssurance: n(f, "tvaAssurance"),
    tauxContractuelle: n(f, "tauxContractuelle"), tauxDommage: n(f, "tauxDommage"),
    reglementsSolde: liste("reglementsSolde"), origines: liste("origines"), comptes: liste("comptes"), modesReglement: liste("modesReglement"),
  };
  for (const cle of CLES_PARAMETRES) {
    await q("insert into devis_parametres(cle, valeur, maj_le, maj_par) values($1,$2,now(),$3) on conflict (cle) do update set valeur=excluded.valeur, maj_le=now(), maj_par=excluded.maj_par",
      [cle, JSON.stringify(valeurs[cle]), u.nom]);
  }
  revalidatePath("/devis/parametres");
  redirect("/devis/parametres?ok=1");
}
