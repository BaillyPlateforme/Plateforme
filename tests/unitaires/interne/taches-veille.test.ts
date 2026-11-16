import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tache } from "@/taches/types";

/* ---------- les doubles : la base Supabase (journal des exécutions), le registre et les modules d'envoi ---------- */

type Requete = { table: string; verbe: string; charge?: unknown; filtres: [string, ...unknown[]][] };
const etat = vi.hoisted(() => ({
  taches: [] as Tache[],
  requetes: [] as Requete[],
  repondre: (_r: Requete): { data?: unknown; error?: { code?: string; message: string } | null } => ({ data: null, error: null }),
  relancesDuJour: { envoyees: 0, echecs: 0, enAttente: 0, horsCreneau: 0, details: [] as unknown[] },
  modele: { corps: "Bonjour", actif: true } as { corps: string; actif: boolean } | null,
  dossiersDemain: [] as { id: number; ref: string }[],
  purge: null as null | { evenements: number; liens: number } | Error,
  envoi: { statut: "envoye", doublon: false } as { statut: string; doublon: boolean },
  livraisons: [] as { date_samedi: string; statut: string; creneau_debut: string | null }[],
  pannes: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from(table: string) {
      const r: Requete = { table, verbe: "", filtres: [] };
      etat.requetes.push(r);
      const chaine: Record<string, unknown> = {};
      for (const m of ["eq", "lt", "in", "order", "limit"]) chaine[m] = (...a: unknown[]) => { r.filtres.push([m, ...a]); return chaine; };
      for (const v of ["update", "insert"]) chaine[v] = (charge: unknown) => { r.verbe = v; r.charge = charge; return chaine; };
      chaine.select = () => { if (!r.verbe) r.verbe = "select"; return chaine; };
      chaine.single = async () => etat.repondre(r);
      chaine.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(etat.repondre(r)).then(ok, ko);
      return chaine;
    },
  }),
}));
vi.mock("@/taches/registre", () => ({ get TACHES_VEILLE() { return etat.taches; } }));
vi.mock("@/crm/lib/db", () => ({
  q: vi.fn(async (sql: string) => (/from dossiers where date_chargement/.test(sql) ? etat.dossiersDemain : [])),
  q1: vi.fn(async (sql: string) => (/select ref from dossiers/.test(sql) ? { ref: "BD-1" } : /from dossiers d join clients/.test(sql) ? { email: "a@b.fr", nom: "Martin", telephone: "0612345678", notes: null } : undefined)),
}));
vi.mock("@/crm/relances/moteur", () => ({ envoyerRelancesDuJour: vi.fn(async () => etat.relancesDuJour), RATTRAPAGE_JOURS: 3 }));
vi.mock("@/crm/envois", () => ({
  envoyerCarte: vi.fn(async () => ({ libelle: "Envoyé", resultat: { doublon: false } })),
  dossierFictif: vi.fn(async () => false),
}));
vi.mock("@/crm/messages/catalogue", () => ({
  modeleDe: vi.fn(async () => etat.modele),
  raisonDeNePasEnvoyer: (m: { corps: string; actif: boolean } | null) => (!m ? "Modèle introuvable." : !m.corps.trim() ? "Texte à rédiger." : !m.actif ? "Message désactivé." : null),
}));
vi.mock("@/lib/suivi-envois", () => ({ purgerSuivi: vi.fn(async () => { if (etat.purge instanceof Error) throw etat.purge; return etat.purge; }) }));
vi.mock("@/lib/email-render", () => ({ habillerTexte: vi.fn(() => "<html>") }));
vi.mock("@/lib/envois", () => ({
  envoyerEmail: vi.fn(async () => etat.envoi),
  envoyerSms: vi.fn(async () => etat.envoi),
  libelleStatut: (r: { statut: string }) => r.statut,
}));
vi.mock("@/lib/messaging", () => ({ TEL_AGENCE: "01 69 10 35 35" }));
vi.mock("@/lib/settings", () => ({ getSettings: vi.fn(async () => ({ sms_sender: "BAILLY", entreprise_nom: "Bailly", entreprise_email: "c@b.fr", entreprise_tel: "", base_url: "https://b.fr/" })) }));
vi.mock("@/crm/rdv/sms", () => ({ noterEnvoiRdv: vi.fn(async () => undefined) }));
vi.mock("@/lib/espace-client/depot", () => ({ lireDonnees: vi.fn(async () => ({ livraisons_cartons: etat.livraisons })) }));
vi.mock("@/lib/espace-client/samedi", () => ({
  calculerTourneeDuSamedi: vi.fn(async () => { if (etat.pannes.includes("tournee")) throw new Error("OSRM muet"); return { arrets: 3, distanceKm: 42.5, horsTournee: 0 }; }),
  envoyerRecapitulatifEquipe: vi.fn(async () => { if (etat.pannes.includes("recap")) throw new Error("Brevo muet"); return { destinataires: 2, deja: 0, partis: 2, journalises: 0 }; }),
  envoyerCreneauxDuSamedi: vi.fn(async () => { if (etat.pannes.includes("clients")) throw new Error("SMS muets"); return { prevenus: 3, partis: 6, echecs: 0, incomplets: 0 }; }),
}));

import { executerVeille } from "@/taches/veille";
import { tacheRelances, tacheVeilleDemenagement } from "@/taches/relances";
import { tacheRetentionSuivi } from "@/taches/suivi";
import { tacheRappelsVisites, type RappelVisite } from "@/taches/rappels-visites";
import { tacheCartons } from "@/taches/cartons";
import { envoyerCarte } from "@/crm/envois";
import { envoyerEmail, envoyerSms } from "@/lib/envois";
import { q } from "@/crm/lib/db";

const tache = (cle: string, r: Awaited<ReturnType<Tache["executer"]>> | Error, vu?: (ctx: unknown) => void): Tache => ({
  cle, libelle: `Tâche ${cle}`,
  async executer(ctx) { vu?.(ctx); if (r instanceof Error) throw r; return r; },
});
/** Le journal : la réservation réussit, le compte rendu final est renvoyé tel qu'écrit. */
const journalOk = (r: Requete) => {
  if (r.verbe === "insert") return { data: { id: "x1", ...(r.charge as object) }, error: null };
  if (r.verbe === "update" && r.filtres.some(([m, k]) => m === "eq" && k === "id")) return { data: { id: "x1", ...(r.charge as object) }, error: null };
  return { data: null, error: null };
};

beforeEach(() => {
  etat.requetes = [];
  etat.repondre = journalOk;
  etat.taches = [];
  vi.mocked(envoyerCarte).mockClear();
  vi.mocked(envoyerEmail).mockClear();
  vi.mocked(envoyerSms).mockClear();
  vi.mocked(q).mockClear();
});

describe("taches/veille · executerVeille (ce qu'elle décide)", () => {
  it("toutes les tâches sans souci (faite, rien, en attente) : réussie ; chacune reçoit le jour et le lendemain de Paris", async () => {
    const vus: unknown[] = [];
    etat.taches = [tache("a", { statut: "faite", resume: "ok" }, (c) => vus.push(c)), tache("b", { statut: "rien", resume: "" }), tache("c", { statut: "en_attente", resume: "" })];
    const r = await executerVeille({ declenchement: "planifie", par: "cron", maintenant: new Date("2026-12-31T23:30:00Z") });
    expect(r.lancee).toBe(true);
    expect(r.lancee && r.execution.statut).toBe("reussie");
    expect(vus).toEqual([{ jour: "2027-01-01", demain: "2027-01-02", declenchement: "planifie" }]);
    const reservation = etat.requetes.find((x) => x.verbe === "insert")!;
    expect(reservation.charge).toMatchObject({ tache: "veille", jour: "2027-01-01", cible: "2027-01-02", declenchement: "planifie", force: false, statut: "en_cours", par: "cron" });
  });
  it("clôt d'abord les exécutions restées « en cours » plus de 20 minutes", async () => {
    await executerVeille({ declenchement: "planifie", par: "cron", maintenant: new Date("2026-11-15T16:00:00Z") });
    const [premiere] = etat.requetes;
    expect(premiere.verbe).toBe("update");
    expect(premiere.charge).toMatchObject({ statut: "echec" });
    expect(premiere.filtres).toContainEqual(["lt", "debut", "2026-11-15T15:40:00.000Z"]);
    expect(premiere.filtres).toContainEqual(["eq", "statut", "en_cours"]);
  });
  it("une tâche qui lève est notée en échec, avec son message, sans arrêter les suivantes : partielle", async () => {
    const apres = vi.fn();
    etat.taches = [tache("a", new Error("Brevo indisponible")), tache("b", { statut: "faite", resume: "" }, apres)];
    const r = await executerVeille({ declenchement: "manuel", par: "Céline" });
    expect(apres).toHaveBeenCalled();
    if (!r.lancee) throw new Error("non lancée");
    expect(r.execution.statut).toBe("partielle");
    const comptes = r.execution.resultat.taches!;
    expect(comptes.map((c) => [c.cle, c.statut, c.resume])).toEqual([["a", "echec", "Brevo indisponible"], ["b", "faite", ""]]);
    for (const c of comptes) expect(c.duree_ms).toBeGreaterThanOrEqual(0);
  });
  it("toutes en échec : échec ; une partielle : partielle", async () => {
    etat.taches = [tache("a", new Error("x")), tache("b", { statut: "echec", resume: "y" })];
    expect((await executerVeille({ declenchement: "planifie", par: "cron" })) as { execution: { statut: string } }).toMatchObject({ execution: { statut: "echec" } });
    etat.taches = [tache("a", { statut: "faite", resume: "" }), tache("b", { statut: "partielle", resume: "" })];
    expect((await executerVeille({ declenchement: "planifie", par: "cron" })) as { execution: { statut: string } }).toMatchObject({ execution: { statut: "partielle" } });
  });
  it("le verrou du jour (doublon 23505) : rien n'est relancé, et l'on dit pourquoi", async () => {
    const lancee = vi.fn();
    etat.taches = [tache("a", { statut: "faite", resume: "" }, lancee)];
    let deja: unknown[] = [{ id: "x0", statut: "reussie" }];
    etat.repondre = (r) => (r.verbe === "insert" ? { data: null, error: { code: "23505", message: "duplicate" } } : r.verbe === "select" ? { data: deja, error: null } : { data: null, error: null });
    expect(await executerVeille({ declenchement: "planifie", par: "cron" })).toEqual({ lancee: false, raison: "La veille a déjà été exécutée aujourd'hui : rien n'est relancé.", execution: deja[0] });
    deja = [{ id: "x0", statut: "en_cours" }];
    expect(await executerVeille({ declenchement: "planifie", par: "cron" })).toMatchObject({ lancee: false, raison: "La veille est en cours d'exécution." });
    deja = [];
    expect(await executerVeille({ declenchement: "planifie", par: "cron" })).toMatchObject({ lancee: false, execution: null });
    expect(lancee).not.toHaveBeenCalled();
    const lecture = etat.requetes.find((x) => x.verbe === "select")!;
    expect(lecture.filtres).toContainEqual(["eq", "force", false]);
    expect(lecture.filtres).toContainEqual(["in", "statut", ["en_cours", "reussie"]]);
  });
  it("un journal indisponible (autre erreur) : la veille ne tourne pas, l'erreur remonte", async () => {
    const lancee = vi.fn();
    etat.taches = [tache("a", { statut: "faite", resume: "" }, lancee)];
    etat.repondre = (r) => (r.verbe === "insert" ? { data: null, error: { code: "42P01", message: "table absente" } } : { data: null, error: null });
    await expect(executerVeille({ declenchement: "planifie", par: "cron" })).rejects.toThrow("Journal des tâches indisponible : table absente");
    expect(lancee).not.toHaveBeenCalled();
  });
  it("« Relancer » à la main passe force=true ; un compte rendu non inscrit est quand même rendu", async () => {
    etat.taches = [tache("a", { statut: "faite", resume: "" })];
    etat.repondre = (r) => (r.verbe === "insert" ? { data: { id: "x9", statut: "en_cours", resultat: {} }, error: null } : r.verbe === "update" && r.filtres.some(([, k]) => k === "id") ? { data: null, error: { message: "réseau" } } : { data: null, error: null });
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await executerVeille({ declenchement: "manuel", par: "David", force: true });
    erreur.mockRestore();
    expect(etat.requetes.find((x) => x.verbe === "insert")!.charge).toMatchObject({ force: true, declenchement: "manuel" });
    expect(r).toMatchObject({ lancee: true, execution: { id: "x9", statut: "reussie" } });
  });
});

describe("taches/relances · relances du jour et veille du déménagement", () => {
  it("rien de dû : « rien »", async () => {
    etat.relancesDuJour = { envoyees: 0, echecs: 0, enAttente: 0, horsCreneau: 0, details: [] };
    expect(await tacheRelances.executer({ jour: "2026-11-15", demain: "2026-11-16", declenchement: "planifie" })).toEqual({ statut: "rien", resume: "Aucune relance due aujourd'hui." });
  });
  it("un échec rend la tâche partielle ; le compte rendu dit tout", async () => {
    etat.relancesDuJour = { envoyees: 2, echecs: 1, enAttente: 0, horsCreneau: 0, details: [] };
    expect(await tacheRelances.executer({ jour: "x", demain: "y", declenchement: "planifie" })).toMatchObject({ statut: "partielle", resume: "2 relances traitées, 1 en échec." });
    etat.relancesDuJour = { envoyees: 0, echecs: 0, enAttente: 1, horsCreneau: 2, details: [] };
    expect((await tacheRelances.executer({ jour: "x", demain: "y", declenchement: "planifie" })).resume).toBe(
      "aucune relance du jour · 2 hors des jours ou heures d'envoi de leur règle · 1 en retard de plus de 3 jours, laissée à la décision de l'équipe (Relances).",
    );
  });
  it("veille du déménagement : rien sans chargement demain ; en attente tant que la carte n'est pas prête ; sinon une carte par dossier", async () => {
    const ctx = { jour: "2026-11-15", demain: "2026-11-16", declenchement: "planifie" as const };
    etat.dossiersDemain = [];
    expect(await tacheVeilleDemenagement.executer(ctx)).toEqual({ statut: "rien", resume: "Aucun chargement demain." });
    expect(vi.mocked(q).mock.calls[0][1]).toEqual(["2026-11-16"]);
    etat.dossiersDemain = [{ id: 1, ref: "BD-1" }, { id: 2, ref: "BD-2" }];
    etat.modele = { corps: "", actif: true };
    expect(await tacheVeilleDemenagement.executer(ctx)).toEqual({ statut: "en_attente", resume: "2 chargements demain ; Texte à rédiger." });
    expect(envoyerCarte).not.toHaveBeenCalled();
    etat.modele = { corps: "Demain, c'est le grand jour", actif: true };
    const r = await tacheVeilleDemenagement.executer(ctx);
    expect(r).toMatchObject({ statut: "faite", resume: "BD-1 : Envoyé · BD-2 : Envoyé" });
    expect(vi.mocked(envoyerCarte).mock.calls.map((c) => c[2])).toEqual([{ cle: "veille-demenagement:1:2026-11-16" }, { cle: "veille-demenagement:2:2026-11-16" }]);
  });
});

describe("taches/suivi · conservation du suivi des e-mails", () => {
  const ctx = { jour: "x", demain: "y", declenchement: "planifie" as const };
  it("base indisponible : en attente ; rien à effacer : rien ; sinon faite ; une erreur : échec", async () => {
    etat.purge = null;
    expect((await tacheRetentionSuivi.executer(ctx)).statut).toBe("en_attente");
    etat.purge = { evenements: 0, liens: 0 };
    expect(await tacheRetentionSuivi.executer(ctx)).toMatchObject({ statut: "rien", resume: "Rien à effacer : aucun suivi de plus de 395 jours." });
    etat.purge = { evenements: 3, liens: 1 };
    expect(await tacheRetentionSuivi.executer(ctx)).toMatchObject({ statut: "faite", resume: "3 événements et 1 lien de plus de 395 jours effacés." });
    etat.purge = new Error("délai dépassé");
    expect(await tacheRetentionSuivi.executer(ctx)).toEqual({ statut: "echec", resume: "Effacement impossible : délai dépassé." });
  });
});

describe("taches/rappels-visites · rappels de la veille", () => {
  const ctx = { jour: "2026-11-15", demain: "2026-11-16", declenchement: "planifie" as const };
  const rappel = (o: Partial<RappelVisite>): RappelVisite => ({ canal: "sms", destinataire: "0612345678", texte: "Rappel", dossierId: 1, rendezVousId: 9, cle: "rv:9:sms", ...o });

  it("sans source branchée : en attente ; liste vide : rien", async () => {
    expect((await tacheRappelsVisites(null).executer(ctx)).statut).toBe("en_attente");
    const source = vi.fn(async () => []);
    expect(await tacheRappelsVisites(source).executer(ctx)).toEqual({ statut: "rien", resume: "Aucune visite technique demain." });
    expect((source.mock.calls[0] as unknown as [Date])[0].toISOString()).toBe("2026-11-15T11:00:00.000Z");
  });
  it("chaque rappel part par son canal, avec sa clé ; un échec rend la tâche partielle", async () => {
    etat.modele = { corps: "Rappel", actif: true };
    etat.envoi = { statut: "envoye", doublon: false };
    const r = await tacheRappelsVisites(async () => [rappel({}), rappel({ canal: "email", destinataire: "a@b.fr", cle: "rv:9:email" })]).executer(ctx);
    expect(r).toMatchObject({ statut: "faite", resume: "2 rappels : 2 partis, 0 au journal." });
    expect(vi.mocked(envoyerSms).mock.calls[0][0]).toMatchObject({ cle: "rv:9:sms", a: "0612345678", expediteur: "BAILLY", retenu: null });
    expect(vi.mocked(envoyerEmail).mock.calls[0][0]).toMatchObject({ cle: "rv:9:email", sujet: "Bailly" });
    etat.envoi = { statut: "echec", doublon: false };
    expect((await tacheRappelsVisites(async () => [rappel({})]).executer(ctx))).toMatchObject({ statut: "partielle", resume: "1 rappel : 0 parti, 1 en échec, 0 au journal." });
    etat.envoi = { statut: "envoye", doublon: true };
    expect((await tacheRappelsVisites(async () => [rappel({})]).executer(ctx)).resume).toBe("1 rappel : 0 parti, 1 déjà traité, 0 au journal.");
  });
  it("un rappel sans texte, ou une carte désactivée, est retenu (rien ne part, le journal le dit)", async () => {
    etat.envoi = { statut: "journalise", doublon: false };
    etat.modele = { corps: "Rappel", actif: true };
    await tacheRappelsVisites(async () => [rappel({ texte: "   " })]).executer(ctx);
    expect(vi.mocked(envoyerSms).mock.calls[0][0]).toMatchObject({ retenu: "Rappel sans texte : rien n'est parti." });
    etat.modele = { corps: "Rappel", actif: false };
    await tacheRappelsVisites(async () => [rappel({})]).executer(ctx);
    expect(vi.mocked(envoyerSms).mock.calls[1][0]).toMatchObject({ retenu: "Message désactivé." });
  });
});

describe("taches/cartons · cartons du samedi", () => {
  const ctx = { jour: "2026-11-20", demain: "2026-11-21", declenchement: "planifie" as const };
  beforeEach(() => { etat.pannes = []; });

  it("aucune livraison le samedi : rien (une livraison déjà faite ne compte pas)", async () => {
    etat.livraisons = [{ date_samedi: "2026-11-21", statut: "livree", creneau_debut: null }, { date_samedi: "2026-11-28", statut: "prevue", creneau_debut: null }];
    expect(await tacheCartons.executer(ctx)).toEqual({ statut: "rien", resume: "Aucune livraison de cartons samedi 21 novembre." });
  });
  it("tout se passe bien : faite ; la tournée n'est calculée que s'il manque un créneau", async () => {
    etat.livraisons = [{ date_samedi: "2026-11-21", statut: "prevue", creneau_debut: "08:30" }];
    const a = await tacheCartons.executer(ctx);
    expect(a.statut).toBe("faite");
    expect(a.resume).toMatch(/^1 livraison samedi 21 novembre · tournée déjà calculée · récapitulatif et bons à 2 destinataires/);
    etat.livraisons.push({ date_samedi: "2026-11-21", statut: "prevue", creneau_debut: null });
    expect((await tacheCartons.executer(ctx)).resume).toMatch(/tournée calculée \(3 arrêts, 42,5 km\)/);
  });
  it("une étape en panne : partielle ; les trois : échec", async () => {
    etat.livraisons = [{ date_samedi: "2026-11-21", statut: "prevue", creneau_debut: null }];
    etat.pannes = ["recap"];
    const p = await tacheCartons.executer(ctx);
    expect(p.statut).toBe("partielle");
    expect(p.resume).toMatch(/erreurs : récapitulatif : Brevo muet\.$/);
    etat.pannes = ["tournee", "recap", "clients"];
    expect((await tacheCartons.executer(ctx)).statut).toBe("echec");
  });
});
