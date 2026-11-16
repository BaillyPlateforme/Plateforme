import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { fausseBase, fetchInterdit, filtre, type Requete } from "./_outils";

/*
 * Le paiement de l'espace client : la configuration (stripe-config.ts), la
 * simulation (paiement.ts, fermée hors recette) et Stripe (stripe.ts :
 * paramètres de Checkout, webhook signé). Le dépôt de l'espace, le CRM, les
 * notifications et les alertes sont simulés ; la vérification de signature
 * de Stripe est la vraie (bibliothèque stripe, sans réseau).
 */

const m = vi.hoisted(() => ({
  depot: null as unknown,
  client: null as unknown,
  envoyer: vi.fn(),
  alerterEquipe: vi.fn(),
  arrhesCrm: vi.fn(),
  facturePayeeCrm: vi.fn(),
  noterDansLeCrm: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.client }));
vi.mock("@/lib/espace-client/depot", () => ({
  depot: () => m.depot,
  nouvelId: () => "11111111-2222-4333-8444-555555555555",
  maintenant: () => "2026-11-15T10:00:00.000Z",
  avecDelai: <T,>(p: PromiseLike<T>) => Promise.resolve(p),
}));
vi.mock("@/lib/espace-client/crm", () => ({
  estRelie: (d: { crm_dossier_id?: number | null }) => typeof d.crm_dossier_id === "number",
  arrhesCrm: m.arrhesCrm,
  facturePayeeCrm: m.facturePayeeCrm,
  noterDansLeCrm: m.noterDansLeCrm,
}));
vi.mock("@/lib/espace-client/notifier", () => ({ notifier: { envoyer: m.envoyer } }));
vi.mock("@/lib/alertes-equipe", () => ({ alerterEquipe: m.alerterEquipe }));

import { clientStripe, secretWebhook, simulationPermise, stripeConfigure } from "@/lib/espace-client/stripe-config";
import { appliquerEvenement, paiementSimule, traiterEvenement, type EvenementPaiement } from "@/lib/espace-client/paiement";
import { centimes, cleCheckout, creerCheckout, parametresCheckout, prestataire, traiterCheckout, traiterWebhookStripe } from "@/lib/espace-client/stripe";
import { signer } from "@/lib/espace-client/signature";

// --- Un dépôt de l'espace, en mémoire -----------------------------------------------------------------

type Table = Record<string, unknown>[];
function fauxDepot(donnees: Record<string, Table>) {
  const t = structuredClone(donnees);
  return {
    t,
    mode: "base",
    trouver: vi.fn(async (table: string, id: string) => t[table]?.find((l) => l.id === id) ?? null),
    inserer: vi.fn(async (table: string, l: unknown) => {
      (t[table] ??= []).push(...(Array.isArray(l) ? l : [l]));
    }),
    modifier: vi.fn(async (table: string, id: string, champs: Record<string, unknown>, attendu?: Record<string, unknown>) => {
      const l = t[table]?.find((x) => x.id === id);
      if (!l) return false;
      if (attendu && Object.entries(attendu).some(([k, v]) => l[k] !== v)) return false;
      Object.assign(l, champs);
      return true;
    }),
    lireDuClient: vi.fn(async () => t),
    prochainNumero: vi.fn(async (_t: string, prefixe: string) => `${prefixe}0469`),
  };
}

const DONNEES = {
  conseillers: [{ id: "eq-1", prenom: "Nadia", nom: "Berthier", email: "nadia@bailly.fr", telephone: "01 84 60 12 30", demo: false }],
  clients: [{ id: "cl-1", civilite: "Madame", prenom: "Claire", nom: "Dumont", email: "claire@gmail.com", conseiller_id: "eq-1", demo: false }],
  dossiers: [{ id: "do-1", client_id: "cl-1", reference: "BD-2026-0147", crm_dossier_id: null }],
  devis: [
    { id: "dv-1", dossier_id: "do-1", numero: "DV-2026-0001", arrhes_pourcentage: 30, statut: "envoye", accepte_le: null },
    { id: "dv-2", dossier_id: "do-1", numero: "DV-2026-0002", arrhes_pourcentage: 30, statut: "envoye", accepte_le: null },
    { id: "dv-3", dossier_id: "do-9", numero: "DV-2026-0003", arrhes_pourcentage: 30, statut: "envoye", accepte_le: null },
  ],
  factures: [{ id: "fa-1", dossier_id: "do-1", statut: "a_payer", payee_le: null, paiement_ref: null, crm_facture_id: null }],
  acceptations: [],
  sessions_paiement: [
    { id: "se-1", cible: "facture", cible_id: "fa-1", dossier_id: "do-1", montant: 1250.5, libelle: "Solde du déménagement", statut: "ouverte", reference: null, trace: null, created_at: "2026-11-15T09:00:00.000Z" },
    { id: "se-2", cible: "devis_arrhes", cible_id: "dv-1", dossier_id: "do-1", montant: 900, libelle: "Arrhes 30 %", statut: "ouverte", reference: null, trace: { ip: "203.0.113.7", user_agent: "Safari", cgv: "CGV-2026.1" }, created_at: "2026-11-15T09:00:00.000Z" },
  ],
};

let depot: ReturnType<typeof fauxDepot>;
const session = (id: string) => depot.t.sessions_paiement.find((s) => s.id === id)!;

beforeEach(() => {
  depot = fauxDepot(DONNEES);
  m.depot = depot;
  m.client = fausseBase().client;
  m.envoyer.mockReset().mockResolvedValue({ statut: "journalisee" });
  m.alerterEquipe.mockReset().mockResolvedValue({ destinataires: 0, partis: 0 });
  m.arrhesCrm.mockReset().mockResolvedValue("signe");
  m.facturePayeeCrm.mockReset().mockResolvedValue("payee");
  m.noterDansLeCrm.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("ESPACE_CLIENT_SECRET", "secret-de-test-espace-client");
  vi.stubGlobal("fetch", fetchInterdit());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- stripe-config ------------------------------------------------------------------------------------

describe("espace-client/stripe-config — stripeConfigure, secretWebhook", () => {
  it("il faut les DEUX clés, non vides une fois rognées", () => {
    expect(stripeConfigure()).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect(stripeConfigure()).toBe(false);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "   ");
    expect(stripeConfigure()).toBe(false);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    expect(stripeConfigure()).toBe(true);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(stripeConfigure()).toBe(false);
  });

  it("le secret du webhook est rendu sans espaces autour, vide sans variable", () => {
    expect(secretWebhook()).toBe("");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "  whsec_abc \n");
    expect(secretWebhook()).toBe("whsec_abc");
  });
});

describe("espace-client/stripe-config — simulationPermise", () => {
  const cas: [Record<string, string>, boolean][] = [
    [{ NODE_ENV: "test" }, true],
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "" }, false],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "   " }, false],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production" }, false],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: " Production " }, false],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "PRODUCTION" }, false],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "dev" }, true],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "recette" }, true],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production", PAIEMENT_SIMULE: "1" }, true],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production", PAIEMENT_SIMULE: "true" }, false],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production", PAIEMENT_SIMULE: "oui" }, false],
    [{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production", PAIEMENT_SIMULE: " 1" }, false],
  ];
  for (const [env, attendu] of cas) {
    it(`${JSON.stringify(env)} → ${attendu ? "permise" : "fermée"}`, () => {
      vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "");
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      expect(simulationPermise()).toBe(attendu);
    });
  }
});

describe("espace-client/stripe-config — clientStripe", () => {
  it("lève sans clé secrète (jamais de client vide)", () => {
    expect(() => clientStripe()).toThrow("Stripe n'est pas réglé (STRIPE_SECRET_KEY).");
  });

  it("le même client pour la même clé, un nouveau si la clé change", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_un");
    const a = clientStripe();
    expect(clientStripe()).toBe(a);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_deux");
    expect(clientStripe()).not.toBe(a);
  });
});

// --- paiement.ts : la simulation ----------------------------------------------------------------------

describe("espace-client/paiement — le prestataire simulé", () => {
  it("ouvre une session sans garder la référence ni l'adresse du client, et renvoie vers sa page", async () => {
    const r = await paiementSimule.creerPaiement({ cible: "facture", cible_id: "fa-1", dossier_id: "do-1", montant: 10, libelle: "Solde", trace: null, reference: "BD-2026-0147", email: "claire@gmail.com" });
    expect(r).toEqual({ sessionId: "11111111-2222-4333-8444-555555555555", url: "/espace-client/paiement/11111111-2222-4333-8444-555555555555" });
    const s = depot.inserer.mock.calls[0][1] as Record<string, unknown>;
    expect(s).toMatchObject({ statut: "ouverte", reference: null, montant: 10, cible: "facture" });
    expect(s).not.toHaveProperty("email");
  });

  it("la signature de l'événement se vérifie, et toute altération la casse", () => {
    const ev: EvenementPaiement = { type: "paiement.reussi", session_id: "se-1", reference: "SIM-1" };
    const { corps, signature } = paiementSimule.signerEvenement(ev);
    expect(paiementSimule.verifierEvenement(corps, signature)).toEqual(ev);
    expect(paiementSimule.verifierEvenement(corps.replace("se-1", "se-2"), signature)).toBeNull();
    expect(paiementSimule.verifierEvenement(corps, `${signature}x`)).toBeNull();
    expect(paiementSimule.verifierEvenement(corps, signature.slice(0, -1))).toBeNull();
    expect(paiementSimule.verifierEvenement(corps, null)).toBeNull();
    expect(paiementSimule.verifierEvenement(corps, "")).toBeNull();
  });

  it("une signature faite pour un autre usage (lien de fichier…) ne vaut rien ici", () => {
    const corps = JSON.stringify({ type: "paiement.reussi", session_id: "se-1", reference: "x" });
    expect(paiementSimule.verifierEvenement(corps, signer(corps, "fichier"))).toBeNull();
    expect(paiementSimule.verifierEvenement(corps, signer(corps, "paiement"))).not.toBeNull();
  });

  it("un corps signé mais illisible, ou sans les champs attendus, est refusé", () => {
    for (const corps of ["pas du json", "{}", '{"session_id":1,"reference":"x"}', '{"session_id":"se-1"}', "null"]) {
      expect(paiementSimule.verifierEvenement(corps, signer(corps, "paiement")), corps).toBeNull();
    }
  });

  it("une signature changée de clé serveur ne vaut plus", () => {
    const { corps, signature } = paiementSimule.signerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "x" });
    vi.stubEnv("ESPACE_CLIENT_SECRET", "une-autre-cle");
    expect(paiementSimule.verifierEvenement(corps, signature)).toBeNull();
  });
});

describe("espace-client/paiement — traiterEvenement : la simulation fermée hors recette", () => {
  const signe = (ev: EvenementPaiement = { type: "paiement.reussi", session_id: "se-1", reference: "SIM-1" }) => paiementSimule.signerEvenement(ev);

  it("Stripe réglé : la simulation est fermée, même avec une signature valable", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    const { corps, signature } = signe();
    expect(await traiterEvenement(corps, signature)).toEqual({ ok: false, message: "Paiement simulé fermé : le prestataire est Stripe." });
    expect(session("se-1").statut).toBe("ouverte");
    expect(depot.trouver).not.toHaveBeenCalled();
  });

  it("en production : fermée, même avec une signature valable — la facture reste à payer", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    const { corps, signature } = signe();
    expect(await traiterEvenement(corps, signature)).toEqual({ ok: false, message: "Paiement simulé fermé en production : le paiement en ligne attend Stripe." });
    expect(depot.trouver).not.toHaveBeenCalled();
    expect(depot.t.factures[0].statut).toBe("a_payer");
    expect(m.envoyer).not.toHaveBeenCalled();
  });

  it("serveur de production sans nom d'environnement : fermée", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "");
    const { corps, signature } = signe();
    expect((await traiterEvenement(corps, signature)).ok).toBe(false);
  });

  it("PAIEMENT_SIMULE=1 (démonstration) : ouverte même en production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    vi.stubEnv("PAIEMENT_SIMULE", "1");
    const { corps, signature } = signe();
    expect(await traiterEvenement(corps, signature)).toEqual({ ok: true, message: "Paiement enregistré." });
  });

  it("signature invalide : refusé, rien ne change", async () => {
    const { corps } = signe();
    expect(await traiterEvenement(corps, "falsifiee")).toEqual({ ok: false, message: "Signature invalide." });
    expect(await traiterEvenement(corps, null)).toEqual({ ok: false, message: "Signature invalide." });
    expect(session("se-1").statut).toBe("ouverte");
  });

  it("en recette (dev) : appliqué", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "dev");
    const { corps, signature } = signe();
    expect((await traiterEvenement(corps, signature)).ok).toBe(true);
    expect(depot.t.factures[0].statut).toBe("payee");
  });
});

describe("espace-client/paiement — appliquerEvenement", () => {
  it("session inconnue (ou base qui lève) : refusé", async () => {
    expect(await appliquerEvenement({ type: "paiement.reussi", session_id: "inconnue", reference: "x" })).toEqual({ ok: false, message: "Session inconnue." });
    depot.trouver.mockRejectedValueOnce(new Error("base"));
    expect(await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "x" })).toEqual({ ok: false, message: "Session inconnue." });
  });

  it("facture : payée, datée, avec la référence ; le client et l'équipe sont prévenus", async () => {
    const r = await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi_123" });
    expect(r).toEqual({ ok: true, message: "Paiement enregistré." });
    expect(session("se-1")).toMatchObject({ statut: "payee", reference: "pi_123" });
    expect(depot.t.factures[0]).toMatchObject({ statut: "payee", paiement_ref: "pi_123" });
    expect(depot.t.factures[0].payee_le).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.envoyer).toHaveBeenCalledTimes(1);
    const n = m.envoyer.mock.calls[0][0];
    expect(n).toMatchObject({ dossier_id: "do-1", canal: "email", modele: "paiement_confirme", destinataire: "claire@gmail.com" });
    expect(n.payload).toMatchObject({ salutation: "Madame Dumont", libelle: "Solde du déménagement", reference: "pi_123", chemin: "/espace-client/BD-2026-0147/devis#factures", signature: { nom: "Nadia Berthier", role: "Votre contact", telephone: "01 84 60 12 30" } });
    expect(n.payload.montant).toMatch(/^1\s?250,50\s€$/u);
    expect(m.alerterEquipe).toHaveBeenCalledWith("paiement_recu", expect.objectContaining({ evenement: "session-se-1", reference: "BD-2026-0147", origine: "espace_client", conseillers: ["nadia@bailly.fr"], lien: null }));
  });

  it("rejoué : « Déjà traité », rien ne se refait (ni facture, ni e-mail, ni alerte)", async () => {
    await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi_123" });
    const r = await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi_999" });
    expect(r).toEqual({ ok: true, message: "Déjà traité.", deja: true });
    expect(depot.t.factures[0].paiement_ref).toBe("pi_123");
    expect(m.envoyer).toHaveBeenCalledTimes(1);
    expect(m.alerterEquipe).toHaveBeenCalledTimes(1);
  });

  it("deux confirmations simultanées : une seule l'emporte", async () => {
    const [a, b] = await Promise.all([
      appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi_1" }),
      appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi_2" }),
    ]);
    expect([a.deja, b.deja].filter(Boolean)).toHaveLength(1);
    expect(m.envoyer).toHaveBeenCalledTimes(1);
  });

  it("annulation : la session est close, rien d'autre", async () => {
    expect(await appliquerEvenement({ type: "paiement.annule", session_id: "se-1", reference: "cs_1" })).toEqual({ ok: true, message: "Paiement annulé." });
    expect(session("se-1").statut).toBe("annulee");
    expect(depot.t.factures[0].statut).toBe("a_payer");
    expect(m.envoyer).not.toHaveBeenCalled();
    // Une annulation après coup ne rouvre rien.
    expect((await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi" })).deja).toBe(true);
  });

  it("arrhes d'un devis : accepté, les autres devis du dossier refusés, une facture d'arrhes payée, l'acceptation horodatée", async () => {
    const r = await appliquerEvenement({ type: "paiement.reussi", session_id: "se-2", reference: "pi_arrhes" });
    expect(r.ok).toBe(true);
    expect(depot.t.devis.find((d) => d.id === "dv-1")).toMatchObject({ statut: "accepte" });
    expect(depot.t.devis.find((d) => d.id === "dv-2")).toMatchObject({ statut: "refuse" });
    expect(depot.t.devis.find((d) => d.id === "dv-3")).toMatchObject({ statut: "envoye" }); // un autre dossier
    const facture = depot.t.factures.find((f) => f.type === "arrhes")!;
    expect(facture).toMatchObject({ numero: expect.stringMatching(/^FA-\d{4}-0469$/), montant_ttc: 900, statut: "payee", paiement_ref: "pi_arrhes", devis_id: "dv-1", libelle: "Arrhes 30 % — devis DV-2026-0001" });
    expect(depot.t.acceptations).toEqual([
      { id: "11111111-2222-4333-8444-555555555555", dossier_id: "do-1", type: "devis", version_texte: "CGV-2026.1", objet: "DV-2026-0001", accepted_at: "2026-11-15T09:00:00.000Z", ip: "203.0.113.7", user_agent: "Safari" },
    ]);
  });

  it("dossier relié au CRM : c'est le CRM qui encaisse", async () => {
    depot.t.dossiers[0].crm_dossier_id = 77;
    depot.t.factures[0].crm_facture_id = 501;
    const r = await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi_crm" });
    expect(r.ok).toBe(true);
    expect(m.facturePayeeCrm).toHaveBeenCalledWith(501, "pi_crm");
    expect(depot.t.factures[0].statut).toBe("a_payer"); // la projection suivra, pas d'écriture directe
    expect(m.alerterEquipe.mock.calls[0][1].lien).toEqual({ chemin: "/dossiers/77", libelle: "Ouvrir le dossier" });
  });

  it("CRM injoignable : la session repasse « ouverte » (le prestataire rejouera), aucun e-mail", async () => {
    depot.t.dossiers[0].crm_dossier_id = 77;
    depot.t.factures[0].crm_facture_id = 501;
    m.facturePayeeCrm.mockRejectedValue(new Error("CRM injoignable"));
    const r = await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi_crm" });
    expect(r).toEqual({ ok: false, message: "Paiement non inscrit au CRM : CRM injoignable." });
    expect(session("se-1")).toMatchObject({ statut: "ouverte", reference: null });
    expect(m.envoyer).not.toHaveBeenCalled();
  });

  it("dossier relié mais facture sans pendant au CRM : refusé, session rouverte", async () => {
    depot.t.dossiers[0].crm_dossier_id = 77;
    const r = await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi" });
    expect(r).toEqual({ ok: false, message: "Paiement non inscrit au CRM : Facture du CRM introuvable.." });
    expect(session("se-1").statut).toBe("ouverte");
  });

  it("dossier introuvable : refusé", async () => {
    depot.t.dossiers = [];
    expect(await appliquerEvenement({ type: "paiement.reussi", session_id: "se-1", reference: "pi" })).toEqual({ ok: false, message: "Dossier introuvable." });
  });
});

// --- stripe.ts -----------------------------------------------------------------------------------------

const demandeArrhes = { cible: "devis_arrhes" as const, cible_id: "dv-1", dossier_id: "do-1", montant: 1234.56, libelle: "Arrhes 30 %", trace: null, reference: "BD-2026-0147", email: "claire@gmail.com" };

describe("espace-client/stripe — paramètres de Checkout (purs)", () => {
  it("centimes : arrondi au centime le plus proche", () => {
    expect(centimes(1250.5)).toBe(125050);
    expect(centimes(0.1 + 0.2)).toBe(30);
    expect(centimes(19.99)).toBe(1999);
    expect(centimes(0)).toBe(0);
  });

  it("la clé d'idempotence d'une session", () => {
    expect(cleCheckout("se-1")).toBe("bailly-ec-checkout-se-1");
  });

  it("paiement unique en euros, montant de la base, métadonnées et retours, expiration à une heure", () => {
    const p = parametresCheckout(demandeArrhes, "se-2", "https://espace.bailly.fr", Date.parse("2026-11-15T10:00:00.500Z"));
    expect(p).toMatchObject({
      mode: "payment",
      client_reference_id: "se-2",
      customer_email: "claire@gmail.com",
      locale: "fr",
      success_url: "https://espace.bailly.fr/espace-client/paiement/se-2/retour?issue=succes",
      cancel_url: "https://espace.bailly.fr/espace-client/paiement/se-2/retour?issue=annulation",
      expires_at: Date.parse("2026-11-15T11:00:00.000Z") / 1000,
    });
    expect(p.line_items).toEqual([{ quantity: 1, price_data: { currency: "eur", unit_amount: 123456, product_data: { name: "Arrhes 30 %", description: "Dossier BD-2026-0147" } } }]);
    const meta = { session_paiement_id: "se-2", dossier: "BD-2026-0147", cible: "devis_arrhes", cible_id: "dv-1", cle_idempotence: "bailly-ec-checkout-se-2" };
    expect(p.metadata).toEqual(meta);
    expect(p.payment_intent_data).toEqual({ description: "Arrhes 30 % · dossier BD-2026-0147", metadata: meta });
  });

  it("la création chez Stripe porte la clé d'idempotence", async () => {
    const create = vi.fn(async () => ({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }));
    await creerCheckout({ checkout: { sessions: { create } } } as never, demandeArrhes, "se-2", "https://espace.bailly.fr");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ client_reference_id: "se-2" }), { idempotencyKey: "bailly-ec-checkout-se-2" });
  });

  it("le prestataire : Stripe avec les deux clés, la simulation sinon", () => {
    expect(prestataire().nom).toBe("simule");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect(prestataire().nom).toBe("simule");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    expect(prestataire().nom).toBe("stripe");
  });
});

describe("espace-client/stripe — le webhook signé", () => {
  const SECRET = "whsec_test_bailly";
  let evenementsDeja: { traite_le: string | null } | null;
  let ligne: Record<string, unknown> | null;
  let base: ReturnType<typeof fausseBase>;

  const signerStripe = (corps: string, secret = SECRET, timestamp?: number) => new Stripe("sk_test_signature").webhooks.generateTestHeaderString({ payload: corps, secret, timestamp });
  const checkout = (champs: Record<string, unknown> = {}) => ({
    id: "cs_test_1", object: "checkout.session", metadata: { session_paiement_id: "se-1" }, client_reference_id: "se-1",
    amount_total: 125050, currency: "eur", payment_status: "paid", payment_intent: "pi_123", status: "complete", ...champs,
  });
  const evenement = (type: string, objet: unknown, id = "evt_1") => JSON.stringify({ id, object: "event", type, data: { object: objet } });

  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    evenementsDeja = null;
    ligne = { session_paiement_id: "se-1", checkout_id: "cs_test_1", statut: "ouverte", montant_centimes: 125050 };
    base = fausseBase((r: Requete) => {
      if (r.table === "ec_evenements_stripe" && r.action === "upsert") return { data: evenementsDeja ? [] : [{ id: "evt_1" }] };
      if (r.table === "ec_evenements_stripe" && r.action === "select") return { data: evenementsDeja };
      if (r.table === "ec_paiements_stripe" && r.action === "select") return { data: ligne };
      return { data: null };
    });
    m.client = base.client;
  });

  it("Stripe non réglé : 404, rien n'est lu", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const corps = evenement("checkout.session.completed", checkout());
    expect(await traiterWebhookStripe(corps, signerStripe(corps))).toEqual({ statut: 404, message: "Introuvable." });
    expect(base.requetes).toHaveLength(0);
  });

  it("sans signature : 400", async () => {
    expect(await traiterWebhookStripe(evenement("checkout.session.completed", checkout()), null)).toEqual({ statut: 400, message: "Signature absente." });
  });

  it("signature d'un autre secret, corps modifié, signature périmée (> 5 min) : 400, rien n'est fait", async () => {
    const corps = evenement("checkout.session.completed", checkout());
    expect((await traiterWebhookStripe(corps, signerStripe(corps, "whsec_pirate"))).statut).toBe(400);
    expect((await traiterWebhookStripe(corps.replace("125050", "1"), signerStripe(corps))).statut).toBe(400);
    const ancien = Math.floor(Date.now() / 1000) - 10 * 60;
    expect((await traiterWebhookStripe(corps, signerStripe(corps, SECRET, ancien))).statut).toBe(400);
    expect((await traiterWebhookStripe(corps, "t=1,v1=deadbeef")).statut).toBe(400);
    expect(base.requetes).toHaveLength(0);
    expect(session("se-1").statut).toBe("ouverte");
  });

  it("paiement réglé, montant juste : appliqué, la ligne Stripe passe « payee », l'issue est notée", async () => {
    const corps = evenement("checkout.session.completed", checkout());
    expect(await traiterWebhookStripe(corps, signerStripe(corps))).toEqual({ statut: 200, message: "Paiement enregistré." });
    expect(session("se-1")).toMatchObject({ statut: "payee", reference: "pi_123" });
    const maj = base.de("ec_paiements_stripe", "update")[0];
    expect(maj.charge).toMatchObject({ statut: "payee", payment_intent: "pi_123" });
    const issue = base.de("ec_evenements_stripe", "update")[0];
    expect(issue.charge).toMatchObject({ resultat: "Paiement enregistré." });
    expect(filtre(issue, "eq", "id")).toBe("evt_1");
  });

  it("événement déjà traité : 200 « Déjà traité. », rien ne se refait", async () => {
    evenementsDeja = { traite_le: "2026-11-15T09:00:00Z" };
    const corps = evenement("checkout.session.completed", checkout());
    expect(await traiterWebhookStripe(corps, signerStripe(corps))).toEqual({ statut: 200, message: "Déjà traité." });
    expect(session("se-1").statut).toBe("ouverte");
    expect(m.envoyer).not.toHaveBeenCalled();
  });

  it("montant ou devise inattendus : non inscrit, noté au CRM, 200 (Stripe ne rejoue pas)", async () => {
    for (const champs of [{ amount_total: 100 }, { currency: "usd" }, { amount_total: null }]) {
      m.noterDansLeCrm.mockClear();
      const corps = evenement("checkout.session.completed", checkout(champs));
      const r = await traiterWebhookStripe(corps, signerStripe(corps));
      expect(r, JSON.stringify(champs)).toEqual({ statut: 200, message: "Montant inattendu : paiement non inscrit, à vérifier." });
      expect(m.noterDansLeCrm).toHaveBeenCalledTimes(1);
      expect(session("se-1").statut).toBe("ouverte");
    }
  });

  it("paiement différé pas encore réglé : « en attente », sans rien appliquer", async () => {
    const corps = evenement("checkout.session.completed", checkout({ payment_status: "unpaid" }));
    expect(await traiterWebhookStripe(corps, signerStripe(corps))).toEqual({ statut: 200, message: "Paiement en attente de confirmation par la banque." });
    expect(session("se-1").statut).toBe("ouverte");
    expect(base.de("ec_paiements_stripe", "update")[0].charge).toMatchObject({ statut: "en_attente" });
  });

  it("session Checkout qui n'est pas celle de ce paiement : ignorée", async () => {
    ligne = { ...ligne!, checkout_id: "cs_autre" };
    const corps = evenement("checkout.session.completed", checkout());
    expect(await traiterWebhookStripe(corps, signerStripe(corps))).toMatchObject({ statut: 200, message: "Session Checkout qui n'est pas celle de ce paiement : ignorée." });
    expect(session("se-1").statut).toBe("ouverte");
  });

  it("session Checkout étrangère à l'espace (sans métadonnées) : ignorée", async () => {
    const corps = evenement("checkout.session.completed", checkout({ metadata: {}, client_reference_id: null }));
    expect((await traiterWebhookStripe(corps, signerStripe(corps))).message).toBe("Session Checkout étrangère à l'espace client : ignorée.");
  });

  it("expirée ou paiement différé échoué : la session est close", async () => {
    const corps = evenement("checkout.session.expired", checkout({ status: "expired", payment_status: "unpaid" }));
    expect(await traiterWebhookStripe(corps, signerStripe(corps))).toEqual({ statut: 200, message: "Paiement annulé." });
    expect(session("se-1").statut).toBe("annulee");
    expect(base.de("ec_paiements_stripe", "update")[0].charge).toMatchObject({ statut: "expiree" });
  });

  it("un type d'événement sans objet ici : 200, rien à faire", async () => {
    const corps = evenement("payment_intent.created", { id: "pi_1", object: "payment_intent" });
    expect(await traiterWebhookStripe(corps, signerStripe(corps))).toEqual({ statut: 200, message: "Événement payment_intent.created : rien à faire." });
  });

  it("base injoignable : 500, Stripe rejouera", async () => {
    m.client = fausseBase(() => ({ error: { message: "connection refused" } })).client;
    const corps = evenement("checkout.session.completed", checkout());
    expect(await traiterWebhookStripe(corps, signerStripe(corps))).toEqual({ statut: 500, message: "Traitement impossible pour l'instant : Stripe rejouera l'événement." });
  });

  it("CRM injoignable : 500 et « À rejouer » au journal des webhooks", async () => {
    depot.t.dossiers[0].crm_dossier_id = 77;
    depot.t.factures[0].crm_facture_id = 501;
    m.facturePayeeCrm.mockRejectedValue(new Error("CRM injoignable"));
    const corps = evenement("checkout.session.completed", checkout());
    expect((await traiterWebhookStripe(corps, signerStripe(corps))).statut).toBe(500);
    expect(base.de("ec_evenements_stripe", "update")[0].charge).toEqual({ resultat: "À rejouer : Paiement non inscrit au CRM : CRM injoignable." });
  });

  it("traiterCheckout seul : la même vérification du montant", async () => {
    const r = await traiterCheckout(checkout({ amount_total: 125049 }) as never);
    expect(r.message).toBe("Montant inattendu : paiement non inscrit, à vérifier.");
  });
});
