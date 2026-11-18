import { describe, expect, it } from "vitest";
import { PORTS, cleDuPort, portDe, trouverPort } from "@/lib/ports";
import { territoireDuCodePostal, volOiseauKm } from "@/lib/trajet";

/*
 * Le référentiel des ports (Céline, 18/11/2026 : une case « Port » dans les
 * adresses de départ et de livraison des dossiers CIMOB/DICOM) : des
 * coordonnées vraisemblables, chaque territoire d'outre-mer servi, un nom tapé
 * de plusieurs façons qui retrouve son port, et le port dans une phrase.
 */

const port = (nom: string) => {
  const p = PORTS.find((x) => x.nom === nom);
  if (!p) throw new Error(`${nom} absent du référentiel`);
  return p;
};

describe("le référentiel", () => {
  it("des noms uniques, des coordonnées valides", () => {
    expect(new Set(PORTS.map((p) => p.nom)).size).toBe(PORTS.length);
    for (const p of PORTS) {
      expect(Number.isFinite(p.lat) && Math.abs(p.lat) <= 90, p.nom).toBe(true);
      expect(Number.isFinite(p.lon) && Math.abs(p.lon) <= 180, p.nom).toBe(true);
    }
  });

  it("les ports de métropole sont en métropole (Corse comprise), ceux d'outre-mer loin d'elle", () => {
    for (const p of PORTS.filter((x) => x.territoire === "metropole")) {
      expect(p.lat > 41.2 && p.lat < 51.3 && p.lon > -5.6 && p.lon < 9.8, p.nom).toBe(true);
    }
    for (const p of PORTS.filter((x) => x.territoire !== "metropole")) {
      expect(volOiseauKm(p, port("Le Havre")), p.nom).toBeGreaterThan(3000);
    }
  });

  it("chaque département et collectivité d'outre-mer a son port, sous le code de lib/trajet.ts", () => {
    const codes = new Set(PORTS.filter((p) => p.territoire !== "metropole").map((p) => p.territoire));
    expect([...codes].sort()).toEqual(["971", "972", "973", "974", "975", "976", "977", "978", "986", "987", "988"]);
    // Le même code que celui d'une adresse du territoire (97200 → 972, 97133 → 977…).
    expect(port("Fort-de-France").territoire).toBe(territoireDuCodePostal("97200"));
    expect(port("Gustavia").territoire).toBe(territoireDuCodePostal("97133"));
    expect(port("Marigot (Galisbay)").territoire).toBe(territoireDuCodePostal("97150"));
    expect(port("Nouméa").territoire).toBe(territoireDuCodePostal("98800"));
  });

  it("chaque port est près de sa ville (à quelques kilomètres)", () => {
    // Les centres des communes, pour mémoire : un port mal placé serait à des centaines de kilomètres.
    const villes: [string, number, number][] = [
      ["Le Havre", 49.4944, 0.1079], ["Marseille", 43.2965, 5.3698], ["Fort-de-France", 14.6161, -61.0588], ["Pointe-à-Pitre (Jarry)", 16.2411, -61.5331],
      ["Le Port (La Réunion)", -20.9373, 55.2919], ["Longoni", -12.7806, 45.2278], ["Papeete", -17.5516, -149.5585], ["Nouméa", -22.2758, 166.458],
      ["Dégrad-des-Cannes", 4.9372, -52.326], ["Mata-Utu", -13.2825, -176.1742], ["Ajaccio", 41.9192, 8.7386], ["Bordeaux", 44.8378, -0.5792],
    ];
    for (const [nom, lat, lon] of villes) expect(volOiseauKm(port(nom), { lat, lon }), nom).toBeLessThan(15);
  });

  it("Le Havre → Fort-de-France : environ 6 700 km à vol d'oiseau ; Marseille → Ajaccio : environ 320 km", () => {
    const transat = volOiseauKm(port("Le Havre"), port("Fort-de-France"));
    expect(transat).toBeGreaterThan(6500);
    expect(transat).toBeLessThan(7000);
    const corse = volOiseauKm(port("Marseille"), port("Ajaccio"));
    expect(corse).toBeGreaterThan(300);
    expect(corse).toBeLessThan(340);
  });
});

describe("retrouver un port tapé", () => {
  it("son nom, à la casse, aux accents et aux articles près", () => {
    for (const t of ["Le Havre", "le havre", "LE HAVRE", "Havre", "Port du Havre", "port du havre", "Port 2000"]) expect(trouverPort(t)?.nom, t).toBe("Le Havre");
    for (const t of ["Fort-de-France", "Fort de France", "Port de Fort-de-France", "Martinique"]) expect(trouverPort(t)?.nom, t).toBe("Fort-de-France");
    expect(trouverPort("Port d'Ajaccio")?.nom).toBe("Ajaccio");
    expect(trouverPort("Port de La Rochelle")?.nom).toBe("La Rochelle");
    expect(trouverPort("La Pallice")?.nom).toBe("La Rochelle");
    expect(trouverPort("Degrad des Cannes")?.nom).toBe("Dégrad-des-Cannes");
    expect(trouverPort("noumea")?.nom).toBe("Nouméa");
  });

  it("un autre de ses noms : sa commune, son terminal, son territoire", () => {
    expect(trouverPort("Jarry")?.nom).toBe("Pointe-à-Pitre (Jarry)");
    expect(trouverPort("Pointe-à-Pitre")?.nom).toBe("Pointe-à-Pitre (Jarry)");
    expect(trouverPort("Le Port")?.nom).toBe("Le Port (La Réunion)");
    expect(trouverPort("Port Réunion")?.nom).toBe("Le Port (La Réunion)");
    expect(trouverPort("Saint-Nazaire")?.nom).toBe("Montoir-de-Bretagne");
    expect(trouverPort("Tahiti")?.nom).toBe("Papeete");
    expect(trouverPort("Mayotte")?.nom).toBe("Longoni");
  });

  it("chaque nom du référentiel retrouve son port, et pas un autre", () => {
    for (const p of PORTS) for (const n of [p.nom, ...(p.aussi ?? [])]) expect(trouverPort(n), n).toBe(p);
  });

  it("un port absent, ou un nom ambigu, n'est pas deviné : c'est une saisie libre", () => {
    expect(trouverPort("Anvers")).toBeNull();
    expect(trouverPort("Port de Montréal")).toBeNull();
    // Saint-Pierre : en Martinique, à La Réunion, à Saint-Pierre-et-Miquelon…
    expect(trouverPort("Saint-Pierre")).toBeNull();
    expect(trouverPort("")).toBeNull();
    expect(trouverPort(null)).toBeNull();
  });

  it("la forme comparable : sans « Port de », sans article ; « Port » seul reste « port »", () => {
    expect(cleDuPort("Port du Havre")).toBe("havre");
    expect(cleDuPort("Grand Port Maritime de Marseille")).toBe("marseille");
    expect(cleDuPort("Port de l'Île-Rousse")).toBe("ile rousse");
    expect(cleDuPort("Port")).toBe("port");
  });
});

describe("le port dans une phrase", () => {
  it("de, du, d' selon le nom", () => {
    expect(portDe("Le Havre")).toBe("port du Havre");
    expect(portDe("Fort-de-France")).toBe("port de Fort-de-France");
    expect(portDe("Ajaccio")).toBe("port d’Ajaccio");
    expect(portDe("Île-Rousse")).toBe("port d’Île-Rousse");
    expect(portDe("La Rochelle")).toBe("port de La Rochelle");
    expect(portDe("Les Sables-d'Olonne")).toBe("port des Sables-d'Olonne");
    expect(portDe("Le Port (La Réunion)")).toBe("port du Port (La Réunion)");
  });
  it("un nom saisi qui dit déjà « Port » reste tel quel ; « Port-Vendres » est une commune", () => {
    expect(portDe("Port de Saint-Malo")).toBe("port de Saint-Malo");
    expect(portDe("Port-Vendres")).toBe("port de Port-Vendres");
  });
  it("en début de phrase, une majuscule", () => {
    expect(portDe("Fort-de-France", true)).toBe("Port de Fort-de-France");
    expect(portDe("Le Havre", true)).toBe("Port du Havre");
  });
});
