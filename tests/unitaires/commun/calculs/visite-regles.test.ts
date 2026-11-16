import { describe, expect, it } from "vitest";
import {
  duree,
  empreinteLisible,
  estFormule,
  FORMULES,
  heureParis,
  hhmmParis,
  instantParis,
  jourParis,
  jourSemaine,
  jourVisite,
  jsonCanonique,
  lendemain,
  libelleEtageTexte,
  m3,
  m3Fin,
  minutesParis,
  momentVisite,
  plageVisite,
  resumeAcces,
  volumeObjets,
} from "@/lib/visite/regles";
import { hasard } from "./_outils";

describe("heures à Paris", () => {
  it("« 10 h » ou « 10 h 30 »", () => {
    expect(heureParis("2026-11-12T09:00:00Z")).toBe("10 h");
    expect(heureParis("2026-11-12T09:30:00Z")).toBe("10 h 30");
    expect(heureParis("2026-07-01T08:05:00Z")).toBe("10 h 05"); // heure d'été
    expect(heureParis(new Date("2026-11-12T23:15:00Z"))).toBe("0 h 15");
  });

  it("jourParis : le jour à Paris, à cheval sur minuit", () => {
    expect(jourParis("2026-11-14T23:30:00Z")).toBe("2026-11-15");
    expect(jourParis("2026-11-14T22:59:00Z")).toBe("2026-11-14");
    expect(jourParis("2026-06-30T22:00:00Z")).toBe("2026-07-01");
  });

  it("hhmmParis et minutesParis", () => {
    expect(hhmmParis("2026-11-12T09:30:00Z")).toBe("10:30");
    expect(minutesParis("2026-11-12T09:30:00Z")).toBe(630);
    expect(minutesParis("2026-11-12T23:00:00Z")).toBe(0); // minuit, jamais « 24:00 »
  });

  it("jourVisite et momentVisite", () => {
    expect(jourVisite("2026-11-12T09:30:00Z")).toBe("jeudi 12 novembre");
    expect(jourVisite("2026-11-12T09:30:00Z", true)).toBe("jeudi 12 novembre 2026");
    expect(momentVisite("2026-11-12T09:30:00Z")).toBe("jeudi 12 novembre à 10 h 30");
  });

  it("plageVisite : « 10 h – 11 h 30 », à travers midi et minuit", () => {
    expect(plageVisite("2026-11-12T09:00:00Z", 90)).toBe("10 h – 11 h 30");
    expect(plageVisite("2026-11-12T22:30:00Z", 60)).toBe("23 h 30 – 0 h 30");
  });
});

describe("instantParis — une heure de Paris devient un instant", () => {
  it("hiver : 10 h 30 à Paris = 9 h 30 UTC", () => {
    expect(instantParis("2026-11-12", "10:30").toISOString()).toBe("2026-11-12T09:30:00.000Z");
  });

  it("été : 10 h 30 à Paris = 8 h 30 UTC", () => {
    expect(instantParis("2026-07-01", "10:30").toISOString()).toBe("2026-07-01T08:30:00.000Z");
  });

  it("minuit et 23 h 59", () => {
    expect(instantParis("2026-11-12", "00:00").toISOString()).toBe("2026-11-11T23:00:00.000Z");
    expect(instantParis("2026-11-12", "23:59").toISOString()).toBe("2026-11-12T22:59:00.000Z");
  });

  it("jour du passage à l'heure d'été (29 mars 2026) : 1 h 30 = 0 h 30 UTC ; 3 h = 1 h UTC", () => {
    expect(instantParis("2026-03-29", "01:30").toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(instantParis("2026-03-29", "03:00").toISOString()).toBe("2026-03-29T01:00:00.000Z");
    expect(instantParis("2026-03-29", "12:00").toISOString()).toBe("2026-03-29T10:00:00.000Z");
  });

  it("jour du retour à l'heure d'hiver (25 octobre 2026) : 1 h 30 = 23 h 30 UTC la veille ; 10 h = 9 h UTC", () => {
    expect(instantParis("2026-10-25", "01:30").toISOString()).toBe("2026-10-24T23:30:00.000Z");
    expect(instantParis("2026-10-25", "10:00").toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("l'heure ambiguë du retour (2 h 30, vécue deux fois) se relit bien 2 h 30", () => {
    expect(hhmmParis(instantParis("2026-10-25", "02:30"))).toBe("02:30");
  });

  it("aller-retour : minute par minute de 0 h à 4 h les jours de changement d'heure, puis toute la journée par pas de 17 min", () => {
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const essais: [string, number][] = [];
    for (const jour of ["2026-03-29", "2026-10-25"]) for (let m = 0; m < 4 * 60; m++) essais.push([jour, m]);
    for (const jour of ["2026-03-29", "2026-10-25", "2026-11-12", "2028-02-29"]) for (let m = 0; m < 24 * 60; m += 17) essais.push([jour, m]);
    for (const [jour, m] of essais) {
      const h = hhmm(m);
      if (jour === "2026-03-29" && h >= "02:00" && h < "03:00") continue; // heure qui n'existe pas
      const t = instantParis(jour, h);
      expect(hhmmParis(t)).toBe(h);
      expect(jourParis(t)).toBe(jour);
    }
  }, 30_000);

  it("une heure qui n'existe pas (2 h 30 le 29 mars) tombe une heure plus tard, à 3 h 30", () => {
    expect(hhmmParis(instantParis("2026-03-29", "02:30"))).toBe("03:30");
  });

  it("les instants d'une journée ordinaire croissent avec l'heure", () => {
    let prec = 0;
    for (let m = 0; m < 24 * 60; m += 7) {
      const t = instantParis("2026-11-12", `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`).getTime();
      expect(t).toBeGreaterThan(prec);
      prec = t;
    }
  });
});

describe("jours", () => {
  it.each([
    ["2026-11-15", 1, "2026-11-16"], ["2026-12-31", 1, "2027-01-01"], ["2028-02-28", 1, "2028-02-29"],
    ["2027-02-28", 1, "2027-03-01"], ["2026-03-28", 2, "2026-03-30"], ["2026-11-15", -15, "2026-10-31"],
  ])("lendemain(%s, %s) = %s", (j, n, attendu) => {
    expect(lendemain(j, n)).toBe(attendu);
  });

  it("jourSemaine : 0 dimanche … 6 samedi", () => {
    expect(jourSemaine("2026-11-15")).toBe(0);
    expect(jourSemaine("2026-11-21")).toBe(6);
    expect(jourSemaine("2028-02-29")).toBe(2);
  });
});

describe("durées et volumes", () => {
  it.each([[0, "0 min"], [45, "45 min"], [59, "59 min"], [60, "1 h"], [65, "1 h 05"], [90, "1 h 30"], [120, "2 h"], [615, "10 h 15"]])(
    "duree(%s) = %s",
    (min, attendu) => {
      expect(duree(min)).toBe(attendu);
    },
  );

  it("m3 : au dixième, à la française ; rien vaut zéro", () => {
    expect(m3(12.44)).toBe("12,4 m³");
    expect(m3(12.46)).toBe("12,5 m³");
    expect(m3(30)).toBe("30 m³");
    expect(m3(null)).toBe("0 m³");
    expect(m3(undefined)).toBe("0 m³");
  });

  it("m3Fin : au centième", () => {
    expect(m3Fin(0.15)).toBe("0,15 m³");
    expect(m3Fin(1.2)).toBe("1,2 m³");
    expect(m3Fin(0.123)).toBe("0,12 m³");
  });

  it("volumeObjets : somme quantité × volume, au centième (4 chaises de 0,15 + 1 canapé de 1,5 = 2,1)", () => {
    expect(volumeObjets([{ quantite: 4, volume: 0.15 }, { quantite: 1, volume: 1.5 }])).toBe(2.1);
    expect(volumeObjets([])).toBe(0);
    expect(volumeObjets([{ quantite: 3, volume: 0.1 }])).toBe(0.3); // 0,30000000000000004 arrondi
  });

  it("volumeObjets ne dépend pas de l'ordre des objets", () => {
    const alea = hasard(3);
    const objets = Array.from({ length: 30 }, () => ({ quantite: 1 + Math.floor(alea() * 5), volume: Math.round(alea() * 200) / 100 }));
    expect(volumeObjets([...objets].reverse())).toBe(volumeObjets(objets));
  });
});

describe("formules et accès", () => {
  it("trois formules du CRM ; estFormule ne reconnaît qu'elles", () => {
    expect(FORMULES.map((f) => f.cle)).toEqual(["premium", "standard", "economique"]);
    for (const f of FORMULES) expect(estFormule(f.cle)).toBe(true);
    for (const v of ["luxe", "eco", "Premium", "", null, 1]) expect(estFormule(v)).toBe(false);
  });

  it.each([
    ["4", "4e étage"], ["1", "1er étage"], [" 12 ", "12e étage"], ["RDC", "Rez-de-chaussée"], ["rdc", "Rez-de-chaussée"],
    ["0", "Rez-de-chaussée"], ["Rez-de-chaussée", "Rez-de-chaussée"], ["Sous-sol", "Sous-sol"], ["", null], ["   ", null], [null, null], [undefined, null],
  ])("libelleEtageTexte(%j) = %j", (e, attendu) => {
    expect(libelleEtageTexte(e)).toBe(attendu);
  });

  const etape = {
    etage: null, ascenseur: false, escalier: null, portage_m: null, stationnement: null, poids_lourd: null, monte_meuble: null, acces: null,
  } as const;

  it("resumeAcces : la ligne complète", () => {
    expect(
      resumeAcces({ ...etape, etage: "3", escalier: "colimacon", portage_m: 20, stationnement: "autorisation", poids_lourd: "ne_sait_pas", monte_meuble: "a_evaluer", acces: "  Code 1234  " }),
    ).toBe("3e étage · sans ascenseur · escalier colimaçon · portage 20 m · demande de stationnement (autorisation de voirie) · poids lourd : à vérifier · monte-meuble : à évaluer · Code 1234");
  });

  it("resumeAcces : ascenseur ; rez-de-chaussée sans mention d'ascenseur ; « non » et « aucun » tus", () => {
    expect(resumeAcces({ ...etape, etage: "5", ascenseur: true })).toBe("5e étage · ascenseur");
    expect(resumeAcces({ ...etape, etage: "RDC" })).toBe("Rez-de-chaussée");
    expect(resumeAcces({ ...etape, etage: "2", escalier: "aucun", monte_meuble: "non" })).toBe("2e étage · sans ascenseur");
  });

  it("resumeAcces : monte-charge, transbordement, portage nul", () => {
    expect(resumeAcces({ ...etape, monte_charge: true, transbordement: true, portage_m: 0 })).toBe("monte-charge · transbordement · portage 0 m");
  });

  it("resumeAcces : rien de renseigné, ligne vide", () => {
    expect(resumeAcces(etape)).toBe("");
    expect(resumeAcces({ ...etape, acces: "   " })).toBe("");
  });
});

describe("jsonCanonique — le texte que scelle l'empreinte", () => {
  it("clés triées, sans espace, à toute profondeur", () => {
    expect(jsonCanonique({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("l'ordre des clés ne change pas le texte ; l'ordre d'une liste, si", () => {
    expect(jsonCanonique({ a: 1, b: 2 })).toBe(jsonCanonique({ b: 2, a: 1 }));
    expect(jsonCanonique([1, 2])).not.toBe(jsonCanonique([2, 1]));
  });

  it("les clés indéfinies disparaissent, comme dans JSON.stringify", () => {
    expect(jsonCanonique({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("valeurs simples : comme JSON.stringify ; rien vaut null", () => {
    expect(jsonCanonique("é\"\n")).toBe(JSON.stringify("é\"\n"));
    expect(jsonCanonique(12.5)).toBe("12.5");
    expect(jsonCanonique(true)).toBe("true");
    expect(jsonCanonique(null)).toBe("null");
    expect(jsonCanonique(undefined)).toBe("null");
    expect(jsonCanonique([undefined, 1])).toBe("[null,1]");
  });

  it("se relit en la même valeur, et reste stable (idempotent)", () => {
    const contenu = {
      version: 1, dossier: { ref: "BD-2026-0164", client: "Claire Dumont", contact: null, telephone: null, email: "c@x.fr" },
      pieces: [{ cle: "p1", nom: "Salon", remarque: "« fragile »", volume: 12.4, objets: [{ libelle: "Canapé", quantite: 1 }] }],
      options: ["Garde-meuble"], remarques: null,
    };
    const t = jsonCanonique(contenu);
    expect(JSON.parse(t)).toEqual(contenu);
    expect(jsonCanonique(JSON.parse(t))).toBe(t);
  });

  it("deux contenus égaux construits différemment donnent le même texte", () => {
    const a: Record<string, unknown> = {};
    a.z = [1, { q: 1, p: 2 }];
    a.a = "x";
    const b = JSON.parse('{"a":"x","z":[1,{"p":2,"q":1}]}');
    expect(jsonCanonique(a)).toBe(jsonCanonique(b));
  });
});

describe("empreinteLisible", () => {
  const e = "3fa291c0aa55bb66cc77dd88ee99ff00112233445566778899aabbccddeeff00"; // 64 caractères
  it("huit groupes de quatre, puis « … »", () => {
    expect(empreinteLisible(e)).toBe("3fa2 91c0 aa55 bb66 cc77 dd88 ee99 ff00 …");
  });

  it("une empreinte courte, sans « … » ; une vide, chaîne vide", () => {
    expect(empreinteLisible("3fa291c0", 8)).toBe("3fa2 91c0");
    expect(empreinteLisible("3fa291c0a", 2)).toBe("3fa2 91c0 …");
    expect(empreinteLisible("")).toBe("");
  });

  it("le nombre de groupes se règle", () => {
    expect(empreinteLisible(e, 2)).toBe("3fa2 91c0 …");
    expect(empreinteLisible(e, 16)).toBe(e.match(/.{4}/g)!.join(" "));
  });
});
