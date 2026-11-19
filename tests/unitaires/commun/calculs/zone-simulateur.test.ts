import { describe, expect, it, vi } from "vitest";
import { estimationEnLigne, libelleZone, zoneAdresse, zoneDuTrajet } from "@/lib/zone";
import { varsAlerteDemande } from "@/lib/alerte-demande";

/*
 * Règles du simulateur (mail de Céline du 19/11/2026) : l'estimation en ligne
 * seulement pour un départ ou une arrivée en Île-de-France ; ailleurs, « Notre
 * service commercial traite votre demande et vous répond sous 48h ouvrées » ;
 * et le mail à l'équipe dit de quelle bulle vient la demande et où elle va.
 */

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/rappels", () => ({ creerRappel: vi.fn() }));
vi.mock("@/lib/alertes-equipe", () => ({ alerterEquipe: vi.fn() }));

const cp = (code_postal: string, pays?: string) => ({ code_postal, pays });

describe("la zone d'une adresse", () => {
  it("Île-de-France, France, Corse, DOM-TOM, international", () => {
    expect(zoneAdresse(cp("75011"))).toBe("idf");
    expect(zoneAdresse(cp("91120"))).toBe("idf");
    expect(zoneAdresse(cp("95000"))).toBe("idf");
    expect(zoneAdresse(cp("69003"))).toBe("france");
    expect(zoneAdresse(cp("60000"))).toBe("france");
    expect(zoneAdresse(cp("20000"))).toBe("corse");
    expect(zoneAdresse(cp("20200"))).toBe("corse");
    expect(zoneAdresse(cp("97200"))).toBe("outre_mer");
    expect(zoneAdresse(cp("97400"))).toBe("outre_mer");
    expect(zoneAdresse(cp("98800"))).toBe("outre_mer");
    expect(zoneAdresse(cp("1000", "Belgique"))).toBe("international");
    expect(zoneAdresse(cp("H2X 1Y4", "Canada"))).toBe("international");
  });

  it("sans code postal : inconnue", () => {
    expect(zoneAdresse(cp(""))).toBeNull();
    expect(zoneAdresse({})).toBeNull();
    expect(zoneAdresse(null)).toBeNull();
  });
});

describe("l'estimation en ligne : départ OU arrivée en Île-de-France, en France continentale", () => {
  const cas: [string, string, string, boolean][] = [
    ["Paris → Lyon", "75011", "69003", true],
    ["Lyon → Palaiseau", "69003", "91120", true],
    ["Paris → Versailles", "75011", "78000", true],
    ["Lyon → Marseille", "69003", "13001", false],
    ["Paris → Ajaccio (Corse, à confirmer)", "75011", "20000", false],
    ["Paris → Fort-de-France", "75011", "97200", false],
    ["Saint-Denis de La Réunion → Paris", "97400", "75011", false],
  ];
  for (const [nom, d, a, attendu] of cas) {
    it(`${nom} : ${attendu ? "prix affiché" : "pas de prix"}`, () => {
      expect(estimationEnLigne(cp(d), cp(a))).toBe(attendu);
    });
  }

  it("à l'étranger : pas de prix, même au départ de Paris", () => {
    expect(estimationEnLigne(cp("75011", "France"), cp("1000", "Belgique"))).toBe(false);
  });

  it("une adresse sans code postal : pas de prix (on ne promet rien qu'on ne sait pas calculer)", () => {
    expect(estimationEnLigne(cp("75011"), cp(""))).toBe(false);
  });
});

describe("l'étiquette d'un trajet : sa destination la plus lointaine", () => {
  it("international, puis DOM-TOM, Corse, Île-de-France, France", () => {
    expect(zoneDuTrajet(cp("97200"), cp("1000", "Belgique"))).toBe("international");
    expect(zoneDuTrajet(cp("75011"), cp("97400"))).toBe("outre_mer");
    expect(zoneDuTrajet(cp("75011"), cp("20000"))).toBe("corse");
    expect(zoneDuTrajet(cp("69003"), cp("75011"))).toBe("idf");
    expect(zoneDuTrajet(cp("69003"), cp("13001"))).toBe("france");
    expect(zoneDuTrajet(cp(""), cp(""))).toBeNull();
  });

  it("les libellés du mail", () => {
    expect(libelleZone("outre_mer")).toBe("DOM-TOM");
    expect(libelleZone("international")).toBe("International");
    expect(libelleZone("france")).toBe("France hors Île-de-France");
    expect(libelleZone(null)).toBe("Non précisée");
    expect(libelleZone("n'importe quoi")).toBe("Non précisée");
  });
});

describe("le mail à l'équipe : la bulle, la destination, de quoi rappeler", () => {
  const demande = {
    client_nom: "Camille Durand", client_email: "camille@example.com", client_tel: "06 12 34 56 78",
    depart_adresse: "1 rue de Rivoli", depart_code_postal: "75001", depart_ville: "Paris",
    arrivee_adresse: null, arrivee_code_postal: "97200", arrivee_ville: "Fort-de-France",
    date_souhaitee: null, flexibilite: "Mars 2027", volume_m3: 12.5,
  };

  it("un particulier qui part dans les DOM-TOM", () => {
    const v = varsAlerteDemande(demande, { parcours: "particulier", express: true }, "outre_mer");
    expect(v).toMatchObject({
      client: "Camille Durand", profil: "Particulier · express", destination: "DOM-TOM",
      telephone: "06 12 34 56 78", email: "camille@example.com",
      depart: "1 rue de Rivoli, 75001 Paris", arrivee: "97200 Fort-de-France", periode: "Mars 2027", volume: "12,5 m³",
    });
  });

  it("un muté ; une entreprise et son projet", () => {
    expect(varsAlerteDemande(demande, { parcours: "mutation" }, "idf").profil).toBe("Mutation");
    expect(varsAlerteDemande(demande, { parcours: "entreprise", transfert: "projet" }, "idf").profil).toBe("Entreprise · projet important");
  });

  it("le contact rapide : la bulle d'où il vient, « demande à être rappelé(e) », rien d'autre", () => {
    const vide = { ...demande, client_nom: null, client_email: null, depart_adresse: null, depart_code_postal: null, depart_ville: null, arrivee_code_postal: null, arrivee_ville: null, flexibilite: null, volume_m3: null };
    const v = varsAlerteDemande(vide, { parcours: "particulier", contact_rapide: true }, null);
    expect(v).toMatchObject({ client: "Sans nom", profil: "Particulier · demande à être rappelé(e)", destination: "Non précisée", telephone: "06 12 34 56 78", email: "—", depart: "—", volume: "—" });
  });
});

describe("le contact rapide : ce que la porte accepte", () => {
  it("un vrai numéro, la bulle ; le nom est facultatif", async () => {
    const { contactRapideSchema } = await import("@/lib/contact-rapide");
    expect(contactRapideSchema.safeParse({ telephone: "06 12 34 56 78", parcours: "particulier" }).success).toBe(true);
    expect(contactRapideSchema.safeParse({ telephone: "+33 6 12 34 56 78", nom: "Camille", parcours: "mutation" }).success).toBe(true);
    expect(contactRapideSchema.safeParse({ telephone: "06 12", parcours: "particulier" }).success).toBe(false);
    expect(contactRapideSchema.safeParse({ telephone: "", parcours: "particulier" }).success).toBe(false);
    expect(contactRapideSchema.safeParse({ telephone: "06 12 34 56 78", parcours: "dom-tom" }).success).toBe(false);
  });
});

describe("côté serveur : le prix se tait hors zone, quoi que dise l'écran", () => {
  const saisie = (dcp: string, acp: string, details: Record<string, unknown> = { parcours: "particulier", express: true }) =>
    ({ client: { nom: "Camille", email: "camille@example.com" }, depart: { ville: "A", code_postal: dcp }, arrivee: { ville: "B", code_postal: acp }, volume: { method: "explicit", volume_m3: 20 }, details }) as never;

  it("particulier du formulaire : prix en Île-de-France, pas ailleurs", async () => {
    const { sansPrixPour } = await import("@/lib/requests");
    expect(sansPrixPour(saisie("75011", "69003"), "form")).toBe(false);
    expect(sansPrixPour(saisie("69003", "13001"), "form")).toBe(true);
    expect(sansPrixPour(saisie("75011", "97200"), "form")).toBe(true);
  });

  it("muté et entreprise : jamais de prix ; une demande venue par e-mail suit son chemin d'avant", async () => {
    const { sansPrixPour } = await import("@/lib/requests");
    expect(sansPrixPour(saisie("75011", "69003", { parcours: "mutation" }), "form")).toBe(true);
    expect(sansPrixPour(saisie("75011", "69003", { parcours: "entreprise" }), "form")).toBe(true);
    expect(sansPrixPour(saisie("69003", "13001"), "email")).toBe(false);
  });
});
