import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInterdit } from "./_outils";

/*
 * Le notificateur de l'espace client : tout message laisse une ligne au
 * journal de l'espace (ec_notifications) et part — ou non — par le module
 * d'envoi de la plateforme (simulé ici).
 */

const m = vi.hoisted(() => ({
  envoyerEmail: vi.fn(),
  envoyerSms: vi.fn(),
  trouver: vi.fn(),
  inserer: vi.fn(),
  textes: new Map<string, { canal: "email" | "sms"; objet: string | null; corps: string; actif: boolean }>(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/envois", () => ({ envoyerEmail: m.envoyerEmail, envoyerSms: m.envoyerSms }));
vi.mock("@/lib/espace-client/depot", () => ({
  depot: () => ({ trouver: m.trouver, inserer: m.inserer }),
  nouvelId: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  maintenant: () => "2026-11-15T10:00:00.000Z",
}));
vi.mock("@/lib/espace-client/catalogue-textes", () => ({
  textesEspace: async () => m.textes,
  cleCatalogue: (modele: string, canal: "email" | "sms") => `ec_${modele}${canal === "sms" ? "_sms" : ""}`,
}));

import { notifier, type MessageSortant } from "@/lib/espace-client/notifier";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const resultat = (champs: Record<string, unknown> = {}) => ({ statut: "envoye", motif: null, brevoId: "<b>", cle: `ec:${ID}`, doublon: false, journalId: "j", bacASable: false, ...champs });

const msg = (champs: Partial<MessageSortant> = {}): MessageSortant => ({
  dossier_id: "do-1", canal: "email", modele: "document_depose", destinataire: "claire@gmail.com",
  payload: { salutation: "Madame Dumont", document: "Attestation", chemin: "/espace-client/BD-2026-0147/documents" }, ...champs,
});

let clientDemo: boolean;
const journal = () => m.inserer.mock.calls.map((c) => c[1] as Record<string, unknown>);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchInterdit());
  vi.stubEnv("ESPACE_CLIENT_URL", "https://espace.bailly.fr");
  vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
  clientDemo = false;
  m.textes.clear();
  m.trouver.mockReset().mockImplementation(async (table: string, id: string) =>
    table === "dossiers" ? { id, client_id: "cl-1", reference: "BD-2026-0147" } : table === "clients" ? { id, demo: clientDemo } : null,
  );
  m.inserer.mockReset().mockResolvedValue(undefined);
  m.envoyerEmail.mockReset().mockResolvedValue(resultat());
  m.envoyerSms.mockReset().mockResolvedValue(resultat());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("espace-client/notifier — démonstration en mémoire", () => {
  it("rien ne part : aucun appel au module d'envoi, une ligne « journalisee »", async () => {
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
    const n = await notifier.envoyer(msg());
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    expect(m.envoyerSms).not.toHaveBeenCalled();
    expect(n).toMatchObject({ statut: "journalisee", erreur: "Démonstration en mémoire : rien ne part." });
    expect(journal()).toHaveLength(1);
  });

  it("de même pour un SMS", async () => {
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
    await notifier.envoyer(msg({ canal: "sms", payload: { texte: "x" } }));
    expect(m.envoyerSms).not.toHaveBeenCalled();
  });
});

describe("espace-client/notifier — le passage par le module d'envoi", () => {
  it("un e-mail : rendu, clé « ec:<id> », origine espace_client, référence du dossier, ligne du journal", async () => {
    await notifier.envoyer(msg());
    expect(m.envoyerEmail).toHaveBeenCalledTimes(1);
    const e = m.envoyerEmail.mock.calls[0][0];
    expect(e).toMatchObject({ cle: `ec:${ID}`, origine: "espace_client", modele: "document_depose", reference: "BD-2026-0147", fictif: false, notificationId: ID, retenu: null, a: "claire@gmail.com" });
    expect(e.sujet).toBe("Un nouveau document a été déposé dans votre espace client");
    expect(e.html).toContain('href="https://espace.bailly.fr/espace-client/BD-2026-0147/documents"');
    expect(e.texte).toContain("Attestation");
  });

  it("la clé et l'origine de l'appelant sont reprises (tâche de la veille)", async () => {
    await notifier.envoyer(msg(), { cle: "veille:cartons:do-1:2026-11-21", origine: "veille" });
    expect(m.envoyerEmail.mock.calls[0][0]).toMatchObject({ cle: "veille:cartons:do-1:2026-11-21", origine: "veille" });
  });

  it("un client de démonstration : « fictif » transmis (rien ne part, même avec l'envoi actif)", async () => {
    clientDemo = true;
    await notifier.envoyer(msg());
    expect(m.envoyerEmail.mock.calls[0][0].fictif).toBe(true);
  });

  it("un dossier qui ne se relit pas est tenu pour fictif", async () => {
    m.trouver.mockRejectedValue(new Error("base injoignable"));
    await notifier.envoyer(msg());
    expect(m.envoyerEmail.mock.calls[0][0]).toMatchObject({ fictif: true, reference: null });
  });

  it("un dossier introuvable : pas de référence, pas fictif (la règle du module d'envoi décide)", async () => {
    m.trouver.mockResolvedValue(null);
    await notifier.envoyer(msg());
    expect(m.envoyerEmail.mock.calls[0][0]).toMatchObject({ fictif: false, reference: null });
  });

  it("sans dossier (un message à l'équipe) : ni référence ni lecture", async () => {
    await notifier.envoyer(msg({ dossier_id: null }));
    expect(m.trouver).not.toHaveBeenCalled();
    expect(m.envoyerEmail.mock.calls[0][0]).toMatchObject({ fictif: false, reference: null });
  });

  it("les pièces jointes partent avec l'e-mail, sans entrer au journal", async () => {
    await notifier.envoyer(msg({ modele: "recap_cartons_equipe", payload: { jour: "samedi", lignes: [], total: 0, chemin: "/dashboard/x" } }), { piecesJointes: [{ nom: "bons.pdf", base64: "JVBERi0=" }] });
    expect(m.envoyerEmail.mock.calls[0][0].piecesJointes).toEqual([{ nom: "bons.pdf", base64: "JVBERi0=" }]);
    expect(JSON.stringify(journal())).not.toContain("JVBERi0=");
  });

  it("un SMS : le texte du payload, au numéro donné", async () => {
    await notifier.envoyer(msg({ canal: "sms", modele: "rappel_visite", destinataire: "06 12 34 56 78", payload: { texte: "Rappel : visite demain à 9 h." } }));
    expect(m.envoyerSms).toHaveBeenCalledWith(expect.objectContaining({ a: "06 12 34 56 78", texte: "Rappel : visite demain à 9 h.", cle: `ec:${ID}` }));
    expect(m.envoyerEmail).not.toHaveBeenCalled();
  });

  it("un destinataire multiple ou vide est transmis tel quel : c'est le module d'envoi qui le refuse", async () => {
    m.envoyerEmail.mockResolvedValue(resultat({ statut: "echec", motif: "Adresse e-mail invalide." }));
    const n = await notifier.envoyer(msg({ destinataire: "a@b.fr, c@d.fr" }));
    expect(m.envoyerEmail.mock.calls[0][0].a).toBe("a@b.fr, c@d.fr");
    expect(n).toMatchObject({ statut: "echec", erreur: "Adresse e-mail invalide." });
  });
});

describe("espace-client/notifier — « Courriers et SMS »", () => {
  it("un message désactivé dans le catalogue est retenu : journalisé, rien ne part", async () => {
    m.textes.set("ec_document_depose", { canal: "email", objet: null, corps: "", actif: false });
    await notifier.envoyer(msg());
    expect(m.envoyerEmail.mock.calls[0][0].retenu).toBe("Message désactivé dans « Courriers et SMS » : journalisé, rien n'est parti.");
  });

  it("le lien d'accès ne se désactive jamais (sans lui, le client ne peut pas entrer)", async () => {
    m.textes.set("ec_acces", { canal: "email", objet: null, corps: "", actif: false });
    await notifier.envoyer(msg({ modele: "acces", payload: { salutation: "S", duree: 15, lien: "https://x/connexion" } }));
    expect(m.envoyerEmail.mock.calls[0][0].retenu).toBeNull();
  });

  it("une raison donnée par l'appelant l'emporte sur le catalogue", async () => {
    m.textes.set("ec_demande_avis", { canal: "email", objet: null, corps: "", actif: false });
    await notifier.envoyer(msg({ modele: "demande_avis", payload: { salutation: "S", trajet: "x" } }), { retenu: "Pas de lien de dépôt d'avis." });
    expect(m.envoyerEmail.mock.calls[0][0].retenu).toBe("Pas de lien de dépôt d'avis.");
  });

  it("le texte réglé de l'e-mail remplace celui de départ", async () => {
    m.textes.set("ec_document_depose", { canal: "email", objet: "Nouveau : {document}", corps: "Voici {document}.", actif: true });
    await notifier.envoyer(msg());
    const e = m.envoyerEmail.mock.calls[0][0];
    expect(e.sujet).toBe("Nouveau : Attestation");
    expect(e.html).toContain("Voici <b>Attestation</b>.");
  });

  it("le texte réglé du SMS des cartons remplace celui de départ ; un SMS sans texte de départ garde le sien", async () => {
    m.textes.set("ec_creneau_cartons_sms", { canal: "sms", objet: null, corps: "Cartons demain {debut}-{fin}", actif: true });
    await notifier.envoyer(msg({ canal: "sms", modele: "creneau_cartons", destinataire: "0612345678", payload: { texte: "ancien", debut: "9 h", fin: "11 h" } }));
    expect(m.envoyerSms.mock.calls[0][0].texte).toBe("Cartons demain 9 h-11 h");
    m.textes.set("ec_rappel_visite_sms", { canal: "sms", objet: null, corps: "Autre {x}", actif: true });
    await notifier.envoyer(msg({ canal: "sms", modele: "rappel_visite", destinataire: "0612345678", payload: { texte: "le sien" } }));
    expect(m.envoyerSms.mock.calls[1][0].texte).toBe("le sien");
  });
});

describe("espace-client/notifier — le journal de l'espace", () => {
  const cas: [Record<string, unknown>, string, string | null][] = [
    [{ statut: "envoye" }, "envoyee", null],
    [{ statut: "journalise", motif: "Envoi désactivé" }, "journalisee", "Envoi désactivé"],
    [{ statut: "bloque", motif: "Recette" }, "journalisee", "Recette"],
    [{ statut: "fictif", motif: "Fictif" }, "journalisee", "Fictif"],
    [{ statut: "bac_a_sable", motif: "Sable" }, "journalisee", "Sable"],
    [{ statut: "echec", motif: "Brevo 400" }, "echec", "Brevo 400"],
    [{ statut: "incertain", motif: "Brevo 500" }, "echec", "Brevo 500"],
  ];
  for (const [r, statut, erreur] of cas) {
    it(`module d'envoi « ${r.statut} » → journal « ${statut} »`, async () => {
      m.envoyerEmail.mockResolvedValue(resultat(r));
      const n = await notifier.envoyer(msg());
      expect(n).toMatchObject({ id: ID, statut, erreur, sujet: "Un nouveau document a été déposé dans votre espace client", sent_at: "2026-11-15T10:00:00.000Z" });
      expect(journal()[0]).toMatchObject({ statut, erreur });
    });
  }

  it("un doublon (clé déjà prise) n'écrit pas de seconde ligne", async () => {
    m.envoyerEmail.mockResolvedValue(resultat({ statut: "envoye", doublon: true, cle: "veille:x" }));
    const n = await notifier.envoyer(msg(), { cle: "veille:x" });
    expect(n).toMatchObject({ doublon: true, statut: "envoyee", erreur: "Déjà traité (clé veille:x)." });
    expect(m.inserer).not.toHaveBeenCalled();
  });

  it("ce qui est confidentiel part dans l'e-mail mais n'est gardé dans aucun journal", async () => {
    const lien = "https://espace.bailly.fr/espace-client/connexion?jeton=SECRET-DU-CLIENT";
    await notifier.envoyer(msg({ modele: "acces", payload: { salutation: "S", duree: 15, lien, reference: "BD-1" } }), { confidentiel: { lien: "(lien personnel, non conservé)" } });
    expect(m.envoyerEmail.mock.calls[0][0].html).toContain("SECRET-DU-CLIENT");
    const ligne = journal()[0];
    expect(ligne.payload).toMatchObject({ lien: "(lien personnel, non conservé)", confidentiel: true });
    expect(JSON.stringify(ligne)).not.toContain("SECRET-DU-CLIENT");
  });

  it("un objet confidentiel vide ne marque rien", async () => {
    await notifier.envoyer(msg(), { confidentiel: {} });
    expect(journal()[0].payload).not.toHaveProperty("confidentiel");
  });
});
