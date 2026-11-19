import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContenuCompteRendu } from "@/lib/visite/regles";
import type { Saisie } from "@/crm/visites/donnees";

/*
 * Retours de Céline (16 et 17/11/2026), vérifiés le 19/11 : un client
 * CIMOB/DICOM ne reçoit jamais de devis, et on ne lui communique que ses
 * droits — jamais le volume relevé à la visite, ni au compte-rendu qu'il
 * relit et signe sur la tablette, ni dans le PDF qu'il reçoit.
 */

const m = vi.hoisted(() => ({ q1: vi.fn(), envoyerEmail: vi.fn() }));
vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: m.q1, transaction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/espace-client/fichiers", () => ({ SEAU: "espace" }));
vi.mock("@/terrain/lib/photos", () => ({ SEAU: "photos" }));
vi.mock("@/lib/envois", async (orig) => ({ ...(await orig<object>()), envoyerEmail: m.envoyerEmail }));

// Les polices du PDF se lisent dans public/ de l'app qui le produit, dès le chargement du
// module — que le compte-rendu (compte-rendu.ts) importe : tout le fichier tourne depuis apps/interne.
const ici = process.cwd();
beforeAll(() => process.chdir(path.resolve(ici, "../apps/interne")));
afterAll(() => process.chdir(ici));

beforeEach(() => {
  m.q1.mockReset();
  m.envoyerEmail.mockReset();
});

const saisie = (dossier: Partial<Saisie["dossier"]> = {}): Saisie => ({
  visite: { id: 4, dossierId: 1, statut: "en_cours", remarques: null, options: [], formule: null, commenceeLe: "2026-11-19T09:00:00Z", majLe: "", rendezVousId: null, commercial: "Paul", signeLe: null, signataire: null, empreinte: null, document: false },
  dossier: { id: 1, ref: "BD-2026-0001", client: "Lefort", contact: null, telephone: null, email: null, volume: 18.4, type: "militaire", ...dossier },
  rdv: null,
  etapes: [],
  destinations: [{ id: 5, genre: "arrivee", libelle: "Arrivée" }],
  pieces: [{ cle: "p1", nom: "Salon", ordre: 1, remarque: null }],
  objets: [{ cle: "o1", piece: "p1", libelle: "Canapé 3 places", quantite: 1, volume: 2.1, demontage: false, fragile: false, note: null, destination: 5 }],
  photos: [],
});

describe("le compte-rendu d'un client CIMOB/DICOM porte ses droits", () => {
  it("droits saisis : ils figurent au contenu ; le volume réel reste au CRM", async () => {
    const { contenuDe } = await import("@/crm/visites/compte-rendu");
    const c = contenuDe(saisie({ droits: 12.5 }));
    expect(c.droits_cimob).toEqual({ volume: 12.5 });
    expect(c.volume).toBe(2.1);
  });

  it("droits pas encore saisis : aucun volume à montrer", async () => {
    const { contenuDe } = await import("@/crm/visites/compte-rendu");
    expect(contenuDe(saisie({ droits: null })).droits_cimob).toEqual({ volume: null });
  });

  it("un autre client : le contenu reste celui d'avant (même empreinte)", async () => {
    const { contenuDe } = await import("@/crm/visites/compte-rendu");
    expect(contenuDe(saisie({ type: "particulier", droits: 12.5 }))).not.toHaveProperty("droits_cimob");
  });
});

const contenu = (o: Partial<ContenuCompteRendu> = {}): ContenuCompteRendu => ({
  version: 1,
  dossier: { ref: "BD-2026-0001", client: "Lefort", contact: null, telephone: null, email: null },
  visite: { id: 1, le: "2026-11-17T09:00:00Z", commercial: "Paul", mode: "sur_place" },
  trajet: [],
  pieces: [
    {
      cle: "p1", nom: "Salon", remarque: null, volume: 4.1, photos: 0,
      objets: [
        { libelle: "Canapé", quantite: 1, volume_unitaire: 2.5, volume: 2.5, demontage: false, fragile: false, note: null, destination: "Arrivée" },
        { libelle: "Buffet", quantite: 2, volume_unitaire: 0.8, volume: 1.6, demontage: true, fragile: false, note: null, destination: "Garde-meuble" },
      ],
    },
  ],
  destinations: [
    { libelle: "Garde-meuble", volume: 1.6, objets: 2 },
    { libelle: "Arrivée", volume: 2.5, objets: 1 },
  ],
  volume: 4.1,
  volume_debarras: 1.6,
  nb_objets: 3,
  nb_photos: 0,
  options: [],
  formule: null,
  remarques: null,
  ...o,
});

describe("le récapitulatif que le client CIMOB/DICOM relit sur la tablette", () => {
  const rendu = async (c: ContenuCompteRendu) => {
    const { default: Recapitulatif } = await import("@/crm/visites/tablette/Recapitulatif");
    return renderToStaticMarkup(createElement(Recapitulatif, { c, photos: new Map() }));
  };

  it("montre ses droits et aucun volume relevé (ni total, ni par destination, ni par pièce, ni par objet)", async () => {
    const html = await rendu(contenu({ droits_cimob: { volume: 9.5 } }));
    expect(html).toContain("Vos droits");
    expect(html).toContain("9,5");
    for (const v of ["4,1", "2,5", "1,6", "0,8"]) expect(html).not.toContain(v);
    expect(html).not.toContain("Volume transporté");
    expect(html).toContain("Canapé");
  });

  it("droits pas encore saisis : un tiret, toujours aucun volume relevé", async () => {
    const html = await rendu(contenu({ droits_cimob: { volume: null } }));
    expect(html).toContain("Vos droits");
    expect(html).not.toContain("4,1");
  });

  it("un autre client : le volume relevé, comme avant", async () => {
    const html = await rendu(contenu());
    expect(html).not.toContain("Vos droits");
    expect(html).toContain("4,1");
  });
});

describe("le PDF du compte-rendu d'un client CIMOB/DICOM", () => {
  let pdfCompteRendu: typeof import("@/lib/visite/pdf").pdfCompteRendu;
  beforeAll(async () => {
    ({ pdfCompteRendu } = await import("@/lib/visite/pdf"));
  });

  it("se produit, avec ou sans droits saisis", async () => {
    const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const sig = { signataire: "Thomas Lefort", signeLe: "2026-11-17T10:00:00Z", empreinte: "a".repeat(64), image: PNG_1PX };
    for (const droits of [12.5, null]) {
      const pdf = await pdfCompteRendu(contenu({ droits_cimob: { volume: droits } }), sig);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    }
  }, 30_000);
});

describe("jamais de devis pour un client CIMOB/DICOM", () => {
  it("estDossierCimob et dossierCimobDuDevis lisent le type du client", async () => {
    const { dossierCimobDuDevis, estDossierCimob } = await import("@/crm/devis/cimob");
    m.q1.mockResolvedValueOnce({ cimob: true });
    expect(await estDossierCimob(7)).toBe(true);
    m.q1.mockResolvedValueOnce({ cimob: false });
    expect(await estDossierCimob(8)).toBe(false);
    m.q1.mockResolvedValueOnce(undefined);
    expect(await estDossierCimob(9)).toBe(false);
    m.q1.mockResolvedValueOnce({ dossier_id: 7, cimob: true });
    expect(await dossierCimobDuDevis(70)).toBe(7);
    m.q1.mockResolvedValueOnce({ dossier_id: 8, cimob: false });
    expect(await dossierCimobDuDevis(80)).toBeNull();
  });

  it("l'e-mail du devis ne part pas, quel que soit le chemin qui l'appelle", async () => {
    const { envoyerDevisParEmail } = await import("@/crm/envois");
    m.q1.mockResolvedValueOnce({ cimob: true });
    const r = await envoyerDevisParEmail(7, { id: 70, numero: "DV-2026-0070", formule: "standard", montant: 1500, token: "t" });
    expect(r.resultat).toBeNull();
    expect(r.libelle).toContain("CIMOB/DICOM");
    expect(m.envoyerEmail).not.toHaveBeenCalled();
  });
});
