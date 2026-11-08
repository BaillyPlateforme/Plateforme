"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/crm/lib/auth";
import { q, q1 } from "@/crm/lib/db";
import { jourParis } from "@/crm/envois";
import { modeleDe, raisonDeNePasEnvoyer } from "@/crm/messages/catalogue";
import { apercuCarte, type Apercu } from "@/crm/messages/actions";
import { decider, duesPourLaVeille, envoyerRelance, listerRelances, reglesRelances, simulerRegle } from "./moteur";
import {
  CANAUX, creneauEnClair, defRelance, HEURE_VEILLE_UTC, JOURS, libelleCanal, plus, repereDe, SEGMENTS, validerRegle,
  type Canal, type Colonne, type ReglageRegle, type Regle, type TypeRelance,
} from "./regles";

/*
 * Les gestes de la section Relances : envoyer maintenant, repousser, annuler,
 * réactiver (Kanban) ; régler une règle, la simuler, exclure un dossier
 * (configuration). Chaque action revérifie que c'est l'équipe (currentUser).
 * Chaque modification de règle ou d'exclusion entre au journal
 * (crm.relances_journal).
 */

export type Retour = { ok: true; message?: string } | { ok: false; erreur: string };

const rafraichir = () => {
  revalidatePath("/relances", "layout");
  revalidatePath("/modeles");
};

export async function envoyerMaintenant(cle: string): Promise<Retour> {
  const u = await currentUser();
  const r = (await listerRelances()).find((x) => x.cle === cle);
  if (!r) return { ok: false, erreur: "Relance introuvable." };
  if (!["avenir", "aujourdhui", "retard"].includes(r.colonne)) return { ok: false, erreur: r.motif ?? "Cette relance ne peut pas partir." };
  const e = await envoyerRelance(r, u.nom);
  rafraichir();
  return e.ok ? { ok: true, message: `${r.libelle} : ${e.libelle}.` } : { ok: false, erreur: `${r.libelle} : ${e.libelle}.` };
}

export async function repousser(cle: string, jours: number): Promise<Retour> {
  const u = await currentUser();
  if (!Number.isInteger(jours) || jours < 1 || jours > 90) return { ok: false, erreur: "Délai invalide." };
  const au = new Date(Date.now() + jours * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  await decider(cle, { statut: "reportee", au }, u.nom);
  rafraichir();
  return { ok: true, message: `Relance repoussée au ${new Date(`${au}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.` };
}

export async function annuler(cle: string): Promise<Retour> {
  const u = await currentUser();
  await decider(cle, { statut: "annulee" }, u.nom);
  rafraichir();
  return { ok: true, message: "Relance annulée : la suite est arrêtée pour ce dossier." };
}

export async function reactiver(cle: string): Promise<Retour> {
  const u = await currentUser();
  await decider(cle, { statut: "reactivee" }, u.nom);
  rafraichir();
  return { ok: true, message: "Relance réactivée." };
}

// --- La configuration ----------------------------------------------------------------------------

const heures = (r: Pick<ReglageRegle, "heure_debut" | "heure_fin">) => (r.heure_debut == null && r.heure_fin == null ? "à toute heure" : `${r.heure_debut ?? 0} h – ${r.heure_fin ?? 24} h`);
const segments = (l: string[]) => (l.length ? l.map((s) => SEGMENTS.find((x) => x.cle === s)?.libelle ?? s).join(", ") : "aucun");
const jours = (l: number[] | null) => (l?.length ? l.map((n) => JOURS[n - 1].libelle.slice(0, 3)).join(", ") : "tous les jours");

/** Ce qui change d'une règle à l'autre, en clair : « Premier délai : 2 j → 3 j · Canaux : e-mail → e-mail, SMS ». */
function differences(type: TypeRelance, a: ReglageRegle, b: ReglageRegle): string[] {
  const def = defRelance(type)!;
  const out: string[] = [];
  const champ = (libelle: string, x: string, y: string) => x !== y && out.push(`${libelle} : ${x} → ${y}`);
  champ("Activation", a.actif ? "active" : "désactivée", b.actif ? "active" : "désactivée");
  champ("Premier délai", `${a.premier_delai_jours} j`, `${b.premier_delai_jours} j`);
  champ("Repère", repereDe(def, a.repere).libelle, repereDe(def, b.repere).libelle);
  champ("Intervalle", `${a.intervalle_jours} j`, `${b.intervalle_jours} j`);
  champ("Nombre au plus", String(a.nombre_max), String(b.nombre_max));
  champ("Canaux", a.canaux.map(libelleCanal).join(", "), b.canaux.map(libelleCanal).join(", "));
  champ("Jours d'envoi", jours(a.jours_envoi), jours(b.jours_envoi));
  champ("Heures d'envoi", heures(a), heures(b));
  champ("Segments exclus", segments(a.segments_exclus), segments(b.segments_exclus));
  return out;
}

const reglage = (r: Regle): ReglageRegle => ({
  actif: r.actif, premier_delai_jours: r.premier_delai_jours, intervalle_jours: r.intervalle_jours, nombre_max: r.nombre_max, repere: r.repere,
  canaux: r.canaux, jours_envoi: r.jours_envoi, heure_debut: r.heure_debut, heure_fin: r.heure_fin, segments_exclus: r.segments_exclus,
});

export async function enregistrerRegle(type: string, brut: Partial<ReglageRegle>): Promise<Retour> {
  const u = await currentUser();
  const v = validerRegle(type, brut);
  if (!v.ok) return v;
  const t = type as TypeRelance;
  const avant = (await reglesRelances()).get(t);
  if (!avant) return { ok: false, erreur: "Règle introuvable." };
  const r = v.regle;
  const diff = differences(t, reglage(avant), r);
  if (!diff.length) return { ok: true, message: "Rien n'a changé." };
  await q(
    `update relances_regles set actif=$2, premier_delai_jours=$3, intervalle_jours=$4, nombre_max=$5, repere=$6, canaux=$7, jours_envoi=$8,
            heure_debut=$9, heure_fin=$10, segments_exclus=$11, maj_le=now(), maj_par=$12 where type=$1`,
    [t, r.actif, r.premier_delai_jours, r.intervalle_jours, r.nombre_max, r.repere, r.canaux, r.jours_envoi, r.heure_debut, r.heure_fin, r.segments_exclus, u.nom],
  );
  await q("insert into relances_journal(type, action, avant, apres, resume, par) values($1,'regle',$2,$3,$4,$5)", [
    t, JSON.stringify(reglage(avant)), JSON.stringify(r), diff.join(" · "), u.nom,
  ]);
  rafraichir();
  return { ok: true, message: `${defRelance(t)!.libelle} : règle enregistrée.` };
}

/** Un résumé de simulation : les colonnes, les jours, et ce que la prochaine veille enverrait. */
export interface Bilan {
  aujourdhui: number;
  retard: number;
  j7: number;
  j30: number;
  avenir: number;
  envoyees: number;
  desactivees: number;
  sansDate: number;
  /** Ce que la veille de ce soir enverrait, par canal. */
  veille: { relances: number; email: number; sms: number; horsCreneau: number };
}

export interface Simulation {
  type: TypeRelance;
  aujourdhui: string;
  enregistree: Bilan;
  brouillon: Bilan;
  /** Les 30 prochains jours (aujourd'hui compris) : les relances prévues, règle enregistrée et brouillon. */
  jours: { jour: string; enregistree: number; brouillon: number }[];
  prochaines: { cle: string; prevue: string; client: string; ref: string; dossierId: number; rang: number; sur: number; canaux: Canal[]; colonne: Colonne; objet: string }[];
  motifs: { motif: string; n: number }[];
  creneau: string;
}

/** Ce qu'engendrerait la règle en cours de saisie, à côté de la règle enregistrée. Rien n'est envoyé ni enregistré. */
export async function simuler(type: string, brut: Partial<ReglageRegle>): Promise<{ ok: true; simulation: Simulation } | { ok: false; erreur: string }> {
  await currentUser();
  const v = validerRegle(type, brut);
  if (!v.ok) return v;
  const t = type as TypeRelance;
  const aujourdhui = jourParis();
  const s = await simulerRegle(t, { ...(await reglesRelances()).get(t)!, ...v.regle }, aujourdhui);
  const fin7 = plus(aujourdhui, 7);
  const fin30 = plus(aujourdhui, 30);
  const enregistree = s.regle;
  // La veille de ce soir, à son heure de passage.
  const passageVeille = new Date(`${aujourdhui}T${String(HEURE_VEILLE_UTC).padStart(2, "0")}:00:00Z`);
  const bilan = (l: typeof s.apres, regle: Regle, sansDate: number): Bilan => {
    const { dues, horsCreneau } = duesPourLaVeille(l, new Map([[t, regle]]), passageVeille);
    return {
      aujourdhui: l.filter((r) => r.colonne === "aujourdhui").length,
      retard: l.filter((r) => r.colonne === "retard").length,
      j7: l.filter((r) => r.colonne === "avenir" && r.prevue <= fin7).length,
      j30: l.filter((r) => r.colonne === "avenir" && r.prevue <= fin30).length,
      avenir: l.filter((r) => r.colonne === "avenir").length,
      envoyees: l.filter((r) => r.colonne === "envoyee").length,
      desactivees: l.filter((r) => r.colonne === "desactivee").length,
      sansDate,
      veille: {
        relances: dues.length, horsCreneau,
        email: dues.filter((r) => r.canaux.includes("email")).length, sms: dues.filter((r) => r.canaux.includes("sms")).length,
      },
    };
  };
  const brouillon = { ...enregistree, ...v.regle };
  const jours = Array.from({ length: 30 }, (_, i) => {
    const jour = plus(aujourdhui, i);
    const n = (l: typeof s.apres) => l.filter((r) => ["avenir", "aujourdhui"].includes(r.colonne) && r.prevue === jour).length;
    return { jour, enregistree: n(s.avant), brouillon: n(s.apres) };
  });
  const motifs = new Map<string, number>();
  for (const r of s.apres.filter((x) => x.colonne === "desactivee")) motifs.set(r.motif ?? "—", (motifs.get(r.motif ?? "—") ?? 0) + 1);
  return {
    ok: true,
    simulation: {
      type: t, aujourdhui,
      enregistree: bilan(s.avant, enregistree, s.sansDate.avant),
      brouillon: bilan(s.apres, brouillon, s.sansDate.apres),
      jours,
      prochaines: s.apres
        .filter((r) => ["retard", "aujourdhui", "avenir"].includes(r.colonne))
        .slice(0, 12)
        .map((r) => ({ cle: r.cle, prevue: r.prevue, client: r.client, ref: r.ref, dossierId: r.dossierId, rang: r.rang, sur: r.sur, canaux: r.canaux, colonne: r.colonne, objet: r.objet })),
      motifs: [...motifs.entries()].map(([motif, n]) => ({ motif, n })).sort((a, b) => b.n - a.n),
      creneau: creneauEnClair(v.regle),
    },
  };
}

/** L'aperçu d'une carte de relance, avec le texte enregistré dans « Courriers et SMS ». */
export async function apercuRelance(type: string, canal: string): Promise<{ ok: true; apercu: Apercu; titre: string } | { ok: false; erreur: string }> {
  await currentUser();
  const def = defRelance(type);
  const k = CANAUX.find((c) => c.cle === canal)?.cle;
  if (!def || !k) return { ok: false, erreur: "Carte inconnue." };
  const m = await modeleDe(def.cartes[k]);
  if (!m?.corps.trim()) return { ok: false, erreur: "Texte à rédiger et à valider dans « Courriers et SMS » : rien à montrer." };
  const a = await apercuCarte(def.cartes[k], m.objet, m.corps);
  if (!a) return { ok: false, erreur: "Aperçu impossible." };
  const raison = raisonDeNePasEnvoyer(m);
  return { ok: true, apercu: a, titre: `${m.nom}${raison ? " · carte désactivée" : ""}` };
}

/** Un dossier à ne pas relancer : pour un type, ou pour tous (« * »). */
export async function exclureDossier(dossierId: number, type: string, motif?: string): Promise<Retour> {
  const u = await currentUser();
  if (type !== "*" && !defRelance(type)) return { ok: false, erreur: "Type de relance inconnu." };
  const d = await q1<{ ref: string }>("select ref from dossiers where id=$1", [dossierId]);
  if (!d) return { ok: false, erreur: "Dossier introuvable." };
  const fait = await q1("insert into relances_exclusions(dossier_id, type, motif, par) values($1,$2,$3,$4) on conflict do nothing returning 1", [dossierId, type, motif?.trim() || null, u.nom]);
  if (!fait) return { ok: true, message: `${d.ref} est déjà exclu.` };
  const quoi = type === "*" ? "toutes les relances" : `« ${defRelance(type)!.libelle} »`;
  await q("insert into relances_journal(type, action, apres, resume, par) values($1,'exclusion',$2,$3,$4)", [
    type === "*" ? null : type, JSON.stringify({ dossier_id: dossierId, type }), `${d.ref} : ne pas relancer (${quoi})${motif?.trim() ? ` — ${motif.trim()}` : ""}`, u.nom,
  ]);
  await q("insert into activite(dossier_id, libelle, utilisateur_id) values($1,$2,$3)", [dossierId, `Relances : ne pas relancer (${quoi})`, u.id]).catch(() => undefined);
  rafraichir();
  return { ok: true, message: `${d.ref} : plus de relance (${quoi}).` };
}

export async function retirerExclusion(dossierId: number, type: string): Promise<Retour> {
  const u = await currentUser();
  const d = await q1<{ ref: string }>("select ref from dossiers where id=$1", [dossierId]);
  const fait = await q1("delete from relances_exclusions where dossier_id=$1 and type=$2 returning 1", [dossierId, type]);
  if (!fait || !d) return { ok: false, erreur: "Exclusion introuvable." };
  const quoi = type === "*" ? "toutes les relances" : `« ${defRelance(type)?.libelle ?? type} »`;
  await q("insert into relances_journal(type, action, avant, resume, par) values($1,'exclusion',$2,$3,$4)", [
    type === "*" ? null : type, JSON.stringify({ dossier_id: dossierId, type }), `${d.ref} : relances rétablies (${quoi})`, u.nom,
  ]);
  await q("insert into activite(dossier_id, libelle, utilisateur_id) values($1,$2,$3)", [dossierId, `Relances rétablies (${quoi})`, u.id]).catch(() => undefined);
  rafraichir();
  return { ok: true, message: `${d.ref} : relances rétablies (${quoi}).` };
}
