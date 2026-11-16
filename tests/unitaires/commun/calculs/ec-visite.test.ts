import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxSupabase } from "./_outils";

const m = vi.hoisted(() => ({
  creerClient: vi.fn(),
  estDemo: vi.fn(() => false),
  trouver: vi.fn(),
  lireDuClient: vi.fn(async () => ({})),
  envoyer: vi.fn(),
  conseillerDe: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.creerClient() }));
vi.mock("@/lib/espace-client/config", () => ({ estDemo: m.estDemo }));
vi.mock("@/lib/espace-client/depot", () => ({
  avecDelai: (p: PromiseLike<unknown>) => Promise.resolve(p),
  depot: () => ({ trouver: m.trouver, lireDuClient: m.lireDuClient }),
}));
vi.mock("@/lib/espace-client/lectures", () => ({
  conseillerDe: m.conseillerDe,
  signatureDe: (c: { prenom: string; nom: string; telephone: string }) => ({ nom: `${c.prenom} ${c.nom}`, role: "Votre contact", telephone: c.telephone }),
}));
vi.mock("@/lib/espace-client/notifier", () => ({ notifier: { envoyer: m.envoyer } }));

import { choisirCreneauCrm, demanderCreneauxCrm, notifierCreneauxProposes } from "@/lib/espace-client/visite";

const CLIENT = { id: "cl-1", civilite: "Madame", prenom: "Claire", nom: "Dumont", email: "claire@example.com", conseiller_id: "co-1" };
const CONSEILLER = { id: "co-1", prenom: "Nadia", nom: "Benali", email: "nadia@exemple.fr", telephone: "0102030405" };

beforeEach(() => {
  vi.clearAllMocks();
  m.estDemo.mockReturnValue(false);
  m.conseillerDe.mockReturnValue(CONSEILLER);
});

describe("choisirCreneauCrm et demanderCreneauxCrm — les fonctions de la base", () => {
  it("en démonstration : « inconnu », sans toucher à la base", async () => {
    m.estDemo.mockReturnValue(true);
    await expect(choisirCreneauCrm("cr-1", "cl-1")).resolves.toBe("inconnu");
    await expect(demanderCreneauxCrm("do-1", "cl-1", "Plutôt le soir")).resolves.toBe("inconnu");
    expect(m.creerClient).not.toHaveBeenCalled();
  });

  it("appelle la fonction de la migration avec le créneau et le client vérifiés, et rend son issue", async () => {
    const f = fauxSupabase({ ec_choisir_creneau_crm: { data: "reserve" } });
    m.creerClient.mockReturnValue(f.client);
    await expect(choisirCreneauCrm("cr-1", "cl-1")).resolves.toBe("reserve");
    expect(f.appels).toContainEqual({ table: "ec_choisir_creneau_crm", methode: "rpc", args: [{ p_creneau: "cr-1", p_client: "cl-1" }] });
  });

  it("la demande d'autres créneaux transmet le message du client", async () => {
    const f = fauxSupabase({ ec_demander_creneaux_crm: { data: "demande" } });
    m.creerClient.mockReturnValue(f.client);
    await expect(demanderCreneauxCrm("do-1", "cl-1", "Plutôt le soir")).resolves.toBe("demande");
    expect(f.appels).toContainEqual({ table: "ec_demander_creneaux_crm", methode: "rpc", args: [{ p_dossier: "do-1", p_client: "cl-1", p_message: "Plutôt le soir" }] });
  });

  it("une erreur de la base remonte avec son message", async () => {
    m.creerClient.mockReturnValue(fauxSupabase({ ec_choisir_creneau_crm: { data: null, error: { message: "créneau verrouillé" } } }).client);
    await expect(choisirCreneauCrm("cr-1", "cl-1")).rejects.toThrow("créneau verrouillé");
  });
});

describe("notifierCreneauxProposes — l'e-mail des créneaux, sans jamais bloquer le CRM", () => {
  const avecDossier = (data: unknown) => m.creerClient.mockReturnValue(fauxSupabase({ ec_dossiers: { data } }).client);

  it("en démonstration : rien", async () => {
    m.estDemo.mockReturnValue(true);
    await expect(notifierCreneauxProposes(12, ["lundi 16 novembre à 10 h"])).resolves.toBeNull();
    expect(m.envoyer).not.toHaveBeenCalled();
  });

  it("dossier du CRM sans espace client : rien", async () => {
    avecDossier(null);
    await expect(notifierCreneauxProposes(12, [])).resolves.toBeNull();
  });

  it("client introuvable : rien", async () => {
    avecDossier({ id: "do-1", reference: "BD-2026-0164", client_id: "cl-1" });
    m.trouver.mockResolvedValue(null);
    await expect(notifierCreneauxProposes(12, [])).resolves.toBeNull();
    expect(m.envoyer).not.toHaveBeenCalled();
  });

  it("un e-mail au client : salutation, conseiller, créneaux, lien vers la visite ; rend le statut d'envoi", async () => {
    avecDossier({ id: "do-1", reference: "BD-2026-0164", client_id: "cl-1" });
    m.trouver.mockResolvedValue(CLIENT);
    m.envoyer.mockResolvedValue({ statut: "journalisee" });
    const creneaux = ["lundi 16 novembre à 10 h", "mardi 17 novembre à 14 h 30"];
    await expect(notifierCreneauxProposes(12, creneaux)).resolves.toBe("journalisee");
    expect(m.envoyer).toHaveBeenCalledWith({
      dossier_id: "do-1", canal: "email", modele: "creneaux_visite", destinataire: "claire@example.com",
      payload: {
        salutation: "Madame Dumont", conseiller: "Nadia Benali", creneaux, chemin: "/espace-client/BD-2026-0164/visite",
        signature: { nom: "Nadia Benali", role: "Votre contact", telephone: "0102030405" },
      },
    });
  });

  it("un conseiller sans nom de famille : pas d'espace qui traîne", async () => {
    avecDossier({ id: "do-1", reference: "BD-2026-0164", client_id: "cl-1" });
    m.trouver.mockResolvedValue(CLIENT);
    m.conseillerDe.mockReturnValue({ ...CONSEILLER, nom: "" });
    m.envoyer.mockResolvedValue({ statut: "envoyee" });
    await notifierCreneauxProposes(12, []);
    expect(m.envoyer.mock.calls[0][0].payload.conseiller).toBe("Nadia");
  });

  it("toute erreur devient « echec », journalisée, sans exception", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    avecDossier({ id: "do-1", reference: "BD-2026-0164", client_id: "cl-1" });
    m.trouver.mockRejectedValue(new Error("base"));
    await expect(notifierCreneauxProposes(12, [])).resolves.toBe("echec");
    expect(erreur).toHaveBeenCalled();
    erreur.mockRestore();
  });
});
