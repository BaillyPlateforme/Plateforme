import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fausseBase, fetchInterdit, filtre, type Requete } from "./_outils";

/*
 * Le paiement par Stripe Checkout, côté création et retour du client
 * (stripe.ts : PaiementStripe.creerPaiement, retourDeStripe). Le client
 * Stripe est une doublure : aucune requête ne part chez Stripe.
 */

const m = vi.hoisted(() => ({
  depot: null as unknown,
  client: null as unknown,
  stripe: null as unknown,
  envoyer: vi.fn(),
  alerterEquipe: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.client }));
vi.mock("@/lib/espace-client/stripe-config", () => ({
  clientStripe: () => m.stripe,
  secretWebhook: () => "whsec_test",
  stripeConfigure: () => true,
  simulationPermise: () => false,
}));
vi.mock("@/lib/espace-client/depot", () => ({
  depot: () => m.depot,
  nouvelId: () => "neuve",
  maintenant: () => "2026-11-15T10:00:00.000Z",
  avecDelai: <T,>(p: PromiseLike<T>) => Promise.resolve(p),
}));
vi.mock("@/lib/espace-client/crm", () => ({ estRelie: () => false, arrhesCrm: vi.fn(), facturePayeeCrm: vi.fn(), noterDansLeCrm: vi.fn() }));
vi.mock("@/lib/espace-client/notifier", () => ({ notifier: { envoyer: m.envoyer } }));
vi.mock("@/lib/alertes-equipe", () => ({ alerterEquipe: m.alerterEquipe }));

import { paiementStripe, prestataire, retourDeStripe } from "@/lib/espace-client/stripe";

type Table = Record<string, unknown>[];
let t: Record<string, Table>;
let depot: { inserer: ReturnType<typeof vi.fn>; modifier: ReturnType<typeof vi.fn>; trouver: ReturnType<typeof vi.fn>; lireDuClient: ReturnType<typeof vi.fn>; prochainNumero: ReturnType<typeof vi.fn> };
let ouvertes: { id: string }[];
let lignes: Record<string, Record<string, unknown>>;
let erreurInsertion: { message: string } | null;
let base: ReturnType<typeof fausseBase>;
let stripe: { checkout: { sessions: { create: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn>; expire: ReturnType<typeof vi.fn> } } };

const MAINTENANT_S = Math.floor(Date.now() / 1000);
const cs = (champs: Record<string, unknown> = {}) => ({
  id: "cs_ancienne", object: "checkout.session", status: "open", url: "https://checkout.stripe.com/c/pay/cs_ancienne", expires_at: MAINTENANT_S + 3600,
  metadata: { session_paiement_id: "se-1" }, client_reference_id: "se-1", amount_total: 125050, currency: "eur", payment_status: "unpaid", payment_intent: null, ...champs,
});
const demande = { cible: "facture" as const, cible_id: "fa-1", dossier_id: "do-1", montant: 1250.5, libelle: "Solde", trace: null, reference: "BD-2026-0147", email: "claire@gmail.com" };
const sessionDe = (id: string) => t.sessions_paiement.find((s) => s.id === id)!;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchInterdit());
  vi.stubEnv("ESPACE_CLIENT_URL", "https://espace.bailly.fr");
  t = {
    conseillers: [{ id: "eq-1", prenom: "Nadia", nom: "Berthier", email: "nadia@bailly.fr", telephone: "01", demo: false }],
    clients: [{ id: "cl-1", civilite: null, prenom: "Claire", nom: "Dumont", email: "claire@gmail.com", conseiller_id: "eq-1" }],
    dossiers: [{ id: "do-1", client_id: "cl-1", reference: "BD-2026-0147", crm_dossier_id: null }],
    factures: [{ id: "fa-1", dossier_id: "do-1", statut: "a_payer" }],
    devis: [],
    sessions_paiement: [{ id: "se-1", cible: "facture", cible_id: "fa-1", dossier_id: "do-1", montant: 1250.5, libelle: "Solde", statut: "ouverte", reference: null, trace: null, created_at: "2026-11-15T09:00:00Z" }],
  };
  depot = {
    trouver: vi.fn(async (table: string, id: string) => t[table]?.find((l) => l.id === id) ?? null),
    inserer: vi.fn(async (table: string, l: Record<string, unknown>) => void (t[table] ??= []).push(l)),
    modifier: vi.fn(async (table: string, id: string, champs: Record<string, unknown>, attendu?: Record<string, unknown>) => {
      const l = t[table]?.find((x) => x.id === id);
      if (!l || (attendu && Object.entries(attendu).some(([k, v]) => l[k] !== v))) return false;
      Object.assign(l, champs);
      return true;
    }),
    lireDuClient: vi.fn(async () => t),
    prochainNumero: vi.fn(async (_t: string, p: string) => `${p}0001`),
  };
  m.depot = depot;
  ouvertes = [];
  lignes = {};
  erreurInsertion = null;
  base = fausseBase((r: Requete) => {
    if (r.table === "ec_sessions_paiement") return { data: ouvertes };
    if (r.table === "ec_paiements_stripe" && r.action === "select") return { data: lignes[filtre(r, "eq", "session_paiement_id") as string] ?? null };
    if (r.table === "ec_paiements_stripe" && r.action === "insert") return { error: erreurInsertion };
    return { data: null };
  });
  m.client = base.client;
  stripe = {
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_neuve", url: "https://checkout.stripe.com/c/pay/cs_neuve", expires_at: MAINTENANT_S + 3600 })),
        retrieve: vi.fn(async () => cs()),
        expire: vi.fn(async () => cs({ status: "expired" })),
      },
    },
  };
  m.stripe = stripe;
  m.envoyer.mockReset().mockResolvedValue({ statut: "journalisee" });
  m.alerterEquipe.mockReset().mockResolvedValue({ destinataires: 0, partis: 0 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("espace-client/stripe — creerPaiement", () => {
  it("le prestataire en service est Stripe quand il est réglé", () => {
    expect(prestataire()).toBe(paiementStripe);
  });

  it("sans session ouverte : une session de l'espace, une session Checkout (clé d'idempotence), une ligne Stripe", async () => {
    const r = await paiementStripe.creerPaiement(demande);
    expect(r).toEqual({ sessionId: "neuve", url: "https://checkout.stripe.com/c/pay/cs_neuve" });
    expect(sessionDe("neuve")).toMatchObject({ statut: "ouverte", montant: 1250.5, cible: "facture" });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ client_reference_id: "neuve", success_url: "https://espace.bailly.fr/espace-client/paiement/neuve/retour?issue=succes" }), { idempotencyKey: "bailly-ec-checkout-neuve" });
    expect(base.de("ec_paiements_stripe", "insert")[0].charge).toMatchObject({ session_paiement_id: "neuve", checkout_id: "cs_neuve", statut: "ouverte", montant_centimes: 125050 });
  });

  it("un double clic sur « Payer » retrouve la même page Stripe (pas de seconde session réglable)", async () => {
    ouvertes = [{ id: "se-1" }];
    lignes["se-1"] = { session_paiement_id: "se-1", checkout_id: "cs_ancienne", statut: "ouverte", montant_centimes: 125050 };
    const r = await paiementStripe.creerPaiement(demande);
    expect(r).toEqual({ sessionId: "se-1", url: "https://checkout.stripe.com/c/pay/cs_ancienne" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(depot.inserer).not.toHaveBeenCalled();
  });

  it("une session ouverte pour un autre montant est fermée chez Stripe avant d'en ouvrir une nouvelle", async () => {
    ouvertes = [{ id: "se-1" }];
    lignes["se-1"] = { session_paiement_id: "se-1", checkout_id: "cs_ancienne", statut: "ouverte", montant_centimes: 100000 };
    const r = await paiementStripe.creerPaiement(demande);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_ancienne");
    expect(sessionDe("se-1").statut).toBe("annulee");
    expect(r.sessionId).toBe("neuve");
  });

  it("une session qui expire dans moins de cinq minutes n'est pas reprise", async () => {
    ouvertes = [{ id: "se-1" }];
    lignes["se-1"] = { session_paiement_id: "se-1", checkout_id: "cs_ancienne", statut: "ouverte", montant_centimes: 125050 };
    stripe.checkout.sessions.retrieve.mockResolvedValue(cs({ expires_at: MAINTENANT_S + 4 * 60 }));
    await paiementStripe.creerPaiement(demande);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_ancienne");
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("une session réglée entre-temps est appliquée, et aucune nouvelle ne s'ouvre (jamais deux paiements)", async () => {
    ouvertes = [{ id: "se-1" }];
    lignes["se-1"] = { session_paiement_id: "se-1", checkout_id: "cs_ancienne", statut: "ouverte", montant_centimes: 125050 };
    stripe.checkout.sessions.retrieve.mockResolvedValue(cs({ status: "complete", payment_status: "paid", payment_intent: "pi_1" }));
    const r = await paiementStripe.creerPaiement(demande);
    expect(r).toEqual({ sessionId: "se-1", url: "/espace-client/BD-2026-0147/paiement/se-1" });
    expect(sessionDe("se-1")).toMatchObject({ statut: "payee", reference: "pi_1" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("une fermeture refusée (réglée à l'instant) : l'état relu, appliqué, rien de nouveau", async () => {
    ouvertes = [{ id: "se-1" }];
    lignes["se-1"] = { session_paiement_id: "se-1", checkout_id: "cs_ancienne", statut: "ouverte", montant_centimes: 999 };
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce(cs()).mockResolvedValueOnce(cs({ status: "complete", payment_status: "paid", payment_intent: "pi_2", amount_total: 125050 }));
    stripe.checkout.sessions.expire.mockRejectedValue(new Error("session already complete"));
    const r = await paiementStripe.creerPaiement(demande);
    expect(r.url).toBe("/espace-client/BD-2026-0147/paiement/se-1");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("Stripe en panne à la création : la session de l'espace est annulée, l'erreur est dite", async () => {
    stripe.checkout.sessions.create.mockRejectedValue(new Error("api_connection_error"));
    await expect(paiementStripe.creerPaiement(demande)).rejects.toThrow("Paiement en ligne indisponible : api_connection_error");
    expect(sessionDe("neuve").statut).toBe("annulee");
  });

  it("Stripe sans adresse de paiement : annulée de même", async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_x", url: null, expires_at: MAINTENANT_S + 3600 });
    await expect(paiementStripe.creerPaiement(demande)).rejects.toThrow("Stripe n'a pas rendu d'adresse de paiement.");
    expect(sessionDe("neuve").statut).toBe("annulee");
  });

  it("la ligne Stripe non inscrite : la session Checkout est fermée avant que le client ne paie", async () => {
    erreurInsertion = { message: "permission denied" };
    await expect(paiementStripe.creerPaiement(demande)).rejects.toThrow("Paiement en ligne indisponible : permission denied");
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_neuve");
    expect(sessionDe("neuve").statut).toBe("annulee");
  });
});

describe("espace-client/stripe — retourDeStripe", () => {
  beforeEach(() => {
    lignes["se-1"] = { session_paiement_id: "se-1", checkout_id: "cs_ancienne", statut: "ouverte", montant_centimes: 125050 };
  });

  it("succès : l'état redemandé à Stripe ; réglée, elle est appliquée tout de suite", async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(cs({ status: "complete", payment_status: "paid", payment_intent: "pi_9" }));
    await retourDeStripe("se-1", "succes");
    expect(sessionDe("se-1")).toMatchObject({ statut: "payee", reference: "pi_9" });
  });

  it("succès mais encore ouverte chez Stripe : rien ne change (le webhook fera le travail)", async () => {
    await retourDeStripe("se-1", "succes");
    expect(sessionDe("se-1").statut).toBe("ouverte");
  });

  it("annulation : la session Checkout est fermée chez Stripe, puis close ici", async () => {
    await retourDeStripe("se-1", "annulation");
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_ancienne");
    expect(sessionDe("se-1").statut).toBe("annulee");
  });

  it("annulation d'une session réglée dans un autre onglet : l'état relu, le paiement appliqué", async () => {
    stripe.checkout.sessions.expire.mockRejectedValue(new Error("already complete"));
    stripe.checkout.sessions.retrieve.mockResolvedValue(cs({ status: "complete", payment_status: "paid", payment_intent: "pi_onglet" }));
    await retourDeStripe("se-1", "annulation");
    expect(sessionDe("se-1")).toMatchObject({ statut: "payee", reference: "pi_onglet" });
  });

  it("session inconnue, Stripe ou base en panne : ne lève jamais", async () => {
    await expect(retourDeStripe("inconnue", "succes")).resolves.toBeUndefined();
    stripe.checkout.sessions.retrieve.mockRejectedValue(new Error("Stripe 500"));
    await expect(retourDeStripe("se-1", "succes")).resolves.toBeUndefined();
    m.client = fausseBase(() => ({ error: { message: "base" } })).client;
    await expect(retourDeStripe("se-1", "succes")).resolves.toBeUndefined();
  });
});
