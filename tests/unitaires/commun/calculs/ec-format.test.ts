import { afterEach, describe, expect, it } from "vitest";
import {
  aujourdhui,
  aVille,
  dateCourte,
  dateHeure,
  dateLongue,
  estRecent,
  euros,
  eurosAffiches,
  heure,
  jourLong,
  jourMois,
  joursRestants,
  moisEntier,
  nomClient,
  nomPays,
  parseDate,
  periode,
  periodeCompacte,
  pluriel,
  salutation,
  taille,
} from "@/lib/espace-client/format";
import { esp } from "./_outils";

const JOUR = 86_400_000;

describe("dates — toujours à l'heure de Paris", () => {
  it("une date seule est lue à midi, pas à minuit", () => {
    const d = parseDate("2026-10-14");
    expect(d.getHours()).toBe(12);
    expect(d.getDate()).toBe(14);
  });

  it("un horodatage complet est lu tel quel", () => {
    expect(parseDate("2026-10-14T16:22:00Z").toISOString()).toBe("2026-10-14T16:22:00.000Z");
  });

  it("formats d'une date seule", () => {
    expect(dateLongue("2026-10-14")).toBe("14 octobre 2026");
    expect(dateCourte("2026-10-14")).toBe("14/10/2026");
    expect(jourMois("2026-10-14")).toBe("14 octobre");
    expect(jourLong("2026-11-21")).toBe("samedi 21 novembre");
  });

  it("29 février d'une année bissextile", () => {
    expect(dateLongue("2028-02-29")).toBe("29 février 2028");
    expect(jourLong("2028-02-29")).toBe("mardi 29 février");
  });

  it("dateHeure : « 14/10/2026 à 18 h 22 » (16 h 22 UTC, heure d'été)", () => {
    expect(dateHeure("2026-10-14T16:22:00Z")).toBe("14/10/2026 à 18 h 22");
  });

  it("dateHeure à cheval sur minuit : 23 h 30 UTC le 14 novembre = 0 h 30 le 15 à Paris", () => {
    expect(dateHeure("2026-11-14T23:30:00Z")).toBe("15/11/2026 à 00 h 30");
  });

  it("dateHeure au changement d'heure du 29 mars 2026 : 0 h 59 UTC = 1 h 59 ; 1 h 00 UTC = 3 h 00", () => {
    expect(dateHeure("2026-03-29T00:59:00Z")).toBe("29/03/2026 à 01 h 59");
    expect(dateHeure("2026-03-29T01:00:00Z")).toBe("29/03/2026 à 03 h 00");
  });

  it("dateHeure au retour à l'heure d'hiver du 25 octobre 2026 : 0 h 30 UTC = 2 h 30 ; 1 h 30 UTC = 2 h 30", () => {
    expect(dateHeure("2026-10-25T00:30:00Z")).toBe("25/10/2026 à 02 h 30");
    expect(dateHeure("2026-10-25T01:30:00Z")).toBe("25/10/2026 à 02 h 30");
  });

  describe("sur un serveur réglé en UTC", () => {
    const tz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = tz;
    });

    it("une date seule ne recule pas d'un jour", () => {
      process.env.TZ = "UTC";
      // le processus est bien passé en UTC : midi local = midi UTC
      expect(parseDate("2026-10-14").toISOString()).toBe("2026-10-14T12:00:00.000Z");
      expect(dateLongue("2026-10-14")).toBe("14 octobre 2026");
      expect(dateCourte("2026-01-01")).toBe("01/01/2026");
      expect(jourLong("2026-11-21")).toBe("samedi 21 novembre");
      expect(periode("2026-10-01", "2026-10-15")).toBe("du 1er au 15 octobre 2026");
    });
  });

  it("heure : « 9 h 30 » à partir de « 09:30 »", () => {
    expect(heure("09:30")).toBe("9 h 30");
    expect(heure("00:05")).toBe("0 h 05");
    expect(heure("14:00")).toBe("14 h 00");
  });
});

describe("moisEntier — un mois du 1er au dernier jour", () => {
  it.each([
    ["2027-01-01", "2027-01-31", "janvier 2027"],
    ["2026-04-01", "2026-04-30", "avril 2026"],
    ["2028-02-01", "2028-02-29", "février 2028"], // bissextile
    ["2027-02-01", "2027-02-28", "février 2027"],
    ["2026-12-01", "2026-12-31", "décembre 2026"],
  ])("%s → %s : %s", (a, b, attendu) => {
    expect(moisEntier(a, b)).toBe(attendu);
  });

  it.each([
    ["2027-02-01", "2027-02-29"], // n'existe pas
    ["2028-02-01", "2028-02-28"], // un jour de moins qu'en année bissextile
    ["2026-04-01", "2026-04-31"],
    ["2026-04-02", "2026-04-30"],
    ["2026-04-01", "2026-05-31"],
    ["2026-04-1", "2026-04-30"],
    ["", ""],
  ])("%s → %s : pas un mois entier", (a, b) => {
    expect(moisEntier(a, b)).toBeNull();
  });
});

describe("periode et periodeCompacte", () => {
  it.each([
    ["2026-10-12", "2026-10-12", "le 12 octobre 2026"],
    ["2027-01-01", "2027-01-31", "en janvier 2027"],
    ["2026-10-14", "2026-10-15", "du 14 au 15 octobre 2026"],
    ["2026-10-01", "2026-10-15", "du 1er au 15 octobre 2026"],
    ["2026-11-16", "2026-12-18", "du 16 novembre au 18 décembre 2026"],
    ["2026-12-28", "2027-01-03", "du 28 décembre 2026 au 3 janvier 2027"],
  ])("periode(%s, %s) = %s", (a, b, attendu) => {
    expect(periode(a, b)).toBe(attendu);
  });

  it.each([
    ["2026-11-12", "2026-11-13", "du 12/11/2026 au 13/11/2026"],
    ["2026-11-12", "2026-11-12", "le 12/11/2026"],
    ["2027-01-01", "2027-01-31", "en janvier 2027"],
  ])("periodeCompacte(%s, %s) = %s", (a, b, attendu) => {
    expect(periodeCompacte(a, b)).toBe(attendu);
  });
});

describe("montants", () => {
  it("au centime près, à la française", () => {
    expect(esp(euros(1234.5))).toBe("1 234,50 €");
    expect(esp(euros(0))).toBe("0,00 €");
    expect(esp(euros(-12.3))).toBe("-12,30 €");
    expect(esp(euros(1234567.891))).toBe("1 234 567,89 €");
  });

  it("affichage : sans décimales quand il n'y en a pas, au centime sinon", () => {
    expect(esp(eurosAffiches(1500))).toBe("1 500 €");
    expect(esp(eurosAffiches(1500.5))).toBe("1 500,50 €");
    expect(esp(eurosAffiches(0))).toBe("0 €");
  });
});

describe("taille d'un fichier", () => {
  it.each([
    [0, "1 Ko"], [1, "1 Ko"], [1024, "1 Ko"], [1536, "2 Ko"], [500 * 1024, "500 Ko"],
    [1024 * 1024, "1,0 Mo"], [5.5 * 1024 * 1024, "5,5 Mo"], [10 * 1024 * 1024, "10,0 Mo"],
  ])("%s octets → %s", (o, attendu) => {
    expect(taille(o)).toBe(attendu);
  });
});

describe("joursRestants — au calendrier de Paris", () => {
  it("le jour même : 0 ; demain : 1 ; hier : −1", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    expect(joursRestants("2026-11-15", now)).toBe(0);
    expect(joursRestants("2026-11-16", now)).toBe(1);
    expect(joursRestants("2026-11-14", now)).toBe(-1);
  });

  it("à cheval sur minuit : 23 h 30 UTC le 14 est déjà le 15 à Paris", () => {
    const now = new Date("2026-11-14T23:30:00Z");
    expect(joursRestants("2026-11-15", now)).toBe(0);
    expect(joursRestants("2026-11-16", now)).toBe(1);
  });

  it("à travers le changement d'heure (29 mars 2026) : deux jours restent deux jours", () => {
    expect(joursRestants("2026-03-30", new Date("2026-03-28T12:00:00Z"))).toBe(2);
    expect(joursRestants("2026-10-26", new Date("2026-10-24T12:00:00Z"))).toBe(2);
  });

  it("le 29 février compte en année bissextile", () => {
    expect(joursRestants("2028-03-01", new Date("2028-02-28T12:00:00Z"))).toBe(2);
    expect(joursRestants("2027-03-01", new Date("2027-02-28T12:00:00Z"))).toBe(1);
  });

  it("d'une année à l'autre", () => {
    expect(joursRestants("2027-01-01", new Date("2026-12-31T12:00:00Z"))).toBe(1);
    expect(joursRestants("2027-12-31", new Date("2027-01-01T12:00:00Z"))).toBe(364);
  });

  it("horodatage complet : son jour à Paris", () => {
    expect(joursRestants("2026-11-15T23:30:00Z", new Date("2026-11-15T10:00:00Z"))).toBe(1);
  });
});

describe("aujourdhui et estRecent", () => {
  it.each([
    ["2026-11-14T23:30:00Z", "2026-11-15"],
    ["2026-11-14T22:59:00Z", "2026-11-14"],
    ["2026-06-30T22:30:00Z", "2026-07-01"],
    ["2026-06-30T21:59:00Z", "2026-06-30"],
    ["2026-12-31T23:00:00Z", "2027-01-01"],
  ])("%s → %s à Paris", (iso, jour) => {
    expect(aujourdhui(new Date(iso))).toBe(jour);
  });

  it("récent : déposé il y a moins de quatorze jours (strictement)", () => {
    const now = Date.parse("2026-11-15T10:00:00Z");
    expect(estRecent(new Date(now - 13 * JOUR).toISOString(), 14, now)).toBe(true);
    expect(estRecent(new Date(now - 14 * JOUR).toISOString(), 14, now)).toBe(false);
    expect(estRecent(new Date(now - 15 * JOUR).toISOString(), 14, now)).toBe(false);
    expect(estRecent(new Date(now + JOUR).toISOString(), 14, now)).toBe(true);
    expect(estRecent(new Date(now - 2 * JOUR).toISOString(), 1, now)).toBe(false);
  });

  it("date illisible : pas récente", () => {
    expect(estRecent("pas une date", 14, Date.now())).toBe(false);
  });
});

describe("noms et mots", () => {
  it("nomPays", () => {
    expect(nomPays(null)).toBe("Toutes destinations");
    expect(nomPays("CA")).toBe("Canada");
    expect(nomPays("AE")).toBe("Émirats arabes unis");
    expect(nomPays("XX")).toBe("XX");
  });

  it.each([
    ["Lyon", "à Lyon"],
    ["Le Havre", "au Havre"],
    ["Le Mans", "au Mans"],
    ["Les Sables-d'Olonne", "aux Sables-d'Olonne"],
    ["Les Ulis", "aux Ulis"],
    ["La Rochelle", "à La Rochelle"],
    ["Lens", "à Lens"],
    ["Levallois-Perret", "à Levallois-Perret"],
  ])("aVille(%s) = %s", (v, attendu) => {
    expect(aVille(v)).toBe(attendu);
  });

  it("nomClient : civilité, prénom, NOM en capitales (accents compris)", () => {
    expect(nomClient({ civilite: "Madame", prenom: "Claire", nom: "Dumont" })).toBe("Madame Claire DUMONT");
    expect(nomClient({ civilite: null, prenom: "Élodie", nom: "Lévêque-Ançel" })).toBe("Élodie LÉVÊQUE-ANÇEL");
    expect(nomClient({ civilite: "Monsieur", prenom: "", nom: "Petit" })).toBe("Monsieur PETIT");
  });

  it("salutation : « Madame Dumont », ou prénom et nom sans civilité", () => {
    expect(salutation({ civilite: "Madame", prenom: "Claire", nom: "Dumont" })).toBe("Madame Dumont");
    expect(salutation({ civilite: null, prenom: "Claire", nom: "Dumont" })).toBe("Claire Dumont");
  });

  it("pluriel : 0 et 1 au singulier, au-delà au pluriel, pluriel irrégulier possible", () => {
    expect(pluriel(0, "pièce")).toBe("0 pièce");
    expect(pluriel(1, "pièce")).toBe("1 pièce");
    expect(pluriel(2, "pièce")).toBe("2 pièces");
    expect(pluriel(3, "créneau", "créneaux")).toBe("3 créneaux");
  });
});
