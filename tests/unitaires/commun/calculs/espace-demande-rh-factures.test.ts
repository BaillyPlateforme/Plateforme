import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxSupabase } from "./_outils";

const m = vi.hoisted(() => ({
  creerClient: vi.fn(),
  getEspace: vi.fn(),
  lireLogo: vi.fn(),
  lireEspaceRh: vi.fn(),
  trouver: vi.fn(),
  pdfFacture: vi.fn(),
  reponsePdf: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.creerClient() }));
vi.mock("@/lib/espaces-pro", () => ({ getEspace: m.getEspace, lireLogo: m.lireLogo }));
vi.mock("@/lib/rh", () => ({ lireEspaceRh: m.lireEspaceRh }));
vi.mock("@/lib/espace-client/depot", () => ({ depot: () => ({ trouver: m.trouver }) }));
vi.mock("@/lib/espace-client/pdf", () => ({ pdfFacture: m.pdfFacture, reponsePdf: m.reponsePdf }));

import { espaceDUneDemande, espacePourDevis } from "@/lib/espace-demande";
import { pdfFactureRh } from "@/lib/rh-factures";
import { COULEUR_BAILLY } from "@/lib/espaces";

const RETENU = { slug: "carrefour", nom: "Carrefour", ajustement_volume: 10 };
const avecDemande = (raw_payload: unknown) =>
  m.creerClient.mockImplementation(() => fauxSupabase({ requests: { data: { raw_payload } } }).client);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("espaceDUneDemande", () => {
  it("sans demande : rien", async () => {
    await expect(espaceDUneDemande(null)).resolves.toBeNull();
    await expect(espaceDUneDemande(undefined)).resolves.toBeNull();
    expect(m.creerClient).not.toHaveBeenCalled();
  });

  it("demande hors espace pro : rien", async () => {
    avecDemande({});
    await expect(espaceDUneDemande("r1")).resolves.toBeNull();
  });

  it("ce que la demande a retenu, et la configuration d'aujourd'hui", async () => {
    avecDemande({ espace: RETENU });
    m.getEspace.mockResolvedValue({ nom: "Carrefour France", couleur: "#003399" });
    const e = (await espaceDUneDemande("r1"))!;
    expect(e.retenu).toMatchObject({ slug: "carrefour", nom: "Carrefour", ajustement_volume: 10 });
    expect(e.config).toMatchObject({ nom: "Carrefour France" });
    expect(m.getEspace).toHaveBeenCalledWith("carrefour");
  });

  it("espace supprimé depuis : la demande garde ce qu'elle a retenu, config nulle", async () => {
    avecDemande({ espace: RETENU });
    m.getEspace.mockRejectedValue(new Error("introuvable"));
    expect((await espaceDUneDemande("r1"))!.config).toBeNull();
  });

  it("la base qui lève : rien", async () => {
    m.creerClient.mockImplementation(() => {
      throw new Error("x");
    });
    await expect(espaceDUneDemande("r1")).resolves.toBeNull();
  });
});

describe("espacePourDevis — l'habillage du devis PDF", () => {
  it("l'habillage d'aujourd'hui : nom, couleur, logo, mention", async () => {
    avecDemande({ espace: RETENU });
    m.getEspace.mockResolvedValue({ nom: "Carrefour France", couleur: "#003399", devis_mention: "Mobilité Carrefour" });
    m.lireLogo.mockResolvedValue("data:image/png;base64,AAA");
    await expect(espacePourDevis("r1")).resolves.toEqual({
      nom: "Carrefour France", couleur: "#003399", logo: "data:image/png;base64,AAA", mention: "Mobilité Carrefour",
    });
  });

  it("sans configuration : le nom retenu, la couleur Bailly, ni logo ni mention", async () => {
    avecDemande({ espace: RETENU });
    m.getEspace.mockResolvedValue(null);
    await expect(espacePourDevis("r1")).resolves.toEqual({ nom: "Carrefour", couleur: COULEUR_BAILLY, logo: null, mention: undefined });
  });

  it("l'espace pro standard s'appelle « Espace pro »", async () => {
    avecDemande({ espace: { slug: "standard", nom: "Standard" } });
    m.getEspace.mockResolvedValue({ nom: "Standard", couleur: "#000000" });
    m.lireLogo.mockResolvedValue(null);
    expect((await espacePourDevis("r1"))!.nom).toBe("Espace pro");
  });

  it("logo illisible : le devis part sans logo", async () => {
    avecDemande({ espace: RETENU });
    m.getEspace.mockResolvedValue({ nom: "Carrefour", couleur: "#003399" });
    m.lireLogo.mockRejectedValue(new Error("stockage"));
    expect((await espacePourDevis("r1"))!.logo).toBeNull();
  });

  it("demande hors espace pro : aucun habillage", async () => {
    avecDemande({});
    await expect(espacePourDevis("r1")).resolves.toBeNull();
  });
});

describe("pdfFactureRh — les gardes avant toute lecture", () => {
  const espace = { id: "e1", slug: "carrefour", nom: "Carrefour", rh_couts: true };
  const settings = { entreprise_email: "contact@exemple.fr" };

  const attendre404 = async (r: Promise<Response>) => {
    const rep = await r;
    expect(rep.status).toBe(404);
    expect(rep.headers.get("Cache-Control")).toBe("no-store");
    expect(await rep.text()).toBe("Facture introuvable.");
  };

  it("entreprise sans accès aux coûts : 404, rien n'est lu", async () => {
    await attendre404(pdfFactureRh({ ...espace, rh_couts: false }, 12, settings));
    expect(m.lireEspaceRh).not.toHaveBeenCalled();
  });

  it.each([0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("numéro de facture %s : 404, rien n'est lu", async (id) => {
    await attendre404(pdfFactureRh(espace, id, settings));
    expect(m.lireEspaceRh).not.toHaveBeenCalled();
  });

  it("facture hors du périmètre de l'entreprise, ou sans PDF : 404 (même réponse)", async () => {
    m.lireEspaceRh.mockResolvedValue({ factures: [{ id: 7, pdf: true }, { id: 12, pdf: false }] });
    await attendre404(pdfFactureRh(espace, 99, settings));
    await attendre404(pdfFactureRh(espace, 12, settings));
    expect(m.creerClient).not.toHaveBeenCalled();
  });

  it("facture du périmètre mais absente de l'espace client : 404", async () => {
    m.lireEspaceRh.mockResolvedValue({ factures: [{ id: 7, pdf: true }] });
    m.creerClient.mockImplementation(() => fauxSupabase({ ec_factures: { data: null } }).client);
    await attendre404(pdfFactureRh(espace, 7, settings));
  });

  it("tout est là : le PDF du collaborateur, nommé d'après le numéro", async () => {
    m.lireEspaceRh.mockResolvedValue({ factures: [{ id: 7, pdf: true }] });
    m.creerClient.mockImplementation(() => fauxSupabase({ ec_factures: { data: { id: "ecf-1" } } }).client);
    m.trouver.mockImplementation(async (table: string, id: string) =>
      table === "factures" ? { id, dossier_id: "do-1", numero: "FA-2026-0007" } : table === "dossiers" ? { id, client_id: "cl-1" } : { id },
    );
    m.pdfFacture.mockResolvedValue(Buffer.from("PDF"));
    const rep = new Response("ok");
    m.reponsePdf.mockReturnValue(rep);
    await expect(pdfFactureRh(espace, 7, settings)).resolves.toBe(rep);
    expect(m.reponsePdf).toHaveBeenCalledWith(Buffer.from("PDF"), "facture-FA-2026-0007.pdf", true);
  });

  it("dossier ou client introuvable : 404", async () => {
    m.lireEspaceRh.mockResolvedValue({ factures: [{ id: 7, pdf: true }] });
    m.creerClient.mockImplementation(() => fauxSupabase({ ec_factures: { data: { id: "ecf-1" } } }).client);
    m.trouver.mockImplementation(async (table: string, id: string) => (table === "factures" ? { id, dossier_id: "do-1", numero: "F" } : null));
    await attendre404(pdfFactureRh(espace, 7, settings));
  });
});
