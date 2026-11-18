import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInterdit, laisserFiler } from "./_outils";

/*
 * Le module d'envoi, avec son journal et ses transports simulés : on regarde
 * ce qui serait parti chez Brevo (posterEmail / posterSms), chez SendGrid
 * (posterEmailSendgrid) ou chez Twilio (posterSmsTwilio), et ce qui est
 * inscrit au journal (reserver / conclure).
 *
 * Sans accès SendGrid ni Twilio (le cas de ces premiers blocs), tout passe
 * par Brevo, comme avant la bascule.
 */

const m = vi.hoisted(() => ({
  reserver: vi.fn(),
  conclure: vi.fn(),
  partisSur24h: vi.fn(),
  posterEmail: vi.fn(),
  posterSms: vi.fn(),
  posterEmailSendgrid: vi.fn(),
  posterSmsTwilio: vi.fn(),
  equiperEmail: vi.fn(),
  alerterEquipe: vi.fn(),
}));

vi.mock("@/lib/envois/journal", () => ({ reserver: m.reserver, conclure: m.conclure, partisSur24h: m.partisSur24h }));
vi.mock("@/lib/envois/brevo", () => ({ posterEmail: m.posterEmail, posterSms: m.posterSms }));
vi.mock("@/lib/envois/sendgrid", () => ({ posterEmailSendgrid: m.posterEmailSendgrid }));
vi.mock("@/lib/envois/twilio", () => ({ posterSmsTwilio: m.posterSmsTwilio }));
vi.mock("@/lib/suivi-envois", () => ({ equiperEmail: m.equiperEmail }));
vi.mock("@/lib/alertes-equipe", () => ({ alerterEquipe: m.alerterEquipe }));

import { envoyerEmail, envoyerSms, estParti, etatEnvois, libelleStatut, type EmailSortant, type SmsSortant } from "@/lib/envois";

const ligne = (champs: Record<string, unknown> = {}) => ({ id: "11111111-1111-4111-8111-111111111111", statut: "en_cours", motif: null, brevo_id: null, bac_a_sable: false, ...champs });

const email = (champs: Partial<EmailSortant> = {}): EmailSortant => ({ origine: "espace_client", a: "claire@gmail.com", sujet: "Votre espace", html: "<p>Bonjour</p>", ...champs });
const sms = (champs: Partial<SmsSortant> = {}): SmsSortant => ({ origine: "veille", a: "06 12 34 56 78", texte: "Vos cartons arrivent demain.", ...champs });

const quePartiChezBrevo = () => m.posterEmail.mock.calls.length + m.posterSms.mock.calls.length;
/** Tout ce qui est sorti de la plateforme, quel que soit le fournisseur. */
const quePartiTout = () => quePartiChezBrevo() + m.posterEmailSendgrid.mock.calls.length + m.posterSmsTwilio.mock.calls.length;
const dernierConclu = () => m.conclure.mock.calls.at(-1)?.[1];

function modeActif(extra: Record<string, string> = {}) {
  vi.stubEnv("ENVOI_MODE", "actif");
  vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchInterdit());
  m.reserver.mockReset().mockImplementation(async () => ({ reservee: true, ligne: ligne() }));
  m.conclure.mockReset().mockResolvedValue(undefined);
  m.partisSur24h.mockReset().mockResolvedValue(0);
  m.posterEmail.mockReset().mockResolvedValue({ ok: true, id: "<brevo-1>" });
  m.posterSms.mockReset().mockResolvedValue({ ok: true, id: "sms-1" });
  m.posterEmailSendgrid.mockReset().mockResolvedValue({ ok: true, id: "sg-1" });
  m.posterSmsTwilio.mockReset().mockResolvedValue({ ok: true, id: `SM${"a".repeat(32)}` });
  m.equiperEmail.mockReset().mockImplementation(async (_id: string, html: string) => `${html}<img suivi>`);
  m.alerterEquipe.mockReset().mockResolvedValue({ destinataires: 1, partis: 1 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("envois — mode désactivé : rien ne part", () => {
  it("sans ENVOI_MODE, un e-mail est journalisé et Brevo n'est pas appelé, même avec la clé", async () => {
    vi.stubEnv("ENVOI_MODE", "");
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    const r = await envoyerEmail(email());
    expect(r.statut).toBe("journalise");
    expect(r.motif).toBe("Envoi désactivé (ENVOI_MODE) : journalisé, rien n'est parti.");
    expect(quePartiChezBrevo()).toBe(0);
    expect(m.conclure).toHaveBeenCalledWith(ligne().id, { statut: "journalise", motif: r.motif, brevo_id: null, fournisseur: null });
  });

  it("un SMS est journalisé de même", async () => {
    vi.stubEnv("ENVOI_MODE", "desactive");
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    const r = await envoyerSms(sms());
    expect(r.statut).toBe("journalise");
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("une valeur inconnue de ENVOI_MODE vaut désactivé", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    for (const v of ["active", "on", "true", "1", "oui", "production", "actif!"]) {
      vi.stubEnv("ENVOI_MODE", v);
      expect((await envoyerEmail(email())).statut, v).toBe("journalise");
      expect((await envoyerSms(sms())).statut, v).toBe("journalise");
    }
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("les plafonds ne sont même pas consultés (rien ne part de toute façon)", async () => {
    await envoyerEmail(email({ plafonne: true, origine: "questionnaires" }));
    expect(m.partisSur24h).not.toHaveBeenCalled();
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("aucune alerte « envoi bloqué » n'est émise pour un message journalisé", async () => {
    await envoyerEmail(email());
    await laisserFiler();
    expect(m.alerterEquipe).not.toHaveBeenCalled();
  });

  it("le journal garde le mode et le réglage du bac à sable", async () => {
    vi.stubEnv("ENVOI_BAC_A_SABLE", "1");
    await envoyerEmail(email({ cle: "ec:abc", modele: "acces", reference: "BD-2026-0001", notificationId: "n1" }));
    expect(m.reserver).toHaveBeenCalledWith(
      expect.objectContaining({ cle: "ec:abc", canal: "email", origine: "espace_client", modele: "acces", destinataire: "claire@gmail.com", sujet: "Votre espace", apercu: null, reference: "BD-2026-0001", notification_id: "n1", mode: "desactive", bac_a_sable: true }),
    );
    expect(quePartiChezBrevo()).toBe(0);
  });
});

describe("envois — mode recette : seule la liste blanche reçoit", () => {
  beforeEach(() => {
    vi.stubEnv("ENVOI_MODE", "recette");
    vi.stubEnv("ENVOI_DESTINATAIRES_AUTORISES", "david@bailly.fr, @mindeon.ai, 06 12 34 56 78");
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
  });

  it("un destinataire de la liste reçoit, à l'adresse même qui a été vérifiée", async () => {
    const r = await envoyerEmail(email({ a: "  David@Bailly.fr " }));
    expect(r.statut).toBe("envoye");
    expect(m.posterEmail).toHaveBeenCalledTimes(1);
    expect(m.posterEmail.mock.calls[0][0].a).toBe("David@Bailly.fr");
  });

  it("un domaine autorisé reçoit, pas un sous-domaine", async () => {
    expect((await envoyerEmail(email({ a: "qui@mindeon.ai" }))).statut).toBe("envoye");
    expect((await envoyerEmail(email({ a: "qui@app.mindeon.ai" }))).statut).toBe("bloque");
    expect(m.posterEmail).toHaveBeenCalledTimes(1);
  });

  it("un numéro de la liste reçoit son SMS, quelle que soit son écriture", async () => {
    const r = await envoyerSms(sms({ a: "+33 6 12 34 56 78" }));
    expect(r.statut).toBe("envoye");
    expect(m.posterSms).toHaveBeenCalledWith({ a: "+33 6 12 34 56 78", texte: "Vos cartons arrivent demain.", expediteur: undefined });
  });

  it("un vrai client hors de la liste est bloqué : Brevo n'est pas appelé", async () => {
    const r = await envoyerEmail(email({ a: "client.reel@gmail.com" }));
    expect(r.statut).toBe("bloque");
    expect(r.motif).toBe("Recette : destinataire hors de la liste blanche (ENVOI_DESTINATAIRES_AUTORISES).");
    const s = await envoyerSms(sms({ a: "07 99 99 99 99" }));
    expect(s.statut).toBe("bloque");
    expect(quePartiChezBrevo()).toBe(0);
    expect(dernierConclu()).toMatchObject({ statut: "bloque" });
  });

  it("l'alias +étiquette d'une adresse autorisée est bloqué", async () => {
    expect((await envoyerEmail(email({ a: "david+test@bailly.fr" }))).statut).toBe("bloque");
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("un blocage prévient l'équipe (alerte « envoi_bloque »), sans jamais bloquer l'appelant", async () => {
    m.alerterEquipe.mockRejectedValue(new Error("alerte en panne"));
    const r = await envoyerEmail(email({ a: "client@gmail.com", cle: "ec:42", modele: "acces", reference: "BD-2026-0042" }));
    expect(r.statut).toBe("bloque");
    await vi.waitFor(() => expect(m.alerterEquipe).toHaveBeenCalledTimes(1));
    expect(m.alerterEquipe).toHaveBeenCalledWith("envoi_bloque", {
      evenement: "ec:42",
      reference: "BD-2026-0042",
      vars: { modele: "acces", reference: "BD-2026-0042", destinataire: "client@gmail.com", motif: r.motif },
    });
  });

  it("une alerte bloquée ne déclenche pas d'alerte (pas de boucle)", async () => {
    await envoyerEmail(email({ a: "client@gmail.com", cle: "alerte:envoi_bloque:ec:42:client@gmail.com" }));
    await laisserFiler();
    expect(m.alerterEquipe).not.toHaveBeenCalled();
  });

  it("recette sans liste blanche : tout est bloqué", async () => {
    vi.stubEnv("ENVOI_DESTINATAIRES_AUTORISES", "");
    expect((await envoyerEmail(email({ a: "david@bailly.fr" }))).statut).toBe("bloque");
    expect((await envoyerSms(sms())).statut).toBe("bloque");
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("un destinataire de la liste mais marqué démo ne reçoit rien", async () => {
    const r = await envoyerEmail(email({ a: "david@bailly.fr", fictif: true }));
    expect(r.statut).toBe("fictif");
    expect(quePartiChezBrevo()).toBe(0);
  });
});

describe("envois — aucune voie vers un destinataire réel hors « actif »", () => {
  it("matrice : mode × bac à sable × canal × destinataire × options — Brevo n'est appelé qu'en actif ou pour la liste blanche", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    vi.stubEnv("ENVOI_DESTINATAIRES_AUTORISES", "david@bailly.fr, 06 12 34 56 78");
    const destinataires = [
      { canal: "email", a: "client.reel@gmail.com", liste: false },
      { canal: "email", a: "david@bailly.fr", liste: true },
      { canal: "sms", a: "07 99 99 99 99", liste: false },
      { canal: "sms", a: "06 12 34 56 78", liste: true },
    ] as const;
    const options = [{}, { plafonne: true, origine: "questionnaires" as const }, { suivi: false }, { cle: "alerte:x:y:z" }];
    for (const mode of ["", "desactive", "inconnu", "recette", "actif"]) {
      for (const sable of ["", "1"]) {
        vi.stubEnv("ENVOI_MODE", mode);
        vi.stubEnv("ENVOI_BAC_A_SABLE", sable);
        for (const d of destinataires) {
          for (const o of options) {
            m.posterEmail.mockClear();
            m.posterSms.mockClear();
            const r = d.canal === "email" ? await envoyerEmail(email({ a: d.a, ...o })) : await envoyerSms(sms({ a: d.a, ...o }));
            const autorise = mode === "actif" || (mode === "recette" && d.liste);
            // Un SMS en bac à sable ne quitte jamais la plateforme.
            const attendu = autorise && !(sable === "1" && d.canal === "sms") ? 1 : 0;
            expect(quePartiChezBrevo(), `${mode}/${sable}/${d.a}/${JSON.stringify(o)} → ${r.statut}`).toBe(attendu);
            if (!autorise) expect(["journalise", "bloque"]).toContain(r.statut);
          }
        }
      }
    }
  });

  it("aucun appel réseau direct : seul le transport (simulé ici) parle à Brevo", async () => {
    const f = fetchInterdit();
    vi.stubGlobal("fetch", f);
    modeActif();
    await envoyerEmail(email());
    await envoyerSms(sms());
    expect(f).not.toHaveBeenCalled();
  });
});

describe("envois — destinataires fictifs et invalides", () => {
  beforeEach(() => modeActif());

  it("une adresse d'exemple n'est jamais servie, même en actif", async () => {
    for (const a of ["claire.dumont@example.com", "x@exemple.fr", "x@site.test"]) {
      expect((await envoyerEmail(email({ a }))).statut, a).toBe("fictif");
    }
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("un compte démo n'est jamais servi, même en actif (SMS compris)", async () => {
    expect((await envoyerSms(sms({ fictif: true }))).statut).toBe("fictif");
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("destinataire vide, multiple ou porteur d'un retour à la ligne : échec, rien ne part", async () => {
    for (const a of ["", "   ", "a@b.fr, c@d.fr", "a@b.fr;c@d.fr", "victime@gmail.com\r\nBcc: pirate@pirate.com", "victime@gmail.com\nCc:x@y.fr"]) {
      const r = await envoyerEmail(email({ a }));
      expect(r.statut, JSON.stringify(a)).toBe("echec");
      expect(r.motif).toBe("Adresse e-mail invalide.");
    }
    for (const a of ["", "06 12 34 56 78, 07 11 22 33 44", "123"]) {
      expect((await envoyerSms(sms({ a }))).statut, a).toBe("echec");
    }
    expect(quePartiChezBrevo()).toBe(0);
  });
});

describe("envois — mode actif et réponses de Brevo", () => {
  beforeEach(() => modeActif());

  it("un e-mail part une fois, avec l'identifiant de Brevo au journal", async () => {
    const r = await envoyerEmail(email({ texte: "Bonjour", repondreA: "conseiller@bailly.fr", piecesJointes: [{ nom: "a.pdf", base64: "AA==" }] }));
    expect(r).toMatchObject({ statut: "envoye", motif: null, idFournisseur: "<brevo-1>", fournisseur: "brevo", doublon: false, journalId: ligne().id, bacASable: false });
    expect(estParti(r)).toBe(true);
    expect(m.posterEmail).toHaveBeenCalledTimes(1);
    expect(m.posterEmail.mock.calls[0][0]).toEqual({
      a: "claire@gmail.com",
      sujet: "Votre espace",
      html: "<p>Bonjour</p><img suivi>",
      texte: "Bonjour",
      expediteur: { nom: "Bailly Déménagement", email: "no-reply@bailly.fr" },
      repondreA: "conseiller@bailly.fr",
      piecesJointes: [{ nom: "a.pdf", base64: "AA==" }],
      bacASable: false,
    });
    expect(dernierConclu()).toEqual({ statut: "envoye", motif: null, brevo_id: "<brevo-1>", fournisseur: "brevo" });
  });

  it("l'expéditeur par défaut se règle par ENVOI_EXPEDITEUR_NOM / _EMAIL, l'appelant l'emporte", async () => {
    vi.stubEnv("ENVOI_EXPEDITEUR_NOM", "Bailly Recette");
    vi.stubEnv("ENVOI_EXPEDITEUR_EMAIL", "recette@bailly.fr");
    await envoyerEmail(email());
    expect(m.posterEmail.mock.calls[0][0].expediteur).toEqual({ nom: "Bailly Recette", email: "recette@bailly.fr" });
    await envoyerEmail(email({ expediteur: { nom: "Nadia Berthier", email: null } }));
    expect(m.posterEmail.mock.calls[1][0].expediteur).toEqual({ nom: "Nadia Berthier", email: "recette@bailly.fr" });
    await envoyerEmail(email({ expediteur: { nom: "", email: "" } }));
    expect(m.posterEmail.mock.calls[2][0].expediteur).toEqual({ nom: "Bailly Recette", email: "recette@bailly.fr" });
  });

  it("Brevo refuse (4xx) : « echec », le message peut être retenté", async () => {
    m.posterEmail.mockResolvedValue({ ok: false, definitif: true, message: "Brevo 400 : invalid email" });
    const r = await envoyerEmail(email());
    expect(r).toMatchObject({ statut: "echec", motif: "Brevo 400 : invalid email", idFournisseur: null, fournisseur: "brevo" });
    expect(estParti(r)).toBe(false);
  });

  it("Brevo en 500 ou qui ne répond pas : « incertain », jamais renvoyé tout seul", async () => {
    m.posterEmail.mockResolvedValue({ ok: false, definitif: false, message: "Brevo 500 : boom" });
    const r = await envoyerEmail(email());
    expect(r.statut).toBe("incertain");
    expect(r.motif).toBe("Brevo 500 : boom — Brevo a peut-être accepté le message : il n'est pas renvoyé tout seul.");
    expect(m.posterEmail).toHaveBeenCalledTimes(1);
    m.posterSms.mockResolvedValue({ ok: false, definitif: false, message: "Brevo injoignable : timeout" });
    expect((await envoyerSms(sms())).statut).toBe("incertain");
    expect(m.posterSms).toHaveBeenCalledTimes(1);
  });

  it("sans clé Brevo : « echec », aucun appel", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const r = await envoyerEmail(email());
    expect(r).toMatchObject({ statut: "echec", motif: "Clé Brevo absente (BREVO_API_KEY) : rien n'est parti." });
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("le SMS part avec son texte et son expéditeur ; l'aperçu du journal est borné à 640 caractères", async () => {
    const texte = "é".repeat(1000);
    await envoyerSms(sms({ texte, expediteur: "Bailly" }));
    expect(m.posterSms).toHaveBeenCalledWith({ a: "06 12 34 56 78", texte, expediteur: "Bailly" });
    const nouvel = m.reserver.mock.calls[0][0];
    expect(nouvel.sujet).toBeNull();
    expect(nouvel.apercu).toHaveLength(640);
    expect(m.equiperEmail).not.toHaveBeenCalled();
  });
});

describe("envois — bac à sable", () => {
  beforeEach(() => modeActif({ ENVOI_BAC_A_SABLE: "1" }));

  it("l'e-mail part chez Brevo en bac à sable : statut « bac_a_sable », jamais « envoye »", async () => {
    const r = await envoyerEmail(email());
    expect(m.posterEmail.mock.calls[0][0].bacASable).toBe(true);
    expect(r).toMatchObject({ statut: "bac_a_sable", motif: "Bac à sable Brevo : accepté par Brevo, jamais délivré.", bacASable: true });
    expect(estParti(r)).toBe(false);
  });

  it("le SMS ne quitte pas la plateforme", async () => {
    const r = await envoyerSms(sms());
    expect(r.statut).toBe("bac_a_sable");
    expect(r.motif).toBe("Bac à sable : le SMS n'est pas transmis au fournisseur (pas de bac à sable pour les SMS).");
    expect(m.posterSms).not.toHaveBeenCalled();
  });

  it("le SMS en bac à sable ne part pas, même sans clé Brevo (le bac à sable passe avant)", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    expect((await envoyerSms(sms())).statut).toBe("bac_a_sable");
  });
});

describe("envois — idempotence et journal", () => {
  beforeEach(() => modeActif());

  it("une clé déjà prise ne repart pas : le statut est celui du premier passage", async () => {
    m.reserver.mockResolvedValue({ reservee: false, ligne: ligne({ statut: "envoye", motif: null, brevo_id: "<premier@smtp-relay.mailin.fr>", bac_a_sable: false }) });
    const r = await envoyerEmail(email({ cle: "questionnaires:demande_recue:r1:d1" }));
    expect(r).toMatchObject({ statut: "envoye", doublon: true, idFournisseur: "<premier@smtp-relay.mailin.fr>", fournisseur: "brevo", cle: "questionnaires:demande_recue:r1:d1" });
    expect(quePartiChezBrevo()).toBe(0);
    expect(m.conclure).not.toHaveBeenCalled();
    expect(m.equiperEmail).not.toHaveBeenCalled();
    expect(libelleStatut(r)).toBe("déjà envoyé");
  });

  it("un doublon dont le premier passage n'a pas fini reste « en_cours »", async () => {
    m.reserver.mockResolvedValue({ reservee: false, ligne: ligne({ statut: "en_cours" }) });
    const r = await envoyerSms(sms({ cle: "veille:cartons:1" }));
    expect(r.statut).toBe("en_cours");
    expect(libelleStatut(r)).toBe("déjà traité");
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("journal indisponible : rien ne part, et la fonction ne lève pas", async () => {
    m.reserver.mockRejectedValue(new Error("la base ne répond pas"));
    const r = await envoyerEmail(email());
    expect(r).toMatchObject({ statut: "echec", journalId: null });
    expect(r.motif).toBe("Journal des envois indisponible : rien n'est parti (la base ne répond pas).");
    expect(quePartiChezBrevo()).toBe(0);
    expect(m.equiperEmail).not.toHaveBeenCalled();
  });

  it("un statut non inscrit (conclure en panne) ne fait pas lever : le message est parti une fois", async () => {
    m.conclure.mockRejectedValue(new Error("timeout"));
    const r = await envoyerEmail(email());
    expect(r.statut).toBe("envoye");
    expect(m.posterEmail).toHaveBeenCalledTimes(1);
  });

  it("sans clé : une clé unique « auto:… » à chaque appel", async () => {
    const a = await envoyerEmail(email());
    const b = await envoyerEmail(email({ cle: "   " }));
    expect(a.cle).toMatch(/^auto:[0-9a-f-]{36}$/);
    expect(b.cle).toMatch(/^auto:[0-9a-f-]{36}$/);
    expect(a.cle).not.toBe(b.cle);
  });

  it("la clé est rognée et bornée à 300 caractères", async () => {
    const r = await envoyerEmail(email({ cle: `  ${"k".repeat(400)}  ` }));
    expect(r.cle).toBe("k".repeat(300));
    expect(m.reserver.mock.calls[0][0].cle).toBe("k".repeat(300));
  });

  it("un message retenu par l'appelant est journalisé avec sa raison, même en actif", async () => {
    const r = await envoyerEmail(email({ retenu: "Pas de lien de dépôt d'avis." }));
    expect(r).toMatchObject({ statut: "journalise", motif: "Pas de lien de dépôt d'avis." });
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("un message retenu vers un destinataire fictif reste « fictif » (le garde-fou passe avant)", async () => {
    const r = await envoyerEmail(email({ a: "x@example.com", retenu: "raison" }));
    expect(r.statut).toBe("fictif");
  });
});

describe("envois — suivi des e-mails (pixel, liens)", () => {
  beforeEach(() => modeActif());

  it("un e-mail au client est équipé avec l'identifiant de sa ligne du journal", async () => {
    await envoyerEmail(email());
    expect(m.equiperEmail).toHaveBeenCalledWith(ligne().id, "<p>Bonjour</p>");
  });

  it("équipé même s'il ne part pas (envoi désactivé) : le suivi s'éprouve sans rien envoyer", async () => {
    vi.stubEnv("ENVOI_MODE", "desactive");
    await envoyerEmail(email());
    expect(m.equiperEmail).toHaveBeenCalledTimes(1);
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("jamais pour une alerte, un message à l'équipe, au bailleur, ni un test des Paramètres", async () => {
    await envoyerEmail(email({ cle: "alerte:paiement_recu:s1:a@bailly.fr" }));
    await envoyerEmail(email({ modele: "cartons_demandes_equipe" }));
    await envoyerEmail(email({ modele: "avarie_bailleur" }));
    await envoyerEmail(email({ modele: "Alerte équipe : Paiement reçu" }));
    await envoyerEmail(email({ origine: "test" }));
    expect(m.equiperEmail).not.toHaveBeenCalled();
    expect(m.posterEmail.mock.calls.every((c) => c[0].html === "<p>Bonjour</p>")).toBe(true);
  });

  it("le choix explicite de l'appelant l'emporte", async () => {
    await envoyerEmail(email({ suivi: false }));
    expect(m.equiperEmail).not.toHaveBeenCalled();
    await envoyerEmail(email({ origine: "test", suivi: true }));
    expect(m.equiperEmail).toHaveBeenCalledTimes(1);
  });
});

describe("envois — plafonds sur 24 heures (messages « plafonne » seulement)", () => {
  const plafonne = (champs: Partial<EmailSortant> = {}) => email({ origine: "questionnaires", cle: "questionnaires:demande_recue:r1:d1", plafonne: true, ...champs });
  const plafonneSms = (champs: Partial<SmsSortant> = {}) => sms({ origine: "questionnaires", cle: "questionnaires:demande_recue:r2:d1", plafonne: true, ...champs });
  const compter = (total: number, chezLui = 0) =>
    m.partisSur24h.mockImplementation(async (f: { destinataire?: string }) => (f.destinataire ? chezLui : total));

  beforeEach(() => modeActif());

  it("e-mails : 199 partis → le 200e part ; 200 partis → bloqué (200 par défaut)", async () => {
    compter(199);
    expect((await envoyerEmail(plafonne())).statut).toBe("envoye");
    compter(200);
    const r = await envoyerEmail(plafonne());
    expect(r).toMatchObject({ statut: "bloque", motif: "Plafond des envois du formulaire atteint (200 en 24 heures) : rien n'est parti." });
    compter(201);
    expect((await envoyerEmail(plafonne())).statut).toBe("bloque");
    expect(m.posterEmail).toHaveBeenCalledTimes(1);
  });

  it("SMS : 29 partis → part ; 30 → bloqué (30 par défaut)", async () => {
    compter(29);
    expect((await envoyerSms(plafonneSms())).statut).toBe("envoye");
    compter(30);
    expect((await envoyerSms(plafonneSms())).motif).toBe("Plafond des envois du formulaire atteint (30 en 24 heures) : rien n'est parti.");
    expect(m.posterSms).toHaveBeenCalledTimes(1);
  });

  it("par destinataire : 5 → part ; 6 → bloqué (6 par défaut)", async () => {
    compter(10, 5);
    expect((await envoyerEmail(plafonne())).statut).toBe("envoye");
    compter(10, 6);
    expect((await envoyerEmail(plafonne())).motif).toBe("Plafond par destinataire atteint (6 en 24 heures) : rien n'est parti.");
    compter(10, 6);
    expect((await envoyerSms(plafonneSms())).statut).toBe("bloque");
    expect(quePartiChezBrevo()).toBe(1);
  });

  it("le plafond total se lit avant celui du destinataire", async () => {
    compter(200, 6);
    expect((await envoyerEmail(plafonne())).motif).toContain("Plafond des envois du formulaire");
  });

  it("compte sur le canal du message, au total et pour son destinataire rogné", async () => {
    await envoyerEmail(plafonne({ a: "  claire+1@gmail.com " }));
    expect(m.partisSur24h).toHaveBeenCalledWith({ canal: "email" });
    expect(m.partisSur24h).toHaveBeenCalledWith({ canal: "email", destinataire: "claire+1@gmail.com" });
    await envoyerSms(plafonneSms());
    expect(m.partisSur24h).toHaveBeenCalledWith({ canal: "sms" });
  });

  it("les plafonds se règlent par l'environnement ; 0 ferme tout", async () => {
    vi.stubEnv("ENVOI_PLAFOND_QUESTIONNAIRES_EMAIL", "3");
    vi.stubEnv("ENVOI_PLAFOND_QUESTIONNAIRES_SMS", "0");
    vi.stubEnv("ENVOI_PLAFOND_PAR_DESTINATAIRE", "1");
    compter(2, 0);
    expect((await envoyerEmail(plafonne())).statut).toBe("envoye");
    compter(3, 0);
    expect((await envoyerEmail(plafonne())).motif).toContain("(3 en 24 heures)");
    compter(0, 0);
    expect((await envoyerSms(plafonneSms())).motif).toContain("(0 en 24 heures)");
    compter(0, 1);
    expect((await envoyerEmail(plafonne())).motif).toBe("Plafond par destinataire atteint (1 en 24 heures) : rien n'est parti.");
  });

  it("une valeur illisible garde le plafond par défaut", async () => {
    for (const v of ["abc", "-1", "2.5", " ", ""]) {
      vi.stubEnv("ENVOI_PLAFOND_QUESTIONNAIRES_EMAIL", v);
      compter(199);
      expect((await envoyerEmail(plafonne())).statut, v).toBe("envoye");
      compter(200);
      expect((await envoyerEmail(plafonne())).statut, v).toBe("bloque");
    }
  });

  it("un blocage par plafond ne prévient pas l'équipe (pas de rafale pendant une attaque)", async () => {
    compter(200);
    expect((await envoyerEmail(plafonne())).statut).toBe("bloque");
    await laisserFiler();
    expect(m.alerterEquipe).not.toHaveBeenCalled();
    expect(dernierConclu()).toMatchObject({ statut: "bloque" });
  });

  it("un message non plafonné (alerte, devis de l'équipe, CRM) part quel que soit le compte", async () => {
    compter(10_000, 10_000);
    expect((await envoyerEmail(email({ origine: "crm" }))).statut).toBe("envoye");
    expect((await envoyerEmail(email({ origine: "questionnaires", plafonne: false }))).statut).toBe("envoye");
    expect((await envoyerSms(sms())).statut).toBe("envoye");
    expect(m.partisSur24h).not.toHaveBeenCalled();
  });

  it("en recette, le plafond s'applique aussi aux destinataires autorisés", async () => {
    vi.stubEnv("ENVOI_MODE", "recette");
    vi.stubEnv("ENVOI_DESTINATAIRES_AUTORISES", "claire@gmail.com");
    compter(0, 6);
    expect((await envoyerEmail(plafonne())).statut).toBe("bloque");
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("le SMS bloqué par plafond ne part pas même en bac à sable (le plafond passe avant)", async () => {
    vi.stubEnv("ENVOI_BAC_A_SABLE", "1");
    compter(30);
    expect((await envoyerSms(plafonneSms())).statut).toBe("bloque");
  });

  // Les envois plafonnés passent un à un : des messages simultanés au même destinataire ne dépassent pas le plafond.
  it("des envois simultanés au même destinataire ne dépassent pas le plafond par destinataire", async () => {
    vi.stubEnv("ENVOI_PLAFOND_PAR_DESTINATAIRE", "1");
    // Un journal en mémoire : reserver ajoute une ligne « en_cours », conclure lui donne son statut.
    const lignes: { id: string; destinataire: string; statut: string }[] = [];
    m.reserver.mockImplementation(async (l: { destinataire: string }) => {
      const nouvelle = { id: `00000000-0000-4000-8000-${String(lignes.length).padStart(12, "0")}`, destinataire: l.destinataire, statut: "en_cours" };
      lignes.push(nouvelle);
      return { reservee: true, ligne: { ...ligne(), ...nouvelle } };
    });
    m.conclure.mockImplementation(async (id: string, c: { statut: string }) => {
      lignes.find((l) => l.id === id)!.statut = c.statut;
    });
    m.partisSur24h.mockImplementation(async () => lignes.filter((l) => l.statut === "envoye").length);
    m.posterEmail.mockImplementation(async () => {
      await new Promise((ok) => setTimeout(ok, 5));
      return { ok: true, id: "x" };
    });
    await Promise.all([1, 2, 3].map((i) => envoyerEmail(plafonne({ cle: `questionnaires:demande_recue:r1:d${i}`, suivi: false }))));
    expect(m.posterEmail).toHaveBeenCalledTimes(1);
  });
});

describe("envois — libelleStatut, estParti, etatEnvois", () => {
  it("dit chaque statut en clair", () => {
    const cas: [string, string][] = [
      ["envoye", "envoyé"],
      ["journalise", "journalisé (envoi désactivé)"],
      ["bloque", "bloqué (recette, hors liste blanche)"],
      ["fictif", "non envoyé (destinataire fictif)"],
      ["bac_a_sable", "bac à sable (non délivré)"],
      ["incertain", "incertain (à vérifier chez le fournisseur)"],
      ["echec", "échec"],
      ["en_cours", "en cours"],
    ];
    for (const [statut, libelle] of cas) expect(libelleStatut({ statut: statut as never, doublon: false })).toBe(libelle);
    expect(libelleStatut({ statut: "incertain", doublon: false, fournisseur: "sendgrid" })).toBe("incertain (à vérifier chez SendGrid)");
    expect(libelleStatut({ statut: "incertain", doublon: false, fournisseur: "brevo" })).toBe("incertain (à vérifier chez Brevo)");
  });

  it("seul « envoye » est parti : ni le bac à sable, ni l'incertain", () => {
    expect(estParti({ statut: "envoye" })).toBe(true);
    for (const s of ["bac_a_sable", "incertain", "journalise", "bloque", "fictif", "echec", "en_cours"]) expect(estParti({ statut: s as never })).toBe(false);
  });

  it("état désactivé : rien ne part, sans avertissement sur la clé", () => {
    vi.stubEnv("ENVOI_MODE", "");
    vi.stubEnv("BREVO_API_KEY", "");
    const e = etatEnvois();
    expect(e).toMatchObject({ mode: "desactive", libelle: "Désactivé", bacASable: false, par: "Brevo", fournisseurs: { email: "brevo", sms: "brevo", emailPret: false, smsPret: false } });
    expect(e.detail).toBe("Rien ne part : chaque e-mail et chaque SMS est journalisé, sans appel à Brevo.");
    expect(e.avertissements).toEqual([]);
  });

  it("état recette : la liste blanche affichée (adresses, @domaines, +numéros) et le bac à sable signalé", () => {
    vi.stubEnv("ENVOI_MODE", "recette");
    vi.stubEnv("ENVOI_BAC_A_SABLE", "1");
    vi.stubEnv("BREVO_API_KEY", "k");
    vi.stubEnv("ENVOI_DESTINATAIRES_AUTORISES", "david@bailly.fr;@mindeon.ai;0612345678");
    const e = etatEnvois();
    expect(e.libelle).toBe("Recette (liste blanche) · bac à sable");
    expect(e.liste).toEqual(["david@bailly.fr", "@mindeon.ai", "+33612345678"]);
    expect(e.detail).toContain("(3 entrées)");
    expect(e.detail).toContain("Bac à sable");
  });

  it("état actif sans clé Brevo : l'avertissement le dit", () => {
    modeActif();
    vi.stubEnv("BREVO_API_KEY", "");
    const e = etatEnvois();
    expect(e.libelle).toBe("Actif");
    expect(e.avertissements).toContain("Aucune clé Brevo (BREVO_API_KEY) : les messages autorisés échoueront.");
  });

  it("le bac à sable ne s'affiche pas quand l'envoi est désactivé", () => {
    vi.stubEnv("ENVOI_MODE", "desactive");
    vi.stubEnv("ENVOI_BAC_A_SABLE", "1");
    expect(etatEnvois().libelle).toBe("Désactivé");
  });
});

/*
 * La bascule vers Twilio (décision du 18/11/2026) : SendGrid pour les e-mails,
 * Twilio pour les SMS, dès que leurs accès sont posés ; Brevo tant qu'ils
 * manquent. Les garde-fous et le journal ne changent pas d'un fournisseur à
 * l'autre. Les accès sont factices : les transports sont simulés.
 */
describe("envois — fournisseur Twilio (SendGrid pour les e-mails, Twilio pour les SMS)", () => {
  const SID = `SM${"a".repeat(32)}`;
  function accesSendgrid() {
    vi.stubEnv("SENDGRID_API_KEY", "cle-sendgrid-factice");
  }
  function accesTwilio() {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACfactice");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "jeton-factice");
  }
  function modeTwilio(extra: Record<string, string> = {}) {
    modeActif(extra);
    accesSendgrid();
    accesTwilio();
  }

  it("ses accès posés, Twilio prend les deux canaux : Brevo n'est plus appelé, même avec sa clé", async () => {
    modeTwilio();
    m.posterSmsTwilio.mockResolvedValue({ ok: true, id: SID });
    const r = await envoyerEmail(email({ texte: "Bonjour", repondreA: "conseiller@bailly.fr", piecesJointes: [{ nom: "devis.pdf", base64: "AA==" }] }));
    expect(r).toMatchObject({ statut: "envoye", motif: null, idFournisseur: "sg-1", fournisseur: "sendgrid", journalId: ligne().id });
    // Le même message que pour Brevo, plus la ligne du journal (custom_args du webhook).
    expect(m.posterEmailSendgrid).toHaveBeenCalledWith({
      a: "claire@gmail.com",
      sujet: "Votre espace",
      html: "<p>Bonjour</p><img suivi>",
      texte: "Bonjour",
      expediteur: { nom: "Bailly Déménagement", email: "no-reply@bailly.fr" },
      repondreA: "conseiller@bailly.fr",
      piecesJointes: [{ nom: "devis.pdf", base64: "AA==" }],
      bacASable: false,
      envoiId: ligne().id,
    });
    expect(dernierConclu()).toEqual({ statut: "envoye", motif: null, brevo_id: "sg-1", fournisseur: "sendgrid" });

    const s = await envoyerSms(sms({ expediteur: "Bailly" }));
    expect(s).toMatchObject({ statut: "envoye", idFournisseur: SID, fournisseur: "twilio" });
    expect(m.posterSmsTwilio).toHaveBeenCalledWith({ a: "06 12 34 56 78", texte: "Vos cartons arrivent demain.", expediteur: "Bailly", envoiId: ligne().id });
    expect(dernierConclu()).toEqual({ statut: "envoye", motif: null, brevo_id: SID, fournisseur: "twilio" });
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("l'expéditeur de l'e-mail : ENVOI_EXPEDITEUR_NOM / _EMAIL par défaut, celui de l'appelant (réglages du CRM) d'abord", async () => {
    modeTwilio({ ENVOI_EXPEDITEUR_NOM: "Bailly Recette", ENVOI_EXPEDITEUR_EMAIL: "recette@bailly.fr" });
    await envoyerEmail(email());
    expect(m.posterEmailSendgrid.mock.calls[0][0].expediteur).toEqual({ nom: "Bailly Recette", email: "recette@bailly.fr" });
    await envoyerEmail(email({ expediteur: { nom: "Bailly Déménagement", email: "contact@bailly.fr" } }));
    expect(m.posterEmailSendgrid.mock.calls[1][0].expediteur).toEqual({ nom: "Bailly Déménagement", email: "contact@bailly.fr" });
  });

  it("canal par canal : la clé SendGrid seule bascule les e-mails, les SMS restent chez Brevo", async () => {
    modeActif();
    accesSendgrid();
    expect((await envoyerEmail(email())).fournisseur).toBe("sendgrid");
    expect((await envoyerSms(sms())).fournisseur).toBe("brevo");
    expect(m.posterEmailSendgrid).toHaveBeenCalledTimes(1);
    expect(m.posterSms).toHaveBeenCalledTimes(1);
    expect(m.posterEmail).not.toHaveBeenCalled();
    expect(m.posterSmsTwilio).not.toHaveBeenCalled();
  });

  it("canal par canal : les accès Twilio seuls basculent les SMS, les e-mails restent chez Brevo", async () => {
    modeActif();
    accesTwilio();
    expect((await envoyerEmail(email())).fournisseur).toBe("brevo");
    expect((await envoyerSms(sms())).fournisseur).toBe("twilio");
    expect(m.posterEmail).toHaveBeenCalledTimes(1);
    expect(m.posterSmsTwilio).toHaveBeenCalledTimes(1);
  });

  it("un accès Twilio à moitié posé (le SID sans le jeton) ne bascule rien", async () => {
    modeActif();
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACfactice");
    expect((await envoyerSms(sms())).fournisseur).toBe("brevo");
    expect(m.posterSmsTwilio).not.toHaveBeenCalled();
  });

  it("ENVOI_FOURNISSEUR=brevo : tout reste chez Brevo malgré les accès Twilio (le retour arrière)", async () => {
    modeTwilio({ ENVOI_FOURNISSEUR: "brevo" });
    expect((await envoyerEmail(email())).fournisseur).toBe("brevo");
    expect((await envoyerSms(sms())).fournisseur).toBe("brevo");
    expect(m.posterEmailSendgrid).not.toHaveBeenCalled();
    expect(m.posterSmsTwilio).not.toHaveBeenCalled();
  });

  it("ENVOI_FOURNISSEUR=twilio sans ses accès : échec dit, et Brevo n'est pas appelé à la place", async () => {
    modeActif({ ENVOI_FOURNISSEUR: "twilio" });
    const r = await envoyerEmail(email());
    expect(r).toMatchObject({ statut: "echec", motif: "Clé SendGrid absente (SENDGRID_API_KEY) : rien n'est parti.", fournisseur: null });
    const s = await envoyerSms(sms());
    expect(s).toMatchObject({ statut: "echec", motif: "Accès Twilio absents (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : rien n'est parti." });
    expect(quePartiTout()).toBe(0);
  });

  it("ENVOI_FOURNISSEUR= Twilio (casse, espaces) vaut twilio ; une valeur inconnue laisse le choix automatique", async () => {
    modeTwilio({ ENVOI_FOURNISSEUR: " Twilio " });
    expect((await envoyerEmail(email())).fournisseur).toBe("sendgrid");
    vi.stubEnv("ENVOI_FOURNISSEUR", "mailchimp");
    expect((await envoyerEmail(email())).fournisseur).toBe("sendgrid");
    vi.stubEnv("SENDGRID_API_KEY", "");
    expect((await envoyerEmail(email())).fournisseur).toBe("brevo");
  });

  it("SendGrid refuse (4xx) : « echec », retentable ; Twilio en 5xx : « incertain », jamais renvoyé tout seul", async () => {
    modeTwilio();
    m.posterEmailSendgrid.mockResolvedValue({ ok: false, definitif: true, message: "SendGrid 403 : expéditeur non vérifié" });
    const r = await envoyerEmail(email());
    expect(r).toMatchObject({ statut: "echec", motif: "SendGrid 403 : expéditeur non vérifié", fournisseur: "sendgrid", idFournisseur: null });
    expect(dernierConclu()).toEqual({ statut: "echec", motif: r.motif, brevo_id: null, fournisseur: "sendgrid" });
    m.posterSmsTwilio.mockResolvedValue({ ok: false, definitif: false, message: "Twilio 503 : indisponible" });
    const s = await envoyerSms(sms());
    expect(s.statut).toBe("incertain");
    expect(s.motif).toBe("Twilio 503 : indisponible — Twilio a peut-être accepté le message : il n'est pas renvoyé tout seul.");
    expect(libelleStatut(s)).toBe("incertain (à vérifier chez Twilio)");
    expect(m.posterSmsTwilio).toHaveBeenCalledTimes(1);
  });

  it("bac à sable : l'e-mail part chez SendGrid en bac à sable, le SMS ne va jamais chez Twilio", async () => {
    modeTwilio({ ENVOI_BAC_A_SABLE: "1" });
    m.posterEmailSendgrid.mockResolvedValue({ ok: true, id: null });
    const r = await envoyerEmail(email());
    expect(m.posterEmailSendgrid.mock.calls[0][0].bacASable).toBe(true);
    expect(r).toMatchObject({ statut: "bac_a_sable", motif: "Bac à sable SendGrid : accepté par SendGrid, jamais délivré.", fournisseur: "sendgrid" });
    expect(estParti(r)).toBe(false);
    const s = await envoyerSms(sms());
    expect(s).toMatchObject({ statut: "bac_a_sable", fournisseur: null });
    expect(m.posterSmsTwilio).not.toHaveBeenCalled();
  });

  it("matrice : mode × bac à sable × canal × destinataire × options — avec Twilio, rien ne sort hors « actif » ou liste blanche", async () => {
    accesSendgrid();
    accesTwilio();
    vi.stubEnv("ENVOI_DESTINATAIRES_AUTORISES", "david@bailly.fr, 06 12 34 56 78");
    const destinataires = [
      { canal: "email", a: "client.reel@gmail.com", liste: false, fictif: false },
      { canal: "email", a: "david@bailly.fr", liste: true, fictif: false },
      { canal: "email", a: "claire@example.com", liste: false, fictif: true },
      { canal: "sms", a: "07 99 99 99 99", liste: false, fictif: false },
      { canal: "sms", a: "06 12 34 56 78", liste: true, fictif: false },
    ] as const;
    const options: Partial<EmailSortant & SmsSortant>[] = [{}, { plafonne: true, origine: "questionnaires" }, { fictif: true }, { retenu: "raison" }];
    for (const mode of ["", "desactive", "inconnu", "recette", "actif"]) {
      for (const sable of ["", "1"]) {
        vi.stubEnv("ENVOI_MODE", mode);
        vi.stubEnv("ENVOI_BAC_A_SABLE", sable);
        for (const d of destinataires) {
          for (const o of options) {
            m.posterEmailSendgrid.mockClear();
            m.posterSmsTwilio.mockClear();
            const r = d.canal === "email" ? await envoyerEmail(email({ a: d.a, ...o })) : await envoyerSms(sms({ a: d.a, ...o }));
            const autorise = (mode === "actif" || (mode === "recette" && d.liste)) && !d.fictif && !o.fictif && !o.retenu;
            const attendu = autorise && !(sable === "1" && d.canal === "sms") ? 1 : 0;
            expect(quePartiTout(), `${mode}/${sable}/${d.a}/${JSON.stringify(o)} → ${r.statut}`).toBe(attendu);
          }
        }
      }
    }
    // Brevo, lui, n'a jamais été appelé : Twilio porte les deux canaux.
    expect(quePartiChezBrevo()).toBe(0);
  });

  it("les plafonds des envois du formulaire valent aussi chez Twilio", async () => {
    modeTwilio();
    m.partisSur24h.mockResolvedValue(30);
    const s = await envoyerSms(sms({ origine: "questionnaires", plafonne: true }));
    expect(s).toMatchObject({ statut: "bloque", fournisseur: null });
    expect(m.posterSmsTwilio).not.toHaveBeenCalled();
  });

  it("un doublon d'un message parti par Twilio dit son fournisseur, lu au journal ou déduit de l'identifiant", async () => {
    modeTwilio();
    m.reserver.mockResolvedValue({ reservee: false, ligne: ligne({ statut: "envoye", brevo_id: SID }) });
    expect(await envoyerSms(sms({ cle: "veille:cartons:1" }))).toMatchObject({ doublon: true, fournisseur: "twilio", idFournisseur: SID });
    m.reserver.mockResolvedValue({ reservee: false, ligne: ligne({ statut: "envoye", brevo_id: "x", fournisseur: "sendgrid" }) });
    expect((await envoyerEmail(email({ cle: "ec:1" }))).fournisseur).toBe("sendgrid");
    expect(quePartiTout()).toBe(0);
  });

  it("etatEnvois : les deux fournisseurs nommés ; ce qui manque, dit sans jamais montrer une clé", () => {
    modeTwilio();
    let e = etatEnvois();
    expect(e.par).toBe("SendGrid (e-mails) et Twilio (SMS)");
    expect(e.detail).toBe("Les e-mails et les SMS partent par SendGrid (e-mails) et Twilio (SMS) vers tous les destinataires réels.");
    expect(e.fournisseurs).toEqual({ email: "sendgrid", sms: "twilio", emailPret: true, smsPret: true });
    expect(e.avertissements).toEqual([]);
    expect(JSON.stringify(e)).not.toContain("cle-sendgrid-factice");
    expect(JSON.stringify(e)).not.toContain("jeton-factice");

    vi.stubEnv("ENVOI_FOURNISSEUR", "twilio");
    vi.stubEnv("SENDGRID_API_KEY", "");
    e = etatEnvois();
    expect(e.avertissements).toEqual(["Aucune clé SendGrid (SENDGRID_API_KEY) : les e-mails autorisés échoueront."]);

    vi.stubEnv("ENVOI_FOURNISSEUR", "");
    vi.stubEnv("BREVO_API_KEY", "");
    e = etatEnvois();
    expect(e.par).toBe("Brevo (e-mails) et Twilio (SMS)");
    expect(e.avertissements).toEqual(["Aucune clé Brevo (BREVO_API_KEY) : les e-mails autorisés échoueront."]);

    vi.stubEnv("ENVOI_FOURNISSEUR", "autre");
    expect(etatEnvois().avertissements[0]).toContain('ENVOI_FOURNISSEUR="autre" n\'est pas reconnu');

    vi.stubEnv("ENVOI_MODE", "desactive");
    vi.stubEnv("ENVOI_FOURNISSEUR", "");
    accesSendgrid();
    expect(etatEnvois().detail).toBe("Rien ne part : chaque e-mail et chaque SMS est journalisé, sans appel à SendGrid (e-mails) et Twilio (SMS).");
  });
});
