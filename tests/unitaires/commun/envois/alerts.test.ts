import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fausseBase, fetchInterdit, filtre, type Requete } from "./_outils";

/*
 * fireEvent (lib/alerts.ts) : les règles des questionnaires, et surtout qui
 * est « plafonne » — seulement les messages automatiques vers le client.
 * Le module d'envoi est simulé : on lit ce qui lui est demandé.
 */

const m = vi.hoisted(() => ({
  client: null as unknown,
  envoyerEmail: vi.fn(),
  envoyerSms: vi.fn(),
  getSettings: vi.fn(),
  estimation: vi.fn(),
  espace: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.client }));
vi.mock("@/lib/envois", () => ({ envoyerEmail: m.envoyerEmail, envoyerSms: m.envoyerSms }));
vi.mock("@/lib/settings", () => ({ getSettings: m.getSettings }));
vi.mock("@/lib/estimation-pdf", () => ({ estimationDeLaDemande: m.estimation }));
vi.mock("@/lib/espace-demande", () => ({ espaceDUneDemande: m.espace }));
vi.mock("@/lib/espaces-pro", () => ({ urlLogoPublique: () => null }));

import { fireEvent } from "@/lib/alerts";

const resultat = (champs: Record<string, unknown> = {}) => ({ statut: "envoye", motif: null, brevoId: "<b>", cle: "k", doublon: false, journalId: "j", bacASable: false, ...champs });

const modele = (champs: Record<string, unknown> = {}) => ({
  id: "t1", name: "Accusé", channel: "email", event: "demande_recue", sujet: "Votre demande, {{client_nom}}", contenu: "Bonjour {{client_nom}},\n\nMerci.", options: null, active: true, ...champs,
});
const regle = (champs: Record<string, unknown> = {}) => ({
  id: "a1", name: "Accusé client", kind: "workflow", event: "demande_recue", montant_min: null, channel: "email", destinataire: "client", destinataire_custom: null,
  template_id: "t1", condition_champ: null, condition_source: null, active: true, template: modele(), ...champs,
});

let regles: ReturnType<typeof regle>[];
let dejaEnvoye: unknown[];
let base: ReturnType<typeof fausseBase>;

function brancher() {
  base = fausseBase((r: Requete) => {
    if (r.table === "alerts" && r.action === "select") return { data: regles };
    if (r.table === "emails" && r.action === "select") return { data: dejaEnvoye };
    return { data: null };
  });
  m.client = base.client;
}

const ctx = { request_id: "req-1", client_nom: "Claire Dumont", client_email: "claire@gmail.com", client_tel: "06 12 34 56 78", source: "form" };
const historique = () => base.de("request_events", "insert").map((r) => r.charge as { payload: Record<string, unknown> });
const journalEmails = () => base.de("emails", "insert").map((r) => r.charge as Record<string, unknown>);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchInterdit());
  regles = [regle()];
  dejaEnvoye = [];
  brancher();
  m.envoyerEmail.mockReset().mockResolvedValue(resultat());
  m.envoyerSms.mockReset().mockResolvedValue(resultat());
  m.getSettings.mockReset().mockResolvedValue({ entreprise_nom: "Bailly Déménagement", entreprise_email: "contact@bailly.fr", entreprise_tel: null, sms_sender: "Bailly", base_url: "https://devis.bailly.fr/" });
  m.estimation.mockReset().mockResolvedValue(null);
  m.espace.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("alerts — qui est plafonné", () => {
  it("un événement automatique vers le client est plafonné, avec la clé « questionnaires:<événement>:<règle>:<demande> »", async () => {
    await fireEvent("demande_recue", ctx);
    expect(m.envoyerEmail).toHaveBeenCalledTimes(1);
    expect(m.envoyerEmail.mock.calls[0][0]).toMatchObject({
      cle: "questionnaires:demande_recue:a1:req-1",
      origine: "questionnaires",
      plafonne: true,
      suivi: true,
      a: "claire@gmail.com",
      modele: "Alerte : Accusé client",
      reference: "req-1",
      expediteur: { nom: "Bailly Déménagement", email: "contact@bailly.fr" },
    });
  });

  for (const event of ["demande_recue", "demande_complete", "demande_incomplete", "demande_completee", "devis_cree"]) {
    it(`« ${event} » vers le client : plafonné`, async () => {
      regles = [regle({ event })];
      await fireEvent(event, ctx);
      expect(m.envoyerEmail.mock.calls[0][0].plafonne).toBe(true);
    });
  }

  for (const event of ["devis_envoye", "devis_accepte", "devis_refuse", "manual"]) {
    it(`« ${event} » (geste de l'équipe) vers le client : non plafonné, clé unique`, async () => {
      regles = [regle({ event })];
      await fireEvent(event, ctx);
      const e = m.envoyerEmail.mock.calls[0][0];
      expect(e.plafonne).toBe(false);
      expect(e.cle).toBeNull();
    });
  }

  it("une alerte vers une adresse de l'équipe n'est jamais plafonnée, ni suivie", async () => {
    regles = [regle({ destinataire: "custom", destinataire_custom: "equipe@bailly.fr" })];
    await fireEvent("demande_recue", ctx);
    const e = m.envoyerEmail.mock.calls[0][0];
    expect(e).toMatchObject({ a: "equipe@bailly.fr", plafonne: false, suivi: false });
  });

  it("le SMS automatique au client est plafonné, au numéro du client, avec l'expéditeur des réglages", async () => {
    regles = [regle({ channel: "sms", template: modele({ channel: "sms", contenu: "Bailly : demande reçue, {{client_nom}}." }) })];
    await fireEvent("demande_recue", ctx);
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    expect(m.envoyerSms).toHaveBeenCalledWith({
      cle: "questionnaires:demande_recue:a1:req-1", origine: "questionnaires", plafonne: true, modele: "Alerte : Accusé client", reference: "req-1",
      a: "06 12 34 56 78", texte: "Bailly : demande reçue, Claire Dumont.", expediteur: "Bailly",
    });
  });

  it("la référence du message est celle de l'estimation quand elle est donnée", async () => {
    await fireEvent("demande_recue", { ...ctx, reference: "EST-2026-0007" });
    expect(m.envoyerEmail.mock.calls[0][0].reference).toBe("EST-2026-0007");
  });

  // Un message plafonné sans demande reçoit une clé « questionnaires:… » : sans elle, le plafond ne le comptait pas.
  it("un message plafonné sans demande porte une clé « questionnaires:… », pour être compté par les plafonds", async () => {
    await fireEvent("demande_recue", { ...ctx, request_id: undefined });
    const e = m.envoyerEmail.mock.calls[0][0];
    expect(e.plafonne).toBe(true);
    expect(String(e.cle ?? "")).toMatch(/^questionnaires:/);
  });
});

describe("alerts — conditions des règles", () => {
  it("montant minimum : en dessous, rien ne part", async () => {
    regles = [regle({ montant_min: 1000 })];
    await fireEvent("demande_recue", { ...ctx, montant_ttc: 999.99 });
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    await fireEvent("demande_recue", { ...ctx, montant_ttc: 1000 });
    expect(m.envoyerEmail).toHaveBeenCalledTimes(1);
  });

  it("champ manquant : ne part que si le champ manque", async () => {
    regles = [regle({ condition_champ: "volume" })];
    await fireEvent("demande_recue", { ...ctx, manque_volume: false });
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    await fireEvent("demande_recue", { ...ctx, manque_volume: true });
    expect(m.envoyerEmail).toHaveBeenCalledTimes(1);
  });

  it("source : ne part que pour la source demandée", async () => {
    regles = [regle({ condition_source: "email" })];
    await fireEvent("demande_recue", { ...ctx, source: "form" });
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    await fireEvent("demande_recue", { ...ctx, source: "email" });
    expect(m.envoyerEmail).toHaveBeenCalledTimes(1);
  });

  it("sans règle active pour l'événement : rien", async () => {
    regles = [];
    await fireEvent("demande_recue", ctx);
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    expect(base.de("alerts")[0].filtres).toContainEqual(["eq", "active", true]);
  });
});

describe("alerts — envoi impossible : la raison sur la fiche", () => {
  it("sans modèle : rien ne part, la raison est tracée", async () => {
    regles = [regle({ template: null })];
    await fireEvent("demande_recue", ctx);
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    expect(historique()[0].payload).toMatchObject({ status: "ignore", erreur: "aucun template associé à la règle" });
  });

  it("sans e-mail du client : « email du client manquant »", async () => {
    await fireEvent("demande_recue", { ...ctx, client_email: undefined });
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    expect(historique()[0].payload).toMatchObject({ status: "ignore", erreur: "email du client manquant", to: null });
  });

  it("sans numéro du client : « numéro de téléphone du client manquant »", async () => {
    regles = [regle({ channel: "sms", template: modele({ channel: "sms" }) })];
    await fireEvent("demande_recue", { ...ctx, client_tel: undefined });
    expect(m.envoyerSms).not.toHaveBeenCalled();
    expect(historique()[0].payload.erreur).toBe("numéro de téléphone du client manquant");
  });

  it("sans demande, aucune trace n'est écrite", async () => {
    await fireEvent("demande_recue", { ...ctx, request_id: undefined, client_email: undefined });
    expect(historique()).toHaveLength(0);
  });

  it("un espace qui n'envoie pas l'estimation tait « devis_cree »", async () => {
    regles = [regle({ event: "devis_cree" })];
    m.espace.mockResolvedValue({ retenu: { envoyer_devis: false, nom: "Carrefour", slug: "carrefour" }, config: null });
    await fireEvent("devis_cree", ctx);
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    expect(historique()[0].payload.erreur).toBe("l'espace Carrefour n'envoie pas l'estimation au client");
  });
});

describe("alerts — garde-fou anti-doublon de deux minutes", () => {
  it("le même modèle déjà envoyé au même destinataire il y a moins de deux minutes : écarté", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00.000Z"));
    dejaEnvoye = [{ id: "e1" }];
    await fireEvent("demande_recue", ctx);
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    const [q] = base.de("emails", "select");
    expect(filtre(q, "eq", "destinataire")).toBe("claire@gmail.com");
    expect(filtre(q, "eq", "sujet")).toBe("Votre demande, Claire Dumont");
    expect(filtre(q, "eq", "status")).toBe("envoye");
    expect(filtre(q, "gte", "created_at")).toBe("2026-11-15T09:58:00.000Z");
    expect(historique()[0].payload.erreur).toBe("déjà envoyé à l'instant — doublon écarté");
    vi.useRealTimers();
  });
});

describe("alerts — statut inscrit dans les journaux des questionnaires", () => {
  const cas: [Record<string, unknown>, string, string, string | null][] = [
    [{ statut: "envoye" }, "envoye", "envoye", null],
    [{ statut: "envoye", doublon: true }, "envoye", "envoye", "déjà envoyé (même clé)"],
    [{ statut: "journalise", motif: "Envoi désactivé (ENVOI_MODE) : journalisé, rien n'est parti." }, "brouillon", "ignore", "Envoi désactivé (ENVOI_MODE) : journalisé, rien n'est parti."],
    [{ statut: "bloque", motif: "Plafond par destinataire atteint (6 en 24 heures) : rien n'est parti." }, "brouillon", "ignore", "Plafond par destinataire atteint (6 en 24 heures) : rien n'est parti."],
    [{ statut: "fictif", motif: "fictif" }, "brouillon", "ignore", "fictif"],
    [{ statut: "bac_a_sable", motif: "sable" }, "brouillon", "ignore", "sable"],
    [{ statut: "journalise", motif: "m", doublon: true }, "brouillon", "ignore", "déjà traité : m"],
    [{ statut: "echec", motif: "Brevo 400" }, "echec", "echec", "Brevo 400"],
    [{ statut: "incertain", motif: "Brevo 500" }, "echec", "echec", "Brevo 500"],
  ];
  for (const [r, emails, hist, erreur] of cas) {
    it(`${JSON.stringify(r)} → emails « ${emails} », historique « ${hist} »`, async () => {
      m.envoyerEmail.mockResolvedValue(resultat(r));
      await fireEvent("demande_recue", ctx);
      expect(journalEmails()[0]).toMatchObject({ destinataire: "claire@gmail.com", status: emails, erreur, template: "Alerte : Accusé client" });
      expect(historique().at(-1)!.payload).toMatchObject({ status: hist, erreur });
    });
  }

  it("une erreur de préparation du message : « echec », et fireEvent ne lève pas", async () => {
    m.envoyerEmail.mockRejectedValue(new Error("PDF illisible"));
    await expect(fireEvent("demande_recue", ctx)).resolves.toBeUndefined();
    expect(journalEmails()[0]).toMatchObject({ status: "echec", erreur: "PDF illisible" });
  });

  it("une base injoignable ne fait pas lever fireEvent", async () => {
    m.client = { from: () => { throw new Error("base injoignable"); } };
    await expect(fireEvent("demande_recue", ctx)).resolves.toBeUndefined();
    expect(m.envoyerEmail).not.toHaveBeenCalled();
  });
});

describe("alerts — contenus hostiles", () => {
  it("du HTML dans le nom du client est échappé dans le corps de l'e-mail", async () => {
    await fireEvent("demande_recue", { ...ctx, client_nom: '<script>alert("x")</script>' });
    const { html, sujet } = m.envoyerEmail.mock.calls[0][0];
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // L'objet est du texte : il part tel quel, c'est le transport qui l'encode en JSON.
    expect(sujet).toBe('Votre demande, <script>alert("x")</script>');
  });

  it("un destinataire « custom » multiple est passé tel quel au module d'envoi, qui le refuse", async () => {
    regles = [regle({ destinataire: "custom", destinataire_custom: "a@bailly.fr, b@bailly.fr" })];
    await fireEvent("demande_recue", ctx);
    // fireEvent ne valide pas l'adresse : c'est le rôle des garde-fous (envois/garde-fous.ts, emailValide).
    expect(m.envoyerEmail.mock.calls[0][0].a).toBe("a@bailly.fr, b@bailly.fr");
  });
});
