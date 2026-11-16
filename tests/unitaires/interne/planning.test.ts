import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: vi.fn(async () => undefined), transaction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/crm/visites/donnees", () => ({ creneauxProposesSemaine: vi.fn(async () => []) }));

import { q } from "@/crm/lib/db";
import { couloirs, decaler, H0, H1, heure, hhmm, lundiDuJour, minutes, position, type Bloc } from "@/crm/planning/grille";
import { estJourneeVisio, estTypeRdv, parleDeVisio, TYPES_RDV } from "@/crm/planning/types-rdv";
import {
  appelClient, dureeParDefaut, phraseConfirmationOubliee, raisonConfirmationOubliee, titreParDefaut, verifierCreneau,
} from "@/crm/planning/planificateur/regles";
import type { CreneauPlanning, EvenementPlanning } from "@/crm/planning/donnees";
import { joursDeLaSemaine } from "@/crm/planning/donnees";
import { estGenre, estMoment, estType, lundiDu, paramTypes, plusJours, semaineIso, TOUS_TYPES, typesDe } from "@/crm/exploitation/planning";
import { estJour, heure as heureForm, ident, jour, nombre, texte } from "@/crm/exploitation/commun";
import { conflit, HEURES_PROPOSEES, suggestions, type Plage } from "@/crm/visites/creneaux";
import { estVisite, etatVisite, ORDRE_ETATS } from "@/crm/visites/cycle";

describe("planning/grille · heures et jours", () => {
  it("hhmm et heure : 540 → « 09:00 » et « 9h », 570 → « 9h30 », 545 → « 9h05 »", () => {
    expect(hhmm(540)).toBe("09:00");
    expect(hhmm(0)).toBe("00:00");
    expect(hhmm(1439)).toBe("23:59");
    expect(heure(540)).toBe("9h");
    expect(heure(570)).toBe("9h30");
    expect(heure(545)).toBe("9h05");
  });
  it("minutes : « 09:30 » → 570 ; « 9 » → 540 ; aller-retour avec hhmm sur toute la journée", () => {
    expect(minutes("09:30")).toBe(570);
    expect(minutes("9")).toBe(540);
    for (let m = 0; m < 1440; m += 7) expect(minutes(hhmm(m))).toBe(m);
  });
  it("le lundi d'une semaine : dimanche, lundi, à cheval sur l'année, sur le changement d'heure", () => {
    expect(lundiDuJour("2026-11-15")).toBe("2026-11-09"); // dimanche
    expect(lundiDuJour("2026-11-16")).toBe("2026-11-16"); // lundi
    expect(lundiDuJour("2027-01-01")).toBe("2026-12-28"); // vendredi
    expect(lundiDuJour("2026-03-29")).toBe("2026-03-23"); // dimanche du passage à l'heure d'été
    expect(lundiDuJour("2026-10-25")).toBe("2026-10-19"); // dimanche du passage à l'heure d'hiver
    expect(lundiDuJour("2028-02-29")).toBe("2028-02-28");
  });
  it("decaler : 29 février, 31 décembre, changements d'heure, recul", () => {
    expect(decaler("2028-02-28", 1)).toBe("2028-02-29");
    expect(decaler("2026-12-31", 1)).toBe("2027-01-01");
    expect(decaler("2026-03-28", 2)).toBe("2026-03-30");
    expect(decaler("2026-10-24", 2)).toBe("2026-10-26");
    expect(decaler("2026-01-01", -1)).toBe("2025-12-31");
    expect(decaler("2026-11-16", 0)).toBe("2026-11-16");
  });
});

describe("planning/grille · couloirs des blocs qui se chevauchent", () => {
  it("un bloc prend le premier couloir libre ; une grappe partage la largeur", () => {
    // 1 : 9h–10h, 2 : 9h30–10h30, 3 : 10h–11h (libère le couloir 0), 4 : 11h40–12h (seul)
    const c = couloirs([{ id: 1, debut: 540, fin: 600 }, { id: 2, debut: 570, fin: 630 }, { id: 3, debut: 600, fin: 660 }, { id: 4, debut: 700, fin: 720 }]);
    expect(Object.fromEntries(c)).toEqual({ 1: [0, 2], 2: [1, 2], 3: [0, 2], 4: [0, 1] });
  });
  it("des blocs bout à bout ne se chevauchent pas", () => {
    const c = couloirs([{ id: 1, debut: 540, fin: 600 }, { id: 2, debut: 600, fin: 660 }]);
    expect(Object.fromEntries(c)).toEqual({ 1: [0, 1], 2: [0, 1] });
  });
  it("aucun bloc : aucun couloir", () => {
    expect(couloirs([]).size).toBe(0);
  });
  it("propriété : deux blocs qui se chevauchent n'ont jamais le même couloir (500 journées tirées)", () => {
    let g = 3;
    const r = () => ((g = (g * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 500; k++) {
      const blocs: Bloc[] = Array.from({ length: Math.floor(r() * 12) }, (_, i) => {
        const debut = 420 + Math.floor(r() * 700);
        return { id: i, debut, fin: debut + 15 + Math.floor(r() * 180) };
      });
      const c = couloirs(blocs);
      expect(c.size).toBe(blocs.length);
      for (const a of blocs) {
        const [la, na] = c.get(a.id)!;
        expect(la).toBeLessThan(na);
        for (const b of blocs) if (a.id !== b.id && a.debut < b.fin && b.debut < a.fin) {
          expect(c.get(b.id)![0]).not.toBe(la);
          expect(c.get(b.id)![1]).toBe(na); // même grappe, même largeur
        }
      }
    }
  });
  it("position : un rendez-vous de 6 h ou de 22 h reste visible dans la grille 7 h – 20 h", () => {
    const haut = 60;
    expect(position(540, 60, haut)).toEqual({ top: 120, height: 58 });
    expect(position(360, 60, haut)).toEqual({ top: 0, height: 28 });
    const tard = position(22 * 60, 60, haut);
    expect(tard.top + tard.height).toBeLessThanOrEqual((H1 - H0) * haut);
    expect(tard.top).toBe(750);
    expect(position(600, 5, haut).height).toBe(28); // au moins une demi-heure affichée
    expect(position(600, 0, 10).height).toBe(22); // jamais moins de 22 px
  });
});

describe("planning/types-rdv", () => {
  it("les quatre types connus", () => {
    expect(Object.keys(TYPES_RDV)).toEqual(["phys", "visio", "tache", "perso"]);
    for (const t of ["phys", "visio", "tache", "perso"]) expect(estTypeRdv(t)).toBe(true);
    for (const t of ["", "PHYS", "visite", null, 1, undefined]) expect(estTypeRdv(t)).toBe(false);
  });
  // Protège la garde Object.hasOwn : les noms hérités d'Object ne sont pas des types de rendez-vous.
  it("un nom hérité d'Object (« toString », « constructor ») n'est pas un type de rendez-vous", () => {
    for (const t of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) expect(estTypeRdv(t)).toBe(false);
  });
  it("une règle perso qui parle de visio, une journée visio", () => {
    expect(parleDeVisio("Semaine des enfants · VISIOS uniquement")).toBe(true);
    expect(parleDeVisio(null)).toBe(false);
    expect(estJourneeVisio({ journee: true, type: "perso", titre: "Journée visio", lieu: null })).toBe(true);
    expect(estJourneeVisio({ journee: true, type: "visio", titre: "x", lieu: null })).toBe(true);
    expect(estJourneeVisio({ journee: false, type: "visio", titre: "x", lieu: null })).toBe(false);
    expect(estJourneeVisio({ journee: true, type: "tache", titre: "Cartons", lieu: "En visio" })).toBe(true);
  });
});

describe("planning/planificateur · titres, durées, confirmation", () => {
  it("appelClient : la société, sinon Mme / M. et le nom, sinon prénom et nom", () => {
    expect(appelClient({ societe: "  Safran ", civilite: "Madame", nom: "Dumont" })).toBe("Safran");
    expect(appelClient({ civilite: "Madame", nom: "Dumont", prenom: "Anne" })).toBe("Mme Dumont");
    expect(appelClient({ civilite: "Monsieur", nom: "Roussel" })).toBe("M. Roussel");
    expect(appelClient({ civilite: "Madame", prenom: "Anne" })).toBe("Anne");
    expect(appelClient({})).toBe("");
  });
  it("titre proposé seulement pour une visite ; durée 1 h 30 sur place, 1 h sinon", () => {
    expect(titreParDefaut("phys", "Mme Dumont")).toBe("Mme Dumont");
    expect(titreParDefaut("visio", "Mme Dumont")).toBe("Mme Dumont");
    expect(titreParDefaut("tache", "Mme Dumont")).toBe("");
    expect(titreParDefaut("phys", null)).toBe("");
    expect(dureeParDefaut("phys")).toBe(90);
    expect(dureeParDefaut("visio")).toBe(60);
    expect(dureeParDefaut("perso")).toBe(60);
  });
  it("la phrase quand une visite change d'horaire, selon ce que le client avait fait", () => {
    expect(phraseConfirmationOubliee("confirme")).toBe("Le client avait confirmé l'ancien horaire : sa confirmation est remise à zéro.");
    expect(phraseConfirmationOubliee("annule")).toBe("Le client avait annulé l'ancien horaire : sa réponse est remise à zéro.");
    expect(phraseConfirmationOubliee("sans_reponse")).toBe("Le SMS de confirmation annonçait l'ancien horaire : le suivi de la confirmation repart de zéro.");
    expect(raisonConfirmationOubliee("non_parti")).toBe("le SMS de confirmation annonçait l'ancien horaire");
  });
});

describe("planning/planificateur · verifierCreneau", () => {
  const ev = (o: Partial<EvenementPlanning>): EvenementPlanning => ({
    id: 1, type: "phys", titre: "Visite Martin", lieu: null, ville: null, jour: "2026-11-17", debutMin: 600, duree: 60, journee: false, commercial: "Paul Durand", initiales: "PD",
    dossierId: 9, ref: "BD-1", termine: false, fait: false, devisEtabli: false, etat: null, dernier: false, rappel: null, ...o,
  });
  const cr = (o: Partial<CreneauPlanning>): CreneauPlanning => ({ id: 1, jour: "2026-11-17", debutMin: 840, duree: 90, client: "Mme Dupont", dossierId: 5, initiales: "PD", ...o });
  const MAINTENANT = Date.parse("2026-11-16T08:00:00Z");
  const base = { type: "phys" as const, jour: "2026-11-17", debutMin: 540, duree: 90, journee: false, evenements: [] as EvenementPlanning[], creneaux: [] as CreneauPlanning[], dossierId: 1, commercial: "Paul Durand", maintenant: MAINTENANT, debut: Date.parse("2026-11-17T08:00:00Z") };

  it("un créneau libre et à venir ne rencontre rien", () => {
    expect(verifierCreneau(base)).toEqual({ bloquant: false, alertes: [] });
  });
  it("une visite qui chevauche un rendez-vous est bloquée ; une tâche ne l'est pas (avertissement)", () => {
    const o = { ...base, evenements: [ev({ debutMin: 600, duree: 60 })] }; // 9 h – 10 h 30 contre 10 h – 11 h
    const v = verifierCreneau(o);
    expect(v.bloquant).toBe(true);
    expect(v.alertes).toEqual([{ ton: "ko", texte: "Chevauche « Visite Martin » (10h–11h)." }]);
    const t = verifierCreneau({ ...o, type: "tache" });
    expect(t.bloquant).toBe(false);
    expect(t.alertes[0].ton).toBe("attention");
  });
  it("bout à bout n'est pas un chevauchement (fin exclue)", () => {
    expect(verifierCreneau({ ...base, evenements: [ev({ debutMin: 630, duree: 60 })] }).alertes).toEqual([]);
    expect(verifierCreneau({ ...base, evenements: [ev({ debutMin: 480, duree: 60 })] }).alertes).toEqual([]);
  });
  it("ignore les autres jours, les journées entières et les durées nulles", () => {
    const evs = [ev({ jour: "2026-11-18" }), ev({ journee: true, debutMin: 720, duree: 0, type: "perso", titre: "Congé" }), ev({ duree: 0, debutMin: 560 })];
    expect(verifierCreneau({ ...base, evenements: evs }).alertes).toEqual([]);
  });
  it("règle perso « visios uniquement » : laisse passer une visio, bloque une visite sur place et propose la visio", () => {
    const regle = ev({ type: "perso", titre: "Enfants · Visios uniquement", debutMin: 480, duree: 600 });
    const visio = verifierCreneau({ ...base, type: "visio", evenements: [regle] });
    expect(visio.bloquant).toBe(false);
    expect(visio.alertes[0]).toMatchObject({ ton: "info" });
    expect(visio.alertes[0].texte).toMatch(/^Pendant « Enfants · Visios uniquement » \(8h–18h\) : Paul ne fait que des visios/);
    const phys = verifierCreneau({ ...base, evenements: [regle] });
    expect(phys.bloquant).toBe(true);
    expect(phys.alertes[0]).toMatchObject({ ton: "ko", passerEnVisio: true });
  });
  it("un créneau proposé à un autre client bloque une visite ; celui du même dossier informe", () => {
    const autre = verifierCreneau({ ...base, debutMin: 840, creneaux: [cr({})] });
    expect(autre.bloquant).toBe(true);
    expect(autre.alertes[0].texte).toBe("Créneau proposé à Mme Dupont (14h) : il lui reste réservé tant qu'il n'a pas choisi.");
    const meme = verifierCreneau({ ...base, debutMin: 840, creneaux: [cr({ dossierId: 1 })] });
    expect(meme).toEqual({ bloquant: false, alertes: [{ ton: "info", texte: "Ce créneau fait partie de ceux proposés à ce client." }] });
  });
  it("journée visio : avertit une visite sur place, sans bloquer", () => {
    const v = verifierCreneau({ ...base, evenements: [ev({ journee: true, type: "visio", titre: "Journée visio", duree: 0, debutMin: 720 })] });
    expect(v.bloquant).toBe(false);
    expect(v.alertes).toEqual([{ ton: "attention", texte: "Journée visio de Paul (« Journée visio ») : une visite sur place ce jour-là ?", passerEnVisio: true }]);
  });
  it("un créneau passé est refusé ; une journée entière ne l'est que le lendemain (posée à midi)", () => {
    const passe = verifierCreneau({ ...base, debut: MAINTENANT - 1 });
    expect(passe).toEqual({ bloquant: true, alertes: [{ ton: "ko", texte: "Ce créneau est déjà passé." }] });
    expect(verifierCreneau({ ...base, debut: MAINTENANT }).bloquant).toBe(false);
    const midi = Date.parse("2026-11-16T11:00:00Z");
    expect(verifierCreneau({ ...base, journee: true, debut: midi, maintenant: midi + 11 * 3_600_000 }).bloquant).toBe(false);
    expect(verifierCreneau({ ...base, journee: true, debut: midi, maintenant: midi + 12 * 3_600_000 + 1 }).alertes[0].texte).toBe("Cette journée est passée.");
  });
});

describe("planning/donnees · joursDeLaSemaine", () => {
  it("sept jours de Paris, du lundi au dimanche, y compris la semaine du passage à l'heure d'été", () => {
    expect(joursDeLaSemaine(new Date("2026-03-22T23:00:00Z"))).toEqual(["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29"]);
    expect(joursDeLaSemaine(new Date("2026-10-26T00:00:00Z"))[0]).toBe("2026-10-26");
    expect(joursDeLaSemaine(new Date("2026-12-28T00:00:00Z"))).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  });
});

describe("exploitation/planning · filtres et semaines", () => {
  it("le filtre de l'adresse : absent = tout, « aucun » ou vide = rien, sinon la liste connue", () => {
    expect(typesDe(undefined)).toEqual(TOUS_TYPES);
    expect(typesDe("aucun")).toEqual([]);
    expect(typesDe("")).toEqual([]);
    expect(typesDe("national,pirate,gm")).toEqual(["national", "gm"]);
  });
  it("aller-retour adresse ↔ filtre, dans l'ordre canonique", () => {
    expect(paramTypes(TOUS_TYPES)).toBeUndefined();
    expect(paramTypes([])).toBe("aucun");
    expect(paramTypes(["gm", "national"])).toBe("national,gm");
    for (const t of [[], ["maritime"], ["aerien", "bureau", "manuelle"], TOUS_TYPES]) expect(typesDe(paramTypes(t as never))).toEqual(TOUS_TYPES.filter((x) => (t as string[]).includes(x)));
  });
  // Protège les gardes Object.hasOwn du planning d'exploitation (?types=constructor, formulaire).
  it("un nom hérité d'Object n'est ni un type d'opération, ni un genre, ni un moment", () => {
    expect(typesDe("constructor,toString,national")).toEqual(["national"]);
    expect(estGenre("constructor")).toBe(false);
    expect(estMoment("toString")).toBe(false);
  });
  it("gardes : valeurs connues seulement (hors noms hérités)", () => {
    expect(estType("maritime")).toBe(true);
    expect(estType(42)).toBe(false);
    expect(estGenre("livraison")).toBe(true);
    expect(estMoment("apres_midi")).toBe(true);
    expect(estMoment("soir")).toBe(false);
  });
  it("plusJours et lundiDu : fin d'année, années bissextiles", () => {
    expect(plusJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusJours("2024-02-28", 1)).toBe("2024-02-29");
    expect(lundiDu("2027-01-03")).toBe("2026-12-28");
    expect(lundiDu("2026-03-29")).toBe("2026-03-23");
  });
  it("semaine ISO : les cas de bord du calendrier", () => {
    expect(semaineIso("2026-01-01")).toBe(1); // jeudi : semaine 1 de 2026
    expect(semaineIso("2027-01-01")).toBe(53); // vendredi : dernière semaine de 2026 (53 semaines)
    expect(semaineIso("2026-12-31")).toBe(53);
    expect(semaineIso("2027-01-04")).toBe(1);
    expect(semaineIso("2025-12-29")).toBe(1); // lundi : semaine 1 de 2026
    expect(semaineIso("2028-02-29")).toBe(9);
    expect(semaineIso("2026-11-16")).toBe(47);
  });
});

describe("exploitation/commun · lecture des formulaires", () => {
  const f = (o: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(o)) d.set(k, v);
    return d;
  };
  it("texte : sans espaces autour, vide = null, coupé à la longueur maximale", () => {
    expect(texte(f({ a: "  bonjour  " }), "a")).toBe("bonjour");
    expect(texte(f({ a: "   " }), "a")).toBeNull();
    expect(texte(f({}), "a")).toBeNull();
    expect(texte(f({ a: "x".repeat(5000) }), "a")).toHaveLength(2000);
    expect(texte(f({ a: "abcdef" }), "a", 3)).toBe("abc");
  });
  it("nombre : virgule et espaces acceptés ; vide = null ; illisible = NaN", () => {
    expect(nombre(f({ n: "1 234,5" }), "n")).toBe(1234.5);
    expect(nombre(f({ n: "-12" }), "n")).toBe(-12);
    expect(nombre(f({ n: "" }), "n")).toBeNull();
    expect(nombre(f({ n: "douze" }), "n")).toBeNaN();
    expect(nombre(f({ n: "1e400" }), "n")).toBeNaN();
  });
  it("jour : AAAA-MM-JJ ; vide = null ; mal formé = « invalide »", () => {
    expect(jour(f({ j: "2026-11-15" }), "j")).toBe("2026-11-15");
    expect(jour(f({ j: "2028-02-29" }), "j")).toBe("2028-02-29");
    expect(jour(f({ j: "" }), "j")).toBeNull();
    for (const v of ["15/11/2026", "2026-13-01", "2026-11-32", "2026-1-5", "demain"]) expect(jour(f({ j: v }), "j")).toBe("invalide");
    expect(estJour("2026-11-15")).toBe(true);
    expect(estJour(20261115)).toBe(false);
  });
  // Protège le refus d'un jour qui n'existe pas (« 2026-02-30 »), que Date.parse reporte au mois suivant.
  it("jour : une date qui n'existe pas au calendrier est « invalide »", () => {
    for (const v of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-06-31"]) expect(jour(f({ j: v }), "j")).toBe("invalide");
  });
  it("heure : HH:MM seulement", () => {
    expect(heureForm(f({ h: "09:30" }), "h")).toBe("09:30");
    expect(heureForm(f({ h: "9:30" }), "h")).toBeNull();
    expect(heureForm(f({ h: "" }), "h")).toBeNull();
  });
  it("ident : entier positif sûr, sinon null", () => {
    expect(ident("12")).toBe(12);
    for (const v of ["0", "-3", "1.5", "abc", "9007199254740993", null, undefined, ""]) expect(ident(v)).toBeNull();
  });
});

describe("visites/creneaux · créneaux libres proposés", () => {
  afterEach(() => vi.mocked(q).mockReset());
  const occupe = (plages: { debut: string; duree_min: number }[]) => vi.mocked(q).mockResolvedValue(plages.map((p) => ({ debut: new Date(p.debut), duree_min: p.duree_min, libelle: "x" })) as never);

  it("conflit : chevauchement strict, bout à bout permis", () => {
    const p: Plage[] = [{ debut: Date.parse("2026-11-16T08:00:00Z"), fin: Date.parse("2026-11-16T09:00:00Z"), libelle: "Visite" }];
    expect(conflit(p, new Date("2026-11-16T08:30:00Z"), 30)?.libelle).toBe("Visite");
    expect(conflit(p, new Date("2026-11-16T09:00:00Z"), 60)).toBeNull();
    expect(conflit(p, new Date("2026-11-16T07:00:00Z"), 60)).toBeNull();
    expect(conflit([], new Date(), 60)).toBeNull();
  });
  it("à partir du lendemain, en semaine, deux par jour au plus (un le matin, un l'après-midi)", async () => {
    occupe([]);
    const s = await suggestions(1, 90, { maintenant: new Date("2026-11-13T09:00:00Z") }); // vendredi
    expect(s).toHaveLength(8);
    expect(s.map((x) => `${x.jour} ${x.heure}`)).toEqual([
      "2026-11-16 09:00", "2026-11-16 14:00", "2026-11-17 09:00", "2026-11-17 14:00",
      "2026-11-18 09:00", "2026-11-18 14:00", "2026-11-19 09:00", "2026-11-19 14:00",
    ]);
    expect(s[0].debut).toBe("2026-11-16T08:00:00.000Z"); // 9 h à Paris en hiver
    expect(s.every((x) => HEURES_PROPOSEES.includes(x.heure))).toBe(true);
  });
  it("évite ce qui occupe le commercial", async () => {
    occupe([{ debut: "2026-11-16T07:30:00Z", duree_min: 90 }]); // lundi 8 h 30 – 10 h
    const s = await suggestions(1, 60, { nb: 2, maintenant: new Date("2026-11-13T09:00:00Z") });
    expect(s.map((x) => x.heure)).toEqual(["10:30", "14:00"]);
  });
  it("le matin entièrement pris : un seul créneau ce jour-là (deux après-midi ne font pas un choix)", async () => {
    occupe([{ debut: "2026-11-16T07:00:00Z", duree_min: 300 }]); // lundi 8 h – 13 h
    const s = await suggestions(1, 60, { nb: 3, maintenant: new Date("2026-11-13T09:00:00Z") });
    expect(s.map((x) => `${x.jour} ${x.heure}`)).toEqual(["2026-11-16 14:00", "2026-11-17 09:00", "2026-11-17 14:00"]);
  });
  it("à l'heure d'été : 9 h à Paris = 7 h UTC le lundi qui suit le changement", async () => {
    occupe([]);
    const s = await suggestions(1, 60, { nb: 1, maintenant: new Date("2026-03-27T09:00:00Z") });
    expect(s[0]).toEqual({ debut: "2026-03-30T07:00:00.000Z", jour: "2026-03-30", heure: "09:00" });
  });
  it("demandé un samedi soir à 23 h 30 : le lendemain est dimanche, on commence lundi", async () => {
    occupe([]);
    const s = await suggestions(1, 60, { nb: 1, maintenant: new Date("2026-11-14T22:30:00Z") });
    expect(s[0].jour).toBe("2026-11-16");
  });
  it("planning plein sur trois semaines : aucune suggestion", async () => {
    occupe([{ debut: "2026-11-13T00:00:00Z", duree_min: 60 * 24 * 30 }]);
    expect(await suggestions(1, 60, { maintenant: new Date("2026-11-13T09:00:00Z") })).toEqual([]);
  });
  it("interroge l'occupation sur trois semaines, de minuit à minuit à Paris", async () => {
    occupe([]);
    await suggestions(7, 60, { maintenant: new Date("2026-11-13T09:00:00Z"), sauf: 3, saufRdv: 4 });
    const params = vi.mocked(q).mock.calls[0][1] as unknown[];
    expect(params).toEqual([7, "2026-11-13T23:00:00.000Z", "2026-12-04T23:00:00.000Z", 3, 4]);
  });
});

describe("visites/cycle", () => {
  it("sans suite l'emporte (ou dossier perdu), puis devis établi, puis effectuée, sinon planifiée", () => {
    expect(etatVisite({ termine: true, devis_etabli: true, sans_suite: true })).toBe("sans_suite");
    expect(etatVisite({ termine: false, devis_etabli: false, dossier_statut: "perdu" })).toBe("sans_suite");
    expect(etatVisite({ termine: true, devis_etabli: true })).toBe("devis");
    expect(etatVisite({ termine: false, devis_etabli: false, compte_rendu_signe: true })).toBe("effectuee");
    expect(etatVisite({ termine: false, devis_etabli: false })).toBe("planifiee");
    expect(ORDRE_ETATS).toHaveLength(5);
    expect(estVisite("phys") && estVisite("visio")).toBe(true);
    expect(estVisite("tache")).toBe(false);
  });
});
