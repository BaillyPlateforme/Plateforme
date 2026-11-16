import { describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: vi.fn(async () => undefined) }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("@/crm/envois", () => ({ appel: vi.fn(), destinataire: vi.fn(), envoyerSmsRendezVous: vi.fn(), jourParis: vi.fn() }));
vi.mock("@/lib/alertes-equipe", () => ({ alerterEquipe: vi.fn() }));

import {
  cleEmail, cleTelephone, court, depuis, developperPeriode, libelleSegment, libelleType, lieu, memeDepartement, memeVille, moisAVenir, moisDepuisPeriode, scorer,
  segmentValide, typeValide, type SourceDossier,
} from "@/crm/creation/commun";
import { cleAppel, detailScore, lireCle, scoreAppel, sourceDe, telAffiche, telLien, trier } from "@/crm/appels/regles";
import { araigneeDe, basePrestige, completude, manques, rangCentile, type ChampsCompletude } from "@/crm/demandes/araignee";
import { cleCommune } from "@/crm/demandes/prestige";
import { aEnTetePropre, ongletActif, ongletActifDe, sectionDe, SECTIONS } from "@/crm/sections";
import { pageReglageDe, PAGES_REGLAGES, surtitreReglages } from "@/crm/reglages/pages";
import { dateFr, eur, heure, initiales, m3, nomClient, photoPour, STATUTS, TYPES_PLURIEL } from "@/crm/lib/format";
import { emballages, formules, prestationsPour, PRESTATIONS } from "@/crm/lib/tarif";
import { chiffresTelephone, correspond, dansVue, emailValide, etatEspace, lienTelephone, nomAffiche, telephoneLisible, type LigneClient } from "@/crm/clients/commun";
import { ecartAppareil, estCategorie, FORMAT_IDENTIFIANT, heureParis, identifiantPropose, identifiantSaisi, jourLong, libelleCategorie, momentParis, urlPhoto } from "@/terrain/regles";
import { appliquerOp, cleOp, enfiler, volumePiece, type EtatSaisie } from "@/crm/visites/tablette/etat";
import { lireReponse } from "@/crm/rdv/sms";
import { canauxDeRappel, clientFictif, rappelPrevu } from "@/crm/visites/rappels";
import { composerEmailCrm, remplir } from "@/crm/messages/rendu";
import type { Operation } from "@/lib/visite/regles";

const espaces = (s: string) => s.replace(/[  ]/g, " ");

describe("creation/commun · téléphone, e-mail, lieux", () => {
  it("les 9 derniers chiffres rapprochent « 06 12… » et « +33 6 12… »", () => {
    expect(cleTelephone("06 12 34 56 78")).toBe("612345678");
    expect(cleTelephone("+33 6 12 34 56 78")).toBe("612345678");
    expect(cleTelephone("0612")).toBeNull();
    expect(cleTelephone(null)).toBeNull();
  });
  it("une adresse e-mail normalisée, ou rien", () => {
    expect(cleEmail("  Jean@EXAMPLE.fr ")).toBe("jean@example.fr");
    for (const e of ["jean@x", "a b@c.fr", "jean@x.c", "jean@x.123", "", null]) expect(cleEmail(e)).toBeNull();
  });
  it("la ville et le département d'une adresse libre", () => {
    expect(lieu("5 place Bellecour, 69002 Lyon")).toEqual({ ville: ["lyon"], departement: "69" });
    expect(lieu("97200 Fort-de-France")).toEqual({ ville: ["fort-de-france"], departement: "972" });
    expect(lieu("22 quai Saint-Vincent, Lyon 6e")).toEqual({ ville: ["lyon"], departement: null });
    expect(lieu("Papeete, Tahiti")).toEqual({ ville: ["papeete"], departement: null });
    expect(lieu("Saint-Étienne")).toEqual({ ville: ["saint-etienne"], departement: null });
    expect(lieu("")).toBeNull();
    expect(lieu("75")).toBeNull();
  });
  it("même ville : les mots de l'une contiennent le premier mot de l'autre ; même département", () => {
    expect(memeVille(lieu("Bordeaux"), lieu("Bordeaux Lac"))).toBe(true);
    expect(memeVille(lieu("Lyon"), lieu("Paris"))).toBe(false);
    expect(memeVille(null, lieu("Lyon"))).toBe(false);
    expect(memeDepartement(lieu("69001 Lyon"), lieu("69100 Villeurbanne"))).toBe(true);
    expect(memeDepartement(lieu("Lyon"), lieu("Lyon"))).toBe(false); // sans code postal, pas de département
  });
});

describe("creation/commun · le dossier passé le plus proche", () => {
  const source = (o: Partial<SourceDossier> = {}): SourceDossier => ({
    genre: "dossier", id: 1, ref: "BD-1", clientId: 1, client: "X", statut: "termine", creeLe: "2026-01-01", auteur: null, volume: 30, depart: null, arrivee: null,
    champs: { type: "particulier", type_demenagement: "national" }, observations: null, ...o,
  });
  it("même destination, même volume, même segment et type : 100 %, raisons par poids", () => {
    const p = scorer({ arrivee: "Lyon", volume: 30, type: "particulier", type_demenagement: "national" }, source(), { arrivee: lieu("69003 Lyon"), depart: null });
    expect(p?.score).toBe(100);
    expect(p?.raisons.map(espaces)).toEqual(["même destination", "volume proche (30 m³)", "même segment", "même type de déménagement"]);
  });
  it("volume à 25 % : la moitié des points du volume, encore « proche »", () => {
    // écart 10 / 40 = 0,25 → 20 × (1 − 0,25 / 0,5) = 10 points ; possible 20 + 30, obtenu 10 → 20 %
    const p = scorer({ volume: 40 }, source({ champs: {} }), { arrivee: null, depart: null });
    expect(p).toMatchObject({ score: 20 });
    expect(p!.raisons.map(espaces)).toEqual(["volume proche (30 m³)"]);
  });
  it("même département d'arrivée : 18 points sur 35", () => {
    const p = scorer({ arrivee: "69001 Lyon" }, source({ champs: {} }), { arrivee: lieu("69100 Villeurbanne"), depart: null });
    expect(p).toMatchObject({ score: Math.round((100 * 18) / 65), raisons: ["même département d'arrivée"] });
  });
  it("rien de comparable, ou seulement le segment et le type : pas un dossier « proche »", () => {
    expect(scorer({ type: "particulier" }, source(), { arrivee: lieu("Lyon"), depart: null })).toBeNull();
    expect(scorer({ arrivee: "Lille", type: "particulier", type_demenagement: "national" }, source(), { arrivee: lieu("Lyon"), depart: null })).toBeNull();
    expect(scorer({ volume: 0 }, source(), { arrivee: null, depart: null })).toBeNull();
  });
  it("propriété : le score va de 0 à 100", () => {
    for (const v of [1, 10, 30, 60, 500]) for (const a of ["Lyon", "Lille", null]) {
      const p = scorer({ volume: v, arrivee: a ?? undefined, depart: "Paris", type: "compte" }, source({ depart: null }), { arrivee: lieu("Lyon"), depart: lieu("75001 Paris") });
      if (p) { expect(p.score).toBeGreaterThanOrEqual(0); expect(p.score).toBeLessThanOrEqual(100); }
    }
  });
});

describe("creation/commun · périodes, mois du CA, libellés", () => {
  const maintenant = new Date(2026, 10, 15, 12).getTime(); // 15 novembre 2026
  it("les douze prochains mois, celui en cours compris, à cheval sur l'année", () => {
    const m = moisAVenir(new Date(2026, 10, 15));
    expect(m[0]).toBe("Novembre 2026");
    expect(m[2]).toBe("Janvier 2027");
    expect(m[11]).toBe("Octobre 2027");
  });
  it("une période abrégée se développe ; sans année, la prochaine occurrence du mois", () => {
    expect(developperPeriode("janv", maintenant)).toBe("Janvier 2027");
    expect(developperPeriode("nov", maintenant)).toBe("Novembre 2026");
    expect(developperPeriode("mars 27", maintenant)).toBe("Mars 2027");
    expect(developperPeriode("Déc. 2030", maintenant)).toBe("Décembre 2030");
    expect(developperPeriode("aout", maintenant)).toBe("Août 2027");
    expect(developperPeriode("fév.", maintenant)).toBe("Février 2027");
  });
  it("une saisie ambiguë ou libre reste telle quelle", () => {
    for (const p of ["ju", "jui", "Fin janvier", "mars 2", "", "  "]) expect(developperPeriode(p, maintenant)).toBe(p);
  });
  it("le mois du CA, lu dans une période qui nomme un mois et une année", () => {
    expect(moisDepuisPeriode("Fin janvier 2027")).toBe("2027-01-01");
    expect(moisDepuisPeriode("Courant août 2027")).toBe("2027-08-01");
    expect(moisDepuisPeriode("2027")).toBeNull();
    expect(moisDepuisPeriode("février")).toBeNull();
    expect(moisDepuisPeriode("Marseille 2027")).toBeNull(); // « mars » n'est pas un mot de « Marseille »
    expect(moisDepuisPeriode(null)).toBeNull();
  });
  it("depuis : aujourd'hui, hier, en jours, en mois au-delà de 45 jours", () => {
    const il = (j: number) => new Date(maintenant - j * 86_400_000).toISOString();
    expect(depuis(il(0), maintenant)).toBe("aujourd'hui");
    expect(depuis(il(-3), maintenant)).toBe("aujourd'hui");
    expect(depuis(il(1), maintenant)).toBe("hier");
    expect(depuis(il(44), maintenant)).toBe("il y a 44 j");
    expect(depuis(il(45), maintenant)).toBe("il y a 2 mois");
  });
  it("libellés et gardes des segments et types de déménagement", () => {
    expect(libelleSegment("compte")).toBe("Client compte");
    expect(libelleSegment("militaire")).toBe("CIMOB/DICOM");
    expect(libelleSegment("x")).toBeNull();
    expect(libelleType("gm")).toBe("Garde-meuble");
    expect(segmentValide("partenaire") && typeValide("aerien")).toBe(true);
    expect(segmentValide("toString") || typeValide(1)).toBe(false);
    expect(court("12 rue de Rivoli, 75004 Paris")).toBe("75004 Paris");
    expect(court(null)).toBe("—");
  });
});

describe("appels/regles · score de pertinence", () => {
  it("une visite de demain : urgence 45, attente pleine ; potentiel inconnu = 10", () => {
    expect(scoreAppel({ source: "visite", potentiel: null, montant: null, attenteHeures: 0 })).toEqual({ total: 70, urgence: 45, potentiel: 10, montant: 0, attente: 15, signal: 0 });
  });
  it("un rappel : la fraîcheur décroît de 15 à 0 en trois jours", () => {
    // 35 + 80 × 0,2 + 20 × 2 500 / 5 000 + 15 = 76
    expect(scoreAppel({ source: "rappel", potentiel: 80, montant: 2500, attenteHeures: 0 }).total).toBe(76);
    expect(scoreAppel({ source: "rappel", potentiel: 80, montant: 2500, attenteHeures: 36 }).attente).toBe(8); // 7,5 → 8
    expect(scoreAppel({ source: "nouvelle", potentiel: 80, montant: 2500, attenteHeures: 500 }).attente).toBe(0);
  });
  it("un devis sans réponse : l'attente monte de 0 à 15 ; le signal chaud ajoute 10", () => {
    expect(scoreAppel({ source: "devis", potentiel: 50, montant: 0, attenteHeures: 0 }).attente).toBe(0);
    expect(scoreAppel({ source: "devis", potentiel: 50, montant: 0, attenteHeures: 100 }).attente).toBe(15);
    expect(scoreAppel({ source: "devis", potentiel: 50, montant: 0, attenteHeures: 0, chaud: true }).signal).toBe(10);
  });
  it("bornes : jamais plus de 100, jamais négatif, entrées non numériques ramenées à 0", () => {
    expect(scoreAppel({ source: "visite", potentiel: 100, montant: 1e9, attenteHeures: 0, chaud: true }).total).toBe(100);
    const s = scoreAppel({ source: "devis", potentiel: NaN, montant: -500, attenteHeures: NaN });
    expect(s).toMatchObject({ potentiel: 0, montant: 0, attente: 0, total: 20 });
    expect(scoreAppel({ source: "rappel", potentiel: -40, montant: null, attenteHeures: -10 }).attente).toBe(15);
    expect(detailScore(scoreAppel({ source: "devis", potentiel: 50, montant: 0, attenteHeures: 0, chaud: true }))).toBe("Urgence 20/45 · potentiel 10/20 · montant 0/20 · attente 0/15 · signal chaud +10");
  });
  it("la clé d'un appel : aller-retour, sources et longueurs contrôlées", () => {
    expect(lireCle(cleAppel("devis", "12", "2026-11-01T10:00:00Z"))).toEqual({ source: "devis", objetId: "12", occurrence: "2026-11-01T10:00:00Z" });
    expect(lireCle("visite|5|a|b")).toEqual({ source: "visite", objetId: "5", occurrence: "a|b" });
    expect(lireCle(`rappel|1|${"o".repeat(200)}`)?.occurrence).toHaveLength(64);
    for (const c of ["pirate|1|x", "devis||x", `devis|${"9".repeat(65)}|x`, "", null as unknown as string]) expect(lireCle(c)).toBeNull();
    expect(sourceDe("nouvelle")?.court).toBe("Nouvelle demande");
  });
  it("le tri : pertinence (score puis échéance) ou chronologique (la plus récente d'abord), stable", () => {
    const a = (id: string, total: number, echeance: string) => ({ id, echeance, score: { total } as never });
    const l = [a("x", 50, "2026-11-01T10:00:00Z"), a("y", 80, "2026-10-01T10:00:00Z"), a("z", 50, "2026-11-05T10:00:00Z"), a("w", 50, "pas une date"), a("v", 50, "2026-11-01T10:00:00Z")];
    expect(trier(l, "pertinence").map((x) => x.id)).toEqual(["y", "z", "x", "v", "w"]);
    expect(trier(l, "chrono").map((x) => x.id)).toEqual(["z", "x", "v", "y", "w"]);
    expect(l.map((x) => x.id)).toEqual(["x", "y", "z", "w", "v"]); // l'original n'est pas trié en place
  });
});

describe("appels/regles · téléphone", () => {
  it("affichage par paires d'un numéro français, sous toutes ses formes", () => {
    for (const t of ["0612345678", "+33 6 12 34 56 78", "0033612345678", "33612345678", "06.12.34.56.78"]) expect(telAffiche(t)).toBe("06 12 34 56 78");
    expect(telAffiche("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(telAffiche("  ")).toBeNull();
  });
  it("le lien d'appel : chiffres et « + », un numéro français en +33", () => {
    expect(telLien("06 12 34 56 78")).toBe("tel:+33612345678");
    expect(telLien("33612345678")).toBe("tel:+33612345678");
    expect(telLien("+44 20 7946 0958")).toBe("tel:+442079460958");
    expect(telLien("abc")).toBeNull();
    expect(telLien(null)).toBeNull();
  });
  // Protège la notation internationale « +33 (0)6 … » : le « (0) » ne se compose pas.
  it("« +33 (0)6 12 34 56 78 » se compose et s'affiche comme un numéro français", () => {
    expect(telLien("+33 (0)6 12 34 56 78")).toBe("tel:+33612345678");
    expect(telAffiche("+33 (0)6 12 34 56 78")).toBe("06 12 34 56 78");
  });
});

describe("demandes/araignee", () => {
  const champs = (o: Partial<ChampsCompletude> = {}): ChampsCompletude => ({
    client: "Anne", email: "a@b.fr", telephone: "06", depart: "Lyon", arrivee: "Paris", departAdresse: "1 rue X", arriveeAdresse: null, volume: 30, dateSouhaitee: "2027-01-10", parcours: "particulier", ...o,
  });
  it("rang centile : les ex æquo comptent pour moitié", () => {
    const r = rangCentile([40, 10, 30, 20]);
    expect([10, 20, 25, 30, 40].map(r)).toEqual([13, 38, 50, 63, 88]); // (0 + ½)/4 = 12,5 % → 13 ; (3 + ½)/4 = 87,5 % → 88
    expect(rangCentile([10, 10, 10])(10)).toBe(50);
    expect(rangCentile([7])(7)).toBe(100);
    expect(rangCentile([])(5)).toBeNull();
    expect(r(null)).toBeNull();
  });
  it("propriété : le rang croît avec la valeur et reste entre 0 et 100", () => {
    const toutes = Array.from({ length: 50 }, (_, i) => (i * 37) % 23);
    const r = rangCentile(toutes);
    let avant = -1;
    for (let v = -5; v < 30; v++) { const x = r(v)!; expect(x).toBeGreaterThanOrEqual(avant); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100); avant = x; }
  });
  it("complétude : la part des huit informations utiles", () => {
    expect(completude(champs())).toBe(100);
    expect(completude(champs({ email: "  ", dateSouhaitee: null }))).toBe(75);
    expect(manques(champs({ email: "  ", dateSouhaitee: null, departAdresse: null }))).toEqual(["e-mail", "adresse précise", "date souhaitée"]);
    const vide = champs({ client: null, email: null, telephone: null, depart: null, arrivee: null, departAdresse: null, volume: null, dateSouhaitee: null });
    expect(completude(vide)).toBe(0);
    expect(completude({ ...vide, parcours: "mutation" })).toBe(13); // sans volume à donner : 1/8 = 12,5 % → 13
  });
  it("l'araignée : facilité = 100 − difficulté bornée ; pas de montant pour un parcours sans prix", () => {
    const rangs = { volume: rangCentile([10, 30, 50]), montant: rangCentile([1000, 2000]) };
    const a = araigneeDe({ ...champs(), potentiel: 70, difficulte: 130, estimation: 2000 }, rangs, null);
    expect(a.valeurs).toEqual({ potentiel: 70, facilite: 0, prestige: null, volume: 50, montant: 75, completude: 100 });
    expect(araigneeDe({ ...champs({ parcours: "entreprise", volume: 0 }), potentiel: null, difficulte: -20, estimation: 2000 }, rangs, null).valeurs).toMatchObject({ facilite: 100, montant: null, volume: null });
  });
  it("le prestige en clair", () => {
    expect(basePrestige(null)).toBe("Prestige inconnu : commune non reconnue");
    expect(espaces(basePrestige({ score: 82, prix: 4298, commune: "Palaiseau", ventes: 120, periode: "2021–2025", ou: "arrivée" }))).toBe("Prestige 82/100 · 4 298 €/m² médian (DVF 2021–2025, Palaiseau)");
    expect(basePrestige({ score: null, prix: 1000, commune: "X", ventes: 2, periode: "2021–2025", ou: "départ" })).toMatch(/^Prestige non noté \(moins de 5 ventes\)/);
  });
  it("la clé d'une commune : code postal sans espaces, ville aplatie", () => {
    expect(cleCommune("75 016", "Paris 16e Arrondissement")).toBe("75016|paris 16e arrondissement");
    expect(cleCommune(null, "  Saint-Étienne ")).toBe("|saint etienne");
    expect(cleCommune(null, null)).toBe("|");
  });
});

describe("sections et réglages", () => {
  it("la section d'une adresse sous /dashboard ; rien ailleurs", () => {
    expect(sectionDe("/demandes")).toBeNull();
    expect(sectionDe("/dashboard/parametres/facturation")?.cle).toBe("reglages");
    expect(sectionDe("/dashboard/parametresXYZ")?.cle).toBe("demandes");
    expect(sectionDe("/dashboard/espace-client/sav")?.cle).toBe("espace-client");
    expect(sectionDe("/dashboard/0f8fad5b-d9cb-469f-a165-70867728950e")?.cle).toBe("demandes");
  });
  it("l'onglet actif, la fiche d'un dossier client relevant des Dossiers", () => {
    const ec = SECTIONS[1];
    expect(ongletActif(ec.onglets[0], "/dashboard/espace-client/dossiers/abc")).toBe(true);
    expect(ongletActif(ec.onglets[1], "/dashboard/espace-client/messages/12")).toBe(false);
    expect(ongletActifDe(ec, "/dashboard/espace-client/cartons", null)?.label).toBe("Cartons du samedi");
    expect(ongletActifDe(ec, "/ailleurs", null)).toBeUndefined();
  });
  it("les pages qui posent leur propre en-tête", () => {
    expect(aEnTetePropre("/dashboard/tableau-de-bord")).toBe(true);
    expect(aEnTetePropre("/dashboard/0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(aEnTetePropre("/dashboard/espace-client/dossiers/x")).toBe(true);
    expect(aEnTetePropre("/dashboard/abc")).toBe(false);
  });
  it("la page de Réglages d'une adresse : le plus long préfixe", () => {
    expect(pageReglageDe("/dashboard/parametres/facturation/x")?.page.href).toBe("/dashboard/parametres/facturation");
    expect(pageReglageDe("/dashboard/parametres")?.page.label).toBe("Paramètres");
    expect(pageReglageDe("/reglages")).toBeNull();
    expect(surtitreReglages("/dashboard/equipe")).toBe("Réglages · Entreprise");
    expect(surtitreReglages("/nulle-part")).toBe("Réglages");
    expect(new Set(PAGES_REGLAGES.map((p) => p.href)).size).toBe(PAGES_REGLAGES.length);
  });
});

describe("crm/lib/format et tarif", () => {
  it("euros arrondis, m³, heures décimales, dates", () => {
    expect(espaces(eur(1234.4))).toBe("1 234 €");
    expect(espaces(eur("12"))).toBe("12 €");
    expect(eur(null)).toBe("—");
    expect(m3(12.34)).toBe("12,3 m³");
    expect(m3(undefined)).toBe("0 m³");
    expect(heure(9.5)).toBe("9h30");
    expect(heure(9)).toBe("9h");
    expect(heure(14.25)).toBe("14h15");
    expect(dateFr(null)).toBe("—");
  });
  it("le nom affiché, les initiales, la vignette d'un dossier", () => {
    expect(nomClient({ societe: "Safran", prenom: "A", nom: "B" })).toBe("Safran");
    expect(nomClient({ prenom: "Anne", nom: null })).toBe("Anne");
    expect(initiales("jean-paul  dupont")).toBe("JD");
    expect(initiales("")).toBe("");
    expect(photoPour("Lyon 3e", 1)).toBe("/photos-crm/lyon.jpg");
    expect(photoPour("Fort-de-France", 2)).toBe("/photos-crm/montreal.jpg");
    expect(photoPour(null, 5)).toBe("/photos-crm/interieur-2.jpg");
    expect(STATUTS.planifie.label).toBe("Planifié");
    expect(TYPES_PLURIEL.logement_social).toBe("Logements sociaux");
  });
  it("les formules de la V1 : premium ≥ standard ≥ économique, montants à la dizaine, 8 m³ au moins", () => {
    // 30 m³ : transport 30 × 62 + 380 = 2 240 ; fragiles 270 ; total 540 ; déballage 420 ; démontage 180
    expect(formules(30).map((f) => [f.cle, f.montant])).toEqual([["premium", 3650], ["standard", 2690], ["economique", 2420]]);
    expect(formules(0).map((f) => f.montant)).toEqual(formules(8).map((f) => f.montant));
    for (const v of [0, 1, 8, 12.5, 30, 99, 400]) {
      const [p, s, e] = formules(v);
      expect(p.montant).toBeGreaterThanOrEqual(s.montant);
      expect(s.montant).toBeGreaterThanOrEqual(e.montant);
      for (const f of [p, s, e]) {
        expect(f.montant).toBe(f.lignes.reduce((a, l) => a + l.prix, 0));
        expect(f.montant % 10).toBe(0);
        for (const l of f.lignes) if (l.charge === "client") expect(l.prix).toBe(0);
      }
    }
  });
  it("les emballages par paquets de 20", () => {
    expect(emballages(30)).toEqual({ cartonsStandard: 60, cartonsLivres: 20, penderies: 4, bulle: 2 });
    expect(emballages(0)).toEqual({ cartonsStandard: 0, cartonsLivres: 0, penderies: 2, bulle: 1 });
  });
  it("les prestations par formule ; une formule inconnue lit Standard", () => {
    expect(prestationsPour("premium").filter((p) => p.charge === "bailly")).toHaveLength(11);
    expect(prestationsPour("inconnue")).toEqual(prestationsPour("standard"));
    expect(prestationsPour("economique")).toHaveLength(PRESTATIONS.length);
  });
});

describe("clients/commun", () => {
  it("les chiffres d'un numéro à la française", () => {
    expect(chiffresTelephone("+33 6 12 34 56 78")).toBe("0612345678");
    expect(chiffresTelephone("0033 6 12 34 56 78")).toBe("0612345678");
    expect(chiffresTelephone("+44 20 7946 0958")).toBe("442079460958");
    expect(chiffresTelephone(null)).toBe("");
  });
  it("la recherche : chaque mot, un numéro chiffre à chiffre, une référence telle que tapée", () => {
    expect(correspond("benoit lyon", "benoit lefevre lyon", "")).toBe(true);
    expect(correspond("benoit paris", "benoit lefevre lyon", "")).toBe(false);
    expect(correspond("06 12 34", "x", "0612345678")).toBe(true);
    expect(correspond("+33 6 12 34 56 78", "x", "0612345678")).toBe(true);
    expect(correspond("2026-0147", "dossier bd-2026-0147", "")).toBe(true);
    expect(correspond("   ", "x", "")).toBe(true);
  });
  it("affichage, lien d'appel, e-mail, état de l'espace, vues, nom affiché", () => {
    expect(telephoneLisible("0033612345678")).toBe("06 12 34 56 78");
    expect(telephoneLisible(" +1 555 0100 ")).toBe("+1 555 0100");
    expect(lienTelephone("06 12")).toBeNull();
    expect(lienTelephone("+33 6 12 34 56 78")).toBe("tel:+33612345678");
    expect(emailValide(" a@b.fr ")).toBe(true);
    expect(emailValide("a@b")).toBe(false);
    expect(etatEspace(0, "2026-01-01", (d) => d).cle).toBe("aucun");
    expect(etatEspace(2, "2026-11-01", (d) => d.slice(8))).toMatchObject({ cle: "vu", label: "Vu le 01" });
    expect(etatEspace(1, null, (d) => d).cle).toBe("jamais");
    const l = { enCours: 0, reste: 0.6, aRelancer: false, nbDossiers: 0 } as LigneClient;
    expect([dansVue(l, "en_cours"), dansVue(l, "a_relancer"), dansVue(l, "sans_dossier"), dansVue(l, "tous" as never)]).toEqual([false, true, true, true]);
    expect(dansVue({ ...l, reste: 0.5 }, "a_relancer")).toBe(false);
    expect(nomAffiche({ societe: "  ", prenom: " ", nom: null })).toBe("Sans nom");
  });
});

describe("terrain/regles", () => {
  it("l'identifiant proposé d'un déménageur, au format attendu", () => {
    expect(identifiantPropose("Karim", "Dubois-Leroy")).toBe("karim.d");
    expect(identifiantPropose("Éloïse", "")).toBe("eloise");
    expect(identifiantPropose("Jean Pierre", "Ô'Neil")).toBe("jeanpierre.o");
    expect(identifiantPropose("", "Martin")).toBe("");
    for (const [p, n] of [["Karim", "Dubois"], ["Anne-Sophie", "Lefèvre"], ["Zoé", "Ba"]]) expect(FORMAT_IDENTIFIANT.test(identifiantPropose(p, n))).toBe(true);
    expect(identifiantSaisi("  Karim.D ")).toBe("karim.d");
    expect(FORMAT_IDENTIFIANT.test("k@rim")).toBe(false);
  });
  it("catégories, heures et jours à Paris, écart de l'horloge de l'appareil, adresses", () => {
    expect(estCategorie("apres")).toBe(true);
    expect(estCategorie("toString")).toBe(false);
    expect(libelleCategorie("detail")).toBe("Détail");
    expect(libelleCategorie("x")).toBe("x");
    expect(heureParis("2026-11-15T13:03:00Z")).toBe("14:03");
    expect(heureParis("2026-07-15T13:03:00Z")).toBe("15:03");
    expect(jourLong("2026-11-07")).toBe("samedi 7 novembre");
    expect(jourLong("2027-01-01", true)).toBe("vendredi 1 janvier 2027");
    expect(momentParis("2026-11-07T13:03:00Z")).toBe("7 nov. 2026 à 14:03");
    expect(ecartAppareil({ priseLe: "2026-11-07T13:00:00Z", priseAppareil: "2026-11-07T13:31:00Z" })).toBe(true);
    expect(ecartAppareil({ priseLe: "2026-11-07T13:00:00Z", priseAppareil: "2026-11-07T12:30:00Z" })).toBe(false);
    expect(ecartAppareil({ priseLe: "2026-11-07T13:00:00Z", priseAppareil: null })).toBe(false);
    expect(urlPhoto(4, { vignette: true })).toBe("/api/terrain/photos/4?taille=vignette");
    expect(urlPhoto(4, { telecharger: true })).toBe("/api/terrain/photos/4?telecharger=1");
  });
});

describe("visites/tablette · état de la saisie et file d'opérations", () => {
  const vide: EtatSaisie = { pieces: [], objets: [], etapes: [{ id: 1, etage: null, ascenseur: false } as never], remarques: null, options: [], formule: null };
  const piece = (cle: string, nom: string, ordre: number): Operation => ({ t: "piece", cle, nom, ordre, remarque: null });
  const objet = (cle: string, pieceCle: string, quantite: number, volume: number): Operation => ({ t: "objet", cle, piece: pieceCle, libelle: "Objet", quantite, volume, demontage: false, fragile: false, note: null });

  it("pièces rangées par ordre ; renommer remplace ; supprimer une pièce retire ses objets", () => {
    let e = appliquerOp(vide, piece("b", "Chambre", 2));
    e = appliquerOp(e, piece("a", "Salon", 1));
    e = appliquerOp(e, objet("o1", "a", 2, 0.5));
    e = appliquerOp(e, objet("o2", "b", 1, 1.25));
    expect(e.pieces.map((p) => p.nom)).toEqual(["Salon", "Chambre"]);
    e = appliquerOp(e, piece("a", "Séjour", 1));
    expect(e.pieces.map((p) => p.nom)).toEqual(["Séjour", "Chambre"]);
    expect(volumePiece(e.objets, "a")).toBe(1);
    e = appliquerOp(e, { t: "piece-", cle: "a" });
    expect(e.objets.map((o) => o.cle)).toEqual(["o2"]);
    expect(vide.pieces).toEqual([]); // l'état d'origine n'est pas modifié
  });
  it("objet : ajout, remplacement, suppression ; visite : seuls les champs donnés ; étape : fusion", () => {
    let e = appliquerOp(vide, objet("o", "p", 1, 1));
    e = appliquerOp(e, objet("o", "p", 3, 1));
    expect(e.objets).toHaveLength(1);
    expect(e.objets[0].quantite).toBe(3);
    e = appliquerOp(e, { t: "objet-", cle: "o" });
    expect(e.objets).toEqual([]);
    e = appliquerOp({ ...e, remarques: "avant", formule: "premium" }, { t: "visite", remarques: "après" });
    expect(e).toMatchObject({ remarques: "après", formule: "premium" });
    e = appliquerOp(e, { t: "etape", id: 1, etage: "3", ascenseur: true, escalier: null, portage_m: 10, stationnement: null, poids_lourd: null, monte_meuble: null, acces: null } as Operation);
    expect(e.etapes[0]).toMatchObject({ id: 1, etage: "3", ascenseur: true, portage_m: 10 });
  });
  it("la file : une opération remplace, à sa place, celle du même objet ; les champs de « visite » se cumulent", () => {
    let f = enfiler([], piece("a", "Salon", 1));
    f = enfiler(f, objet("o1", "a", 1, 1));
    f = enfiler(f, piece("a", "Séjour", 1));
    expect(f.map(cleOp)).toEqual(["piece:a", "objet:o1"]); // la pièce reste devant ses objets
    expect((f[0] as { nom: string }).nom).toBe("Séjour");
    f = enfiler(f, { t: "visite", remarques: "r" });
    f = enfiler(f, { t: "visite", formule: "standard" });
    expect(f.at(-1)).toEqual({ t: "visite", remarques: "r", formule: "standard" });
    f = enfiler(f, { t: "piece-", cle: "a" });
    expect(f[0].t).toBe("piece-");
    expect(f).toHaveLength(3);
  });
  it("volume d'une pièce : quantité × volume, au centième", () => {
    expect(volumePiece([{ piece: "a", quantite: 3, volume: 0.1 } as never, { piece: "b", quantite: 9, volume: 9 } as never], "a")).toBe(0.3);
    expect(volumePiece([], "a")).toBe(0);
  });
});

describe("rdv/sms · lireReponse", () => {
  it("« 1 », « 1 oui », « 1. », « Oui » confirment ; « 2 », « non » annulent", () => {
    for (const t of ["1", " 1 ", "1 oui", "1.", "1!", "Oui", "oui merci", "OUI"]) expect(lireReponse(t)).toBe("confirme");
    for (const t of ["2", "2.", "2 je ne peux pas", "Non", "non merci"]) expect(lireReponse(t)).toBe("annule");
  });
  it("tout autre texte n'est pas une réponse", () => {
    for (const t of ["10", "12h ça me va", "1oui", "nonobstant", "ouistiti", "peut-être", "", "３", "+1"]) expect(lireReponse(t)).toBeNull();
  });
});

describe("visites/rappels · rappel de la veille prévu", () => {
  const maintenant = new Date("2026-11-16T10:00:00Z");
  const client = { email: "anne@orange.fr", telephone: "06 12 34 56 78", notes: null };
  it("une visite sur place de demain : SMS et e-mail, la veille = aujourd'hui", () => {
    expect(rappelPrevu({ type: "phys", dossier_id: 1, debut: "2026-11-17T08:00:00Z", termine: false }, client, maintenant)).toEqual({ canaux: ["sms", "email"], veille: "2026-11-16", fictif: false });
  });
  it("le jour de la visite est celui de Paris (0 h 30 le 17 = 23 h 30 UTC le 16)", () => {
    expect(rappelPrevu({ type: "phys", dossier_id: 1, debut: "2026-11-16T23:30:00Z", termine: false }, client, maintenant)?.veille).toBe("2026-11-16");
  });
  it("pas de rappel : visio, sans dossier, terminée, du jour même ou passée", () => {
    expect(rappelPrevu({ type: "visio", dossier_id: 1, debut: "2026-11-17T08:00:00Z", termine: false }, client, maintenant)).toBeNull();
    expect(rappelPrevu({ type: "phys", dossier_id: null, debut: "2026-11-17T08:00:00Z", termine: false }, client, maintenant)).toBeNull();
    expect(rappelPrevu({ type: "phys", dossier_id: 1, debut: "2026-11-17T08:00:00Z", termine: true }, client, maintenant)).toBeNull();
    expect(rappelPrevu({ type: "phys", dossier_id: 1, debut: "2026-11-16T20:00:00Z", termine: false }, client, maintenant)).toBeNull();
  });
  it("les canaux : SMS avec neuf chiffres au moins, e-mail d'une forme valable", () => {
    expect(canauxDeRappel({ email: "pas-un-mail", telephone: "0612" })).toEqual({ sms: false, email: false });
    expect(canauxDeRappel({ email: " a@b.fr ", telephone: "+33612345678" })).toEqual({ sms: true, email: true });
  });
  it("un client fictif (domaine réservé, fiche marquée) ne reçoit rien", () => {
    expect(clientFictif({ email: "c.bernier@safran.example", notes: null })).toBe(true);
    expect(clientFictif({ email: "x@demo.test ", notes: null })).toBe(true);
    expect(clientFictif({ email: null, notes: "Client fictif (démonstration)" })).toBe(true);
    expect(clientFictif({ email: "anne@orange.fr", notes: "client fidèle" })).toBe(false);
  });
});

describe("messages/rendu · composition d'un e-mail du CRM", () => {
  const ctx = { base: "https://bailly.example/", entreprise: { nom: "Bailly" } };
  it("remplir : variables connues, vides pour les inconnues ou nulles", () => {
    expect(remplir("Bonjour {client}, rendez-vous le {date} à {heure} ({inconnue})", { client: "Anne", date: "lundi", heure: null })).toBe("Bonjour Anne, rendez-vous le lundi à  ()");
    expect(remplir("{n} cartons", { n: 0 })).toBe("0 cartons");
    expect(remplir("{ client } {}", { client: "x" })).toBe("{ client } {}");
  });
  it("ce que saisit le client est échappé partout : sujet, corps, aperçu", () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const m = composerEmailCrm({ objet: "Dossier de {client}", corps: "Bonjour {client},\n\nVotre visite est confirmée." }, { client: hostile }, ctx);
    expect(m.html).not.toContain("<script>alert");
    expect(m.html).not.toContain("<img src=x");
    expect(m.sujet).toBe(`Dossier de ${hostile}`); // le sujet brut est du texte, pas du HTML
    expect(m.texte).toContain(hostile);
  });
  it("sans objet : « Bailly Déménagement »", () => {
    expect(composerEmailCrm({ objet: "  ", corps: "x" }, {}, ctx).sujet).toBe("Bailly Déménagement");
  });
  it("le bloc remplace {elements} seul sur son paragraphe ; sinon il précède la signature (3 paragraphes ou plus) ou termine le texte", () => {
    const bloc = { html: "<div id=bloc></div>", texte: "LISTE" };
    expect(composerEmailCrm({ objet: null, corps: "Bonjour,\n\n{elements}\n\nMerci" }, {}, ctx, { bloc }).texte).toBe("Bonjour,\n\nLISTE\n\nMerci");
    expect(composerEmailCrm({ objet: null, corps: "Bonjour,\n\nIl manque des pièces.\n\nMerci" }, {}, ctx, { bloc }).texte).toBe("Bonjour,\n\nIl manque des pièces.\n\nLISTE\n\nMerci");
    expect(composerEmailCrm({ objet: null, corps: "Bonjour,\n\nIl manque des pièces." }, {}, ctx, { bloc }).texte).toBe("Bonjour,\n\nIl manque des pièces.\n\nLISTE");
    const avec = composerEmailCrm({ objet: null, corps: "Bonjour {client},\n\n{elements}" }, { client: "<b>Anne</b>" }, ctx, { bloc });
    expect(avec.html).toContain("<div id=bloc></div>");
    expect(avec.html).not.toContain("<b>Anne</b>");
  });
});

describe("noms hérités d'Object (remplir, codePays)", async () => {
  const { remplir } = await import("@/crm/messages/rendu");
  const { codePays } = await import("@/crm/facturation/facturx");
  it("« {constructor} » dans un texte de carte reste vide, pas le code d'une fonction", () => {
    expect(remplir("Bonjour {client} {constructor}{toString}", { client: "Mme Dupont" })).toBe("Bonjour Mme Dupont ");
  });
  it("codePays(« constructor ») n'est pas un code pays", () => {
    expect(codePays("constructor")).toBeNull();
    expect(codePays("France")).toBe("FR");
    expect(codePays("pt")).toBe("PT");
  });
});
