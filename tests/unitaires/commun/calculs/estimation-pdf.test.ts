import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxSupabase } from "./_outils";

const m = vi.hoisted(() => ({
  creerClient: vi.fn(),
  renderToBuffer: vi.fn(),
  getSettings: vi.fn(),
  espacePourDevis: vi.fn(),
  DevisPdf: vi.fn((p: unknown) => ({ document: p })),
}));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: m.renderToBuffer }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.creerClient() }));
vi.mock("@/lib/settings", () => ({ getSettings: m.getSettings }));
vi.mock("@/lib/DevisPdf", () => ({ DevisPdf: m.DevisPdf }));
vi.mock("@/lib/espace-demande", () => ({ espacePourDevis: m.espacePourDevis }));

import { estimationDeLaDemande } from "@/lib/estimation-pdf";

const DEVIS = {
  id: "d1",
  reference: "DEV-2026-0042",
  valid_until: "2026-12-31",
  montant_ht: "1234.5",
  montant_ttc: "1481.4",
  lignes: [
    { label: "Transport et manutention", detail: "20 m³ × 43 €/m³", amount: 860 },
    { label: "Portage piano", detail: "1 × 220 €", amount: 220 },
  ],
};
const DEMANDE = { depart_ville: "Massy", arrivee_ville: "Lyon", volume_m3: 20, date_souhaitee: "2027-03-15", flexibilite: null };

const base = (devis: unknown = DEVIS, requests: unknown = DEMANDE) =>
  m.creerClient.mockImplementation(() => fauxSupabase({ devis: { data: devis }, requests: { data: requests } }).client);

beforeEach(() => {
  vi.clearAllMocks();
  m.getSettings.mockResolvedValue({ entreprise_nom: "Bailly" });
  m.espacePourDevis.mockResolvedValue(null);
  m.renderToBuffer.mockResolvedValue(Buffer.from("PDF"));
});

describe("estimationDeLaDemande — ce que l'e-mail affiche de l'estimation", () => {
  it("sans demande : rien, sans lire la base", async () => {
    await expect(estimationDeLaDemande(undefined)).resolves.toBeNull();
    expect(m.creerClient).not.toHaveBeenCalled();
  });

  it("sans devis : rien", async () => {
    base(null);
    await expect(estimationDeLaDemande("req-1")).resolves.toBeNull();
  });

  it("montants numériques (la base les rend en texte), validité à la française, lignes sans détail", async () => {
    base();
    const e = (await estimationDeLaDemande("req-1"))!;
    expect(e).toMatchObject({
      devisId: "d1",
      reference: "DEV-2026-0042",
      validite: "31/12/2026",
      montant_ht: 1234.5,
      montant_ttc: 1481.4,
      lignes: [
        { label: "Transport et manutention", amount: 860 },
        { label: "Portage piano", amount: 220 },
      ],
    });
    expect(e.lignes[0]).not.toHaveProperty("detail");
  });

  it("sans date de validité : chaîne vide ; sans lignes : liste vide", async () => {
    base({ ...DEVIS, valid_until: null, lignes: null });
    const e = (await estimationDeLaDemande("req-1"))!;
    expect(e.validite).toBe("");
    expect(e.lignes).toEqual([]);
  });

  it("la base qui lève : rien, jamais d'exception (le message part sans estimation)", async () => {
    m.creerClient.mockImplementation(() => {
      throw new Error("base indisponible");
    });
    await expect(estimationDeLaDemande("req-1")).resolves.toBeNull();
  });
});

describe("estimationDeLaDemande — le PDF, rendu à la demande et une seule fois", () => {
  it("rien n'est rendu tant qu'on ne le demande pas", async () => {
    base();
    await estimationDeLaDemande("req-1");
    expect(m.renderToBuffer).not.toHaveBeenCalled();
  });

  it("rendu en base64, avec le trajet de la demande (date à la française)", async () => {
    base();
    const e = (await estimationDeLaDemande("req-1"))!;
    await expect(e.pdf()).resolves.toBe(Buffer.from("PDF").toString("base64"));
    expect(m.DevisPdf).toHaveBeenCalledWith(
      expect.objectContaining({ trajet: { depart: "Massy", arrivee: "Lyon", volume: 20, quand: "15/03/2027" } }),
    );
  });

  it("sans date souhaitée : la flexibilité ; sans demande lisible : tout à null", async () => {
    base(DEVIS, { ...DEMANDE, date_souhaitee: null, flexibilite: "Mars 2027" });
    await (await estimationDeLaDemande("req-1"))!.pdf();
    expect(m.DevisPdf.mock.calls[0][0]).toMatchObject({ trajet: { quand: "Mars 2027" } });

    vi.clearAllMocks();
    m.renderToBuffer.mockResolvedValue(Buffer.from("PDF"));
    base(DEVIS, null);
    await (await estimationDeLaDemande("req-1"))!.pdf();
    expect(m.DevisPdf.mock.calls[0][0]).toMatchObject({ trajet: { depart: null, arrivee: null, volume: null, quand: null } });
  });

  it("deux demandes de PDF : un seul rendu, le même résultat", async () => {
    base();
    const e = (await estimationDeLaDemande("req-1"))!;
    const [a, b] = await Promise.all([e.pdf(), e.pdf()]);
    expect(a).toBe(b);
    await e.pdf();
    expect(m.renderToBuffer).toHaveBeenCalledTimes(1);
  });

  it("rendu en échec : rien (le message part sans pièce jointe), sans nouvel essai", async () => {
    base();
    m.renderToBuffer.mockRejectedValue(new Error("police introuvable"));
    const e = (await estimationDeLaDemande("req-1"))!;
    await expect(e.pdf()).resolves.toBeUndefined();
    await expect(e.pdf()).resolves.toBeUndefined();
    expect(m.renderToBuffer).toHaveBeenCalledTimes(1);
  });

  it("l'habillage de l'espace pro qui lève fait échouer le seul PDF, pas l'estimation", async () => {
    base();
    m.espacePourDevis.mockRejectedValue(new Error("x"));
    const e = await estimationDeLaDemande("req-1");
    expect(e).not.toBeNull();
    await expect(e!.pdf()).resolves.toBeUndefined();
  });
});
