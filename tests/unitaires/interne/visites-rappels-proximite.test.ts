import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Retours de Céline (16/11/2026) : les rappels de visite à J−2 et J−1 (visios
 * comprises), la proposition du créneau le plus cohérent et la ville des
 * rendez-vous, et la visite déplacée que le parcours disait faite.
 */

/* ---------- les doubles : la base, la fiche client et les modèles de « Courriers et SMS » ---------- */
const etat = vi.hoisted(() => ({
  rdvs: [] as Record<string, unknown>[],
  sql: [] as { sql: string; params: unknown[] }[],
  modeles: {} as Record<string, { nom: string; corps: string; actif: boolean } | null>,
}));
vi.mock("@/crm/lib/db", () => ({
  q: vi.fn(async (sql: string, params: unknown[] = []) => {
    etat.sql.push({ sql, params });
    return /from rendez_vous r join utilisateurs/.test(sql) ? etat.rdvs : [];
  }),
  q1: vi.fn(async () => undefined),
}));
vi.mock("@/crm/envois", () => ({
  appel: (c: { civilite: string | null; nom: string | null }) => `${c.civilite} ${c.nom}`,
  destinataire: vi.fn(async (id: number) => (id === 3 ? { ref: "BD-3", civilite: "Madame", prenom: null, nom: "Sans", societe: null, telephone: null } : { ref: `BD-${id}`, civilite: "Madame", prenom: "Anne", nom: "Martin", societe: null, telephone: "06 12 34 56 78" })),
  envoyerSmsRendezVous: vi.fn(),
}));
vi.mock("@/crm/messages/catalogue", async () => {
  const rendu = await vi.importActual<typeof import("@/crm/messages/rendu")>("@/crm/messages/rendu");
  return { modeleDe: vi.fn(async (cle: string) => etat.modeles[cle] ?? null), remplir: rendu.remplir };
});
vi.mock("@/lib/alertes-equipe", () => ({ alerterEquipe: vi.fn() }));

import { carteSms, cleSmsRdv, joursDesRappels, momentDuRappel, rappelUtile, texteRappels } from "@/crm/rdv/calendrier";
import { ETATS_RDV, rappelsSmsRendezVous, REPONSE_SMS_DEMANDEE } from "@/crm/rdv/sms";
import { conseiller, libelleTrajet, lieuDuRdv, minutesMoyennes, trajetEstime, trajetParLaRoute, villeDe, type LieuPlanning } from "@/crm/visites/proximite";
import { visiteDuParcours } from "@/crm/parcours/visite";
import { etapesDu, type Faits } from "@/crm/parcours/etapes";

const espaces = (s: string) => s.replace(/[  ]/g, " ");

/* ───────── Le calendrier des rappels ───────── */

describe("rdv/calendrier · J−2 et J−1, à l'heure de Paris", () => {
  it("une visite le jeudi 19 novembre à 10 h : J−2 le mardi, J−1 le mercredi, rien les autres jours", () => {
    const debut = "2026-11-19T09:00:00Z";
    expect(momentDuRappel(debut, "2026-11-17")).toBe("j2");
    expect(momentDuRappel(debut, "2026-11-18")).toBe("j1");
    expect(momentDuRappel(debut, "2026-11-19")).toBeNull();
    expect(momentDuRappel(debut, "2026-11-16")).toBeNull();
    expect(joursDesRappels(debut)).toEqual({ j2: "2026-11-17", j1: "2026-11-18" });
  });
  it("le jour de la visite est celui de Paris : 0 h 30 le 18 = 23 h 30 UTC le 17", () => {
    expect(joursDesRappels("2026-11-17T23:30:00Z")).toEqual({ j2: "2026-11-16", j1: "2026-11-17" });
    expect(momentDuRappel("2026-11-17T23:30:00Z", "2026-11-17")).toBe("j1");
  });
  it("passage à l'heure d'été (dimanche 29 mars 2026) : une visite le lundi 30 à 10 h a son J−2 le samedi, son J−1 le dimanche", () => {
    const debut = "2026-03-30T08:00:00Z"; // 10 h à Paris, heure d'été
    expect(joursDesRappels(debut)).toEqual({ j2: "2026-03-28", j1: "2026-03-29" });
    expect(momentDuRappel(debut, "2026-03-28")).toBe("j2");
    expect(momentDuRappel(debut, "2026-03-29")).toBe("j1");
  });
  it("passage à l'heure d'hiver (dimanche 25 octobre 2026) : la nuit du changement ne décale rien", () => {
    expect(joursDesRappels("2026-10-27T09:00:00Z")).toEqual({ j2: "2026-10-25", j1: "2026-10-26" }); // mardi 10 h, heure d'hiver
    expect(joursDesRappels("2026-10-25T23:30:00Z")).toEqual({ j2: "2026-10-24", j1: "2026-10-25" }); // lundi 0 h 30 à Paris
    expect(momentDuRappel("2026-10-26T07:00:00Z", "2026-10-24")).toBe("j2"); // lundi 8 h, vu du samedi (encore à l'heure d'été)
  });
  it("chaque type a ses cartes ; la visio les siennes, tout autre rendez-vous celles de la visite sur place", () => {
    expect([carteSms("phys", "confirmation"), carteSms("phys", "j2"), carteSms("phys", "j1")]).toEqual(["rdv_confirmation", "rdv_rappel_j2", "rdv_rappel_veille"]);
    expect([carteSms("visio", "confirmation"), carteSms("visio", "j2"), carteSms("visio", "j1")]).toEqual(["rdv_confirmation_visio", "rdv_rappel_j2_visio", "rdv_rappel_veille_visio"]);
    expect(carteSms("tache", "j1")).toBe("rdv_rappel_veille");
  });
  it("les clés : confirmation et veille inchangées (rien ne repart), J−2 à part ; une par horaire", () => {
    const d = new Date("2026-11-19T09:00:00Z");
    expect(cleSmsRdv(9, "confirmation", d)).toBe("crm:rdv:9:confirmation:2026-11-19T09:00:00.000Z");
    expect(cleSmsRdv(9, "j1", d)).toBe("crm:rdv:9:rappel:2026-11-19T09:00:00.000Z");
    expect(cleSmsRdv(9, "j2", d)).toBe("crm:rdv:9:rappel-j2:2026-11-19T09:00:00.000Z");
    expect(cleSmsRdv(9, "j2", "2026-11-19T10:00:00Z")).not.toBe(cleSmsRdv(9, "j2", d));
  });
  it("pas de rappel le jour où la confirmation est partie (à Paris) ; une confirmation non partie ne compte pas", () => {
    expect(rappelUtile({ le: "2026-11-17T14:00:00Z", statut: "envoye" }, "2026-11-17")).toBe(false);
    expect(rappelUtile({ le: "2026-11-16T23:30:00Z", statut: "envoye" }, "2026-11-17")).toBe(false); // 0 h 30 le 17 à Paris
    expect(rappelUtile({ le: "2026-11-16T14:00:00Z", statut: "envoye" }, "2026-11-17")).toBe(true);
    expect(rappelUtile({ le: "2026-11-17T14:00:00Z", statut: "desactive" }, "2026-11-17")).toBe(true);
    expect(rappelUtile(null, "2026-11-17")).toBe(true);
  });
  it("les rappels en clair", () => {
    expect(texteRappels({ canaux: ["sms", "email"], j2: "2026-11-17" })).toBe("SMS à J−2 et J−1, e-mail la veille");
    expect(texteRappels({ canaux: ["sms"], j2: null })).toBe("SMS la veille");
    expect(texteRappels({ canaux: [], j2: null })).toBe("");
  });
});

/* ───────── Les SMS de rappel que la veille envoie ───────── */

describe("rdv/sms · rappels SMS de la tâche de la veille (J−2, J−1, visios)", () => {
  beforeEach(() => {
    etat.sql = [];
    etat.modeles = {
      rdv_rappel_j2: { nom: "Rappel J−2", corps: "Bonjour {client}, {commercial} passera chez vous le {date} à {heure} pour la visite technique.", actif: true },
      rdv_rappel_veille: { nom: "Rappel de visite (veille)", corps: "Bonjour {client}, {commercial} passera chez vous demain à {heure} pour la visite technique.", actif: true },
      rdv_rappel_j2_visio: { nom: "Rappel J−2 · visio", corps: "Bonjour {client}, {commercial} vous retrouve en visio le {date} à {heure} pour la visite technique.", actif: true },
      rdv_rappel_veille_visio: { nom: "Rappel de la veille · visio", corps: "Bonjour {client}, {commercial} vous retrouve en visio demain à {heure} pour la visite technique.", actif: true },
    };
  });
  const rdv = (o: Record<string, unknown>) => ({ id: 1, dossier_id: 1, type: "phys", debut: "2026-11-19T09:00:00Z", commercial: "Dragan Petrović", confirmation_le: null, confirmation_statut: null, ...o });

  it("le mardi 17 : J−2 pour jeudi, J−1 pour mercredi, chacun avec la carte de son type et sa clé", async () => {
    etat.rdvs = [rdv({ id: 11 }), rdv({ id: 12, type: "visio", debut: "2026-11-18T13:30:00Z" })];
    const r = await rappelsSmsRendezVous(new Date("2026-11-17T11:00:00Z"));
    expect(etat.sql[0].params).toEqual(["2026-11-17"]);
    expect(r.map((x) => [x.rendezVousId, x.carte, x.cle, x.libelle])).toEqual([
      [11, "rdv_rappel_j2", "crm:rdv:11:rappel-j2:2026-11-19T09:00:00.000Z", "Rappel J−2"],
      [12, "rdv_rappel_veille_visio", "crm:rdv:12:rappel:2026-11-18T13:30:00.000Z", "Rappel de la veille (visio)"],
    ]);
    expect(r[0].texte).toBe("Bonjour Madame Martin, Dragan Petrović passera chez vous le 19/11/2026 à 10:00 pour la visite technique.");
    expect(r[1].texte).toBe("Bonjour Madame Martin, Dragan Petrović vous retrouve en visio demain à 14:30 pour la visite technique.");
    expect(r[1]).toMatchObject({ canal: "sms", destinataire: "06 12 34 56 78", modele: "Rappel de la veille · visio" });
    // Aucun texte ne demande plus de répondre 1 ou 2.
    expect(r.some((x) => /répond/i.test(x.texte))).toBe(false);
  });
  it("la requête écarte ce qui n'a pas de rappel : terminée, sans suite, journée, dossier clos, annulée par le client, compte-rendu signé", async () => {
    etat.rdvs = [];
    await rappelsSmsRendezVous(new Date("2026-11-17T11:00:00Z"));
    const sql = etat.sql[0].sql;
    for (const bout of ["not r.journee", "not r.termine", "not r.sans_suite", "d.statut not in ('perdu', 'termine')", "coalesce(s.reponse, '') <> 'annule'", "v.statut = 'signee'", "r.type in ('phys','visio')"]) {
      expect(sql).toContain(bout);
    }
  });
  it("pas de rappel le jour où la confirmation est partie ; pas de téléphone, pas de SMS", async () => {
    etat.rdvs = [rdv({ id: 21, confirmation_le: "2026-11-17T08:00:00Z", confirmation_statut: "envoye" }), rdv({ id: 22, dossier_id: 3 }), rdv({ id: 23, confirmation_le: "2026-11-16T08:00:00Z", confirmation_statut: "envoye" })];
    const r = await rappelsSmsRendezVous(new Date("2026-11-17T11:00:00Z"));
    expect(r.map((x) => x.rendezVousId)).toEqual([23]);
  });
  it("à l'heure d'été, le dimanche du changement : J−1 d'une visite du lundi 10 h", async () => {
    etat.rdvs = [rdv({ id: 31, debut: "2026-03-30T08:00:00Z" })];
    const r = await rappelsSmsRendezVous(new Date("2026-03-29T11:00:00Z"));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ carte: "rdv_rappel_veille", cle: "crm:rdv:31:rappel:2026-03-30T08:00:00.000Z" });
    expect(r[0].texte).toMatch(/demain à 10:00/);
  });
  it("une carte absente : le texte est vide (la tâche le retient, rien ne part)", async () => {
    etat.modeles.rdv_rappel_j2 = null;
    etat.rdvs = [rdv({ id: 41 })];
    const [x] = await rappelsSmsRendezVous(new Date("2026-11-17T11:00:00Z"));
    expect(x).toMatchObject({ texte: "", modele: "Rappel J−2", carte: "rdv_rappel_j2" });
  });
  it("les options 1 et 2 sont mises de côté : un SMS sans réponse se lit « SMS envoyé », sans alerte", () => {
    expect(REPONSE_SMS_DEMANDEE).toBe(false);
    expect(ETATS_RDV.sans_reponse).toEqual({ libelle: "SMS envoyé", ton: "i" });
  });
});

/* ───────── La ville et les trajets ───────── */

const VERSAILLES = { lat: 48.8049, lon: 2.1204 };
const LE_CHESNAY = { lat: 48.8222, lon: 2.125 };
const CRETEIL = { lat: 48.7904, lon: 2.4556 };
const PARIS_15 = { lat: 48.8417, lon: 2.3008 };

describe("visites/proximite · la ville d'un rendez-vous", () => {
  it("l'écriture du CRM, un code postal, un libellé court, une ville seule", () => {
    expect(villeDe("12 Rue de la Paix, 75002 Paris")).toBe("Paris 2e");
    expect(villeDe("3 rue Lecourbe, 75015 Paris")).toBe("Paris 15e");
    expect(villeDe("1 avenue Foch, 75116 Paris")).toBe("Paris 16e");
    expect(villeDe("8 rue de Rivoli 75001 Paris")).toBe("Paris 1er");
    expect(villeDe("3 allée des Tilleuls 78110 Le Vésinet")).toBe("Le Vésinet");
    expect(villeDe("2 rue X, 92100 Boulogne-Billancourt Cedex 2")).toBe("Boulogne-Billancourt");
    expect(villeDe("Le Vésinet · 3 pièces")).toBe("Le Vésinet");
    expect(villeDe("Paris 15e · compte")).toBe("Paris 15e");
    expect(villeDe("Versailles")).toBe("Versailles");
    expect(villeDe("12 rue des Lilas, Massy")).toBe("Massy");
  });
  it("rien pour une visio, un lien, « Chez le client », un numéro de rue sans ville", () => {
    for (const t of ["Visio", "Visio · Brest → Paris", "https://meet.example/abc", "Chez le client", "12 rue des Lilas", "", null]) expect(villeDe(t)).toBeNull();
  });
  it("une visite sur place : son adresse et l'étape du dossier qui porte la même ; sinon l'étape (le départ)", () => {
    const etape = { adresse: "12 Rue de la Paix", code_postal: "75002", ville: "Paris" };
    expect(lieuDuRdv({ type: "phys", lieu: "12 Rue de la Paix", etape })).toEqual({ adresse: "12 Rue de la Paix, 75002 Paris", ville: "Paris 2e" });
    expect(lieuDuRdv({ type: "phys", lieu: "Le Vésinet · 3 pièces", etape: { adresse: "Le Vésinet" } })).toEqual({ adresse: "Le Vésinet", ville: "Le Vésinet" });
    expect(lieuDuRdv({ type: "phys", lieu: "5 rue Hoche, 78000 Versailles", etape })).toEqual({ adresse: "5 rue Hoche, 78000 Versailles", ville: "Versailles" });
    expect(lieuDuRdv({ type: "phys", lieu: null, etape })).toEqual({ adresse: "12 Rue de la Paix, 75002 Paris", ville: "Paris 2e" });
  });
  it("une tâche : son lieu s'il en a un ; une visio, une règle : nulle part", () => {
    expect(lieuDuRdv({ type: "tache", lieu: "4 rue Pasteur, 91140 Villebon-sur-Yvette" })).toEqual({ adresse: "4 rue Pasteur, 91140 Villebon-sur-Yvette", ville: "Villebon-sur-Yvette" });
    expect(lieuDuRdv({ type: "tache", lieu: "Chez le client" })).toEqual({ adresse: null, ville: null });
    expect(lieuDuRdv({ type: "visio", lieu: "https://meet", etape: { adresse: "Brest" } })).toEqual({ adresse: null, ville: null });
    expect(lieuDuRdv({ type: "perso", lieu: "Visios uniquement" })).toEqual({ adresse: null, ville: null });
  });
});

describe("visites/proximite · distance et temps moyen", () => {
  it("le temps moyen : 25 km/h sur dix kilomètres, 50 au-delà, cinq minutes pour se garer, par cinq minutes", () => {
    expect(minutesMoyennes(0)).toBe(5);
    expect(minutesMoyennes(2.4)).toBe(10);
    expect(minutesMoyennes(10)).toBe(30);
    expect(minutesMoyennes(30)).toBe(55);
    expect(minutesMoyennes(-3)).toBe(5);
  });
  it("à vol d'oiseau majoré d'un quart, affiché « ≈ » ; par la route, la distance sans « ≈ »", () => {
    const t = trajetEstime(VERSAILLES, LE_CHESNAY);
    expect(t.estime).toBe(true);
    expect(t.km).toBeGreaterThan(2);
    expect(t.km).toBeLessThan(3);
    expect(espaces(libelleTrajet(t))).toBe(`≈ ${String(t.km).replace(".", ",")} km · ≈ 10 min`);
    expect(espaces(libelleTrajet(trajetParLaRoute(17.2)))).toBe("17 km · ≈ 40 min");
    expect(espaces(libelleTrajet(trajetParLaRoute(64)))).toBe("64 km · ≈ 1 h 35");
  });
});

/* ───────── Le créneau le plus cohérent ───────── */

describe("visites/proximite · conseiller le créneau le plus cohérent", () => {
  const MAINTENANT = Date.parse("2026-11-16T09:00:00Z"); // lundi 10 h
  const lieu = (o: Partial<LieuPlanning> & { de: string; a: string }): LieuPlanning => ({ id: 1, titre: "M. Perrin", ville: "Versailles", point: VERSAILLES, debut: Date.parse(o.de), fin: Date.parse(o.a), ...o });
  const base = (lieux: LieuPlanning[], occ: { debut: number; fin: number }[] = []) => ({
    cible: LE_CHESNAY, duree: 90, jours: ["2026-11-17", "2026-11-18", "2026-11-19"], lieux,
    occupation: [...lieux.map((l) => ({ debut: l.debut, fin: l.fin })), ...occ], maintenant: MAINTENANT,
  });

  it("juste après la visite voisine : 10 h 30 de fin, 10 minutes de route, 10 h 45 au quart d'heure", () => {
    const perrin = lieu({ de: "2026-11-17T08:00:00Z", a: "2026-11-17T09:30:00Z" }); // mardi 9 h – 10 h 30
    const okafor = lieu({ id: 2, titre: "Mme Okafor", ville: "Créteil", point: CRETEIL, de: "2026-11-18T13:00:00Z", a: "2026-11-18T14:30:00Z" });
    const c = conseiller(base([perrin, okafor]));
    // Créteil est trop loin du Chesnay : seul le mardi est proposé.
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ jour: "2026-11-17", heure: "10:45", debut: "2026-11-17T09:45:00.000Z", voisin: { id: 1, titre: "M. Perrin", ville: "Versailles", position: "apres" } });
    expect(c[0].detourKm).toBeLessThan(3);
  });
  it("le créneau collé est pris : le suivant de la journée (14 h), toujours après la voisine", () => {
    const perrin = lieu({ de: "2026-11-17T08:00:00Z", a: "2026-11-17T09:30:00Z" });
    const c = conseiller(base([perrin], [{ debut: Date.parse("2026-11-17T09:30:00Z"), fin: Date.parse("2026-11-17T11:30:00Z") }]));
    expect(c[0]).toMatchObject({ heure: "14:00", voisin: { position: "apres" } });
  });
  it("juste avant la visite voisine, en lui laissant le temps de la route", () => {
    const perrin = lieu({ de: "2026-11-17T13:00:00Z", a: "2026-11-17T14:30:00Z" }); // mardi 14 h – 15 h 30
    const [c] = conseiller(base([perrin]));
    expect(c).toMatchObject({ heure: "12:15", voisin: { position: "avant" } }); // 12 h 15 – 13 h 45, 10 min de route, arrivée 13 h 55
  });
  it("entre deux visites : le détour d'insertion, plus petit que l'aller simple", () => {
    const perrin = lieu({ de: "2026-11-17T08:00:00Z", a: "2026-11-17T09:30:00Z" });
    const paris = lieu({ id: 3, titre: "Cabinet Moreau", ville: "Paris 15e", point: PARIS_15, de: "2026-11-17T13:00:00Z", a: "2026-11-17T14:30:00Z" });
    const [c] = conseiller(base([perrin, paris]));
    expect(c.heure).toBe("10:45");
    expect(c.detourKm).toBeLessThan(trajetEstime(VERSAILLES, LE_CHESNAY).km);
  });
  it("le meilleur jour d'abord ; un créneau passé ne se propose pas", () => {
    const loin = lieu({ id: 4, titre: "M. Durand", ville: "Paris 15e", point: PARIS_15, de: "2026-11-17T08:00:00Z", a: "2026-11-17T09:30:00Z" });
    const pres = lieu({ id: 5, de: "2026-11-19T08:00:00Z", a: "2026-11-19T09:30:00Z" });
    const c = conseiller(base([loin, pres]));
    expect(c.map((x) => x.jour)).toEqual(["2026-11-19", "2026-11-17"]);
    const tard = conseiller({ ...base([pres]), maintenant: Date.parse("2026-11-19T10:00:00Z") }); // jeudi 11 h
    expect(tard.every((x) => Date.parse(x.debut) > Date.parse("2026-11-19T10:00:00Z"))).toBe(true);
  });
  it("aucune visite proche, ou aucun rendez-vous situé : aucun conseil", () => {
    expect(conseiller(base([lieu({ id: 2, point: CRETEIL, de: "2026-11-18T13:00:00Z", a: "2026-11-18T14:30:00Z" })]))).toEqual([]);
    expect(conseiller(base([]))).toEqual([]);
  });
  it("la distance affichée est celle de la route quand on la connaît", () => {
    const perrin = lieu({ de: "2026-11-17T08:00:00Z", a: "2026-11-17T09:30:00Z" });
    const [c] = conseiller({ ...base([perrin]), trajetVers: () => trajetParLaRoute(3.1) });
    expect(c.voisin.trajet).toEqual({ km: 3.1, min: 10, estime: false });
  });
});

/* ───────── La visite du parcours (le 13/11 au lieu du 17/11) ───────── */

describe("parcours/visite · une visite déplacée n'est pas faite tant qu'elle ne l'est pas", () => {
  const faits = (visite: Faits["visite"], statut = "devis"): Faits => ({
    statut, segment: "particulier", aujourdhui: "2026-11-16",
    demande: { le: "2026-11-13", site: false, source: null }, qualifieLe: null, commercial: null, visite,
    devis: { premierEnvoi: null, brouillons: 3, envoyes: 0, signe: null },
    paiements: { n: 0, premier: null, total: 0 }, commandeLe: null, planifieLe: null, chargement: null, livraison: null,
    lettres: { n: 0, livrees: 0, creeesLe: null },
    factures: { n: 0, payees: 0, premiere: null, derniereReglee: null, total: 0, impaye: 0 },
    sav: { ouverts: 0, clos: 0, le: null }, avisLe: null,
  });
  const LE_16 = Date.parse("2026-11-16T15:00:00Z");
  // Le dossier de Céline : compte-rendu signé le 13 sur la tablette, visio déplacée au mardi 17 à 10 h.
  const rdv73 = { type: "visio", debut: "2026-11-17T09:00:00Z", commercial: "Dragan Petrović", termine: true, compte_rendu_signe: true };
  const cr13 = { signe_le: "2026-11-13T10:42:18Z", commercial: "Dragan Petrović", rendez_vous_id: 73 };

  it("telle qu'en base avant la correction (terminée, compte-rendu rattaché) : prévue le 17, en visio, pas faite", () => {
    expect(visiteDuParcours([rdv73], [cr13], LE_16)).toEqual({ faite: null, prevue: "2026-11-17T09:00:00.000Z", mode: "visio", par: "Dragan Petrović", anterieure: null });
    const e = etapesDu(faits(visiteDuParcours([rdv73], [cr13], LE_16))).find((x) => x.cle === "visite")!;
    expect(e).toMatchObject({ etat: "avenir", date: "2026-11-17T09:00:00.000Z", detail: "Prévue en visio avec Dragan Petrović" });
  });
  it("après le déplacement corrigé (visite replanifiée, compte-rendu détaché) : prévue le 17, la visite précédente rappelée", () => {
    const v = visiteDuParcours([{ ...rdv73, termine: false, compte_rendu_signe: false }], [{ ...cr13, rendez_vous_id: null }], LE_16);
    expect(v).toEqual({ faite: null, prevue: "2026-11-17T09:00:00.000Z", mode: "visio", par: "Dragan Petrović", anterieure: "2026-11-13T10:42:18.000Z" });
    expect(espaces(etapesDu(faits(v)).find((x) => x.cle === "visite")!.detail)).toBe("Prévue en visio avec Dragan Petrović · visite précédente le 13 nov. 2026");
  });
  it("le 17 après 10 h : faite le 17 (date du rendez-vous, pas de la signature), en visio", () => {
    const v = visiteDuParcours([{ ...rdv73, termine: false, compte_rendu_signe: false }], [{ ...cr13, rendez_vous_id: null }], Date.parse("2026-11-17T10:00:00Z"));
    expect(v).toEqual({ faite: "2026-11-17T09:00:00.000Z", prevue: null, mode: "visio", par: "Dragan Petrović", anterieure: null });
    expect(etapesDu(faits(v)).find((x) => x.cle === "visite")).toMatchObject({ etat: "fait", detail: "En visio avec Dragan Petrović" });
  });
  it("faite le jour même avant l'heure prévue (compte-rendu signé tôt) : faite ; une visite sans suite à venir n'est pas prévue", () => {
    const tot = { type: "phys", debut: "2026-11-16T16:00:00Z", commercial: "Laure", compte_rendu_signe: true };
    expect(visiteDuParcours([tot], [], LE_16)).toMatchObject({ faite: "2026-11-16T16:00:00.000Z", mode: "phys" });
    expect(visiteDuParcours([{ type: "phys", debut: "2026-11-20T09:00:00Z", commercial: "Laure", sans_suite: true }], [], LE_16)).toEqual({ faite: null, prevue: null, mode: null, par: null, anterieure: null });
  });
  it("un compte-rendu signé sans rendez-vous : une visite faite à sa signature", () => {
    expect(visiteDuParcours([], [{ signe_le: "2026-11-12T10:00:00Z", commercial: "Laure", rendez_vous_id: null }], LE_16)).toMatchObject({ faite: "2026-11-12T10:00:00.000Z", mode: null });
    expect(etapesDu(faits(visiteDuParcours([], [{ signe_le: "2026-11-12T10:00:00Z", commercial: "Laure", rendez_vous_id: null }], LE_16))).find((x) => x.cle === "visite")!.detail).toBe("Compte-rendu signé avec Laure");
  });
});
