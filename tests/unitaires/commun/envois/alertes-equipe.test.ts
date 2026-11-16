import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInterdit } from "./_outils";

/*
 * Les alertes de l'équipe : le catalogue, les abonnements (lus par la petite
 * connexion des modules partagés, simulée ici), le jeton de désabonnement et
 * l'envoi, qui passe par le module d'envoi (simulé).
 */

type Ligne = Record<string, unknown>;
const m = vi.hoisted(() => ({
  base: null as null | ((sql: string, params?: unknown[]) => Promise<unknown[]>),
  envoyerEmail: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock("@/lib/base-crm", () => ({ baseCrm: () => m.base }));
vi.mock("@/lib/envois", () => ({ envoyerEmail: m.envoyerEmail }));
vi.mock("@/lib/settings", () => ({ getSettings: m.getSettings }));

import { ALERTES, alerteDe, CONSEILLER, GROUPES, remplirAlerte } from "@/lib/alertes-equipe/catalogue";
import {
  adresseVariable,
  alerterEquipe,
  composerAlerte,
  destinatairesAlerte,
  jetonDesabonnement,
  lienDesabonnement,
  lireEtat,
  lireJeton,
  texteAlerte,
} from "@/lib/alertes-equipe";
import { URL_INTERNE } from "@/lib/adresses";

let equipe: Ligne[];
let dest: Ligne[];
let abo: Ligne[];
let reg: Ligne[];
let evenementsNotes: unknown[][];

function brancherBase() {
  evenementsNotes = [];
  m.base = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("public.team_members")) return equipe;
    if (sql.includes("from crm.alertes_destinataires")) return dest;
    if (sql.includes("from crm.alertes_abonnements")) return abo;
    if (sql.includes("from crm.alertes_reglages")) return reg;
    if (sql.startsWith("insert into crm.alertes_evenements")) {
      evenementsNotes.push(params);
      return [];
    }
    throw new Error(`SQL inattendu : ${sql}`);
  });
}

const resultat = (statut = "envoye", doublon = false) => ({ statut, motif: null, brevoId: null, cle: "k", doublon, journalId: "j", bacASable: false });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchInterdit());
  equipe = [];
  dest = [];
  abo = [];
  reg = [];
  m.base = null;
  evenementsNotes = [];
  m.envoyerEmail.mockReset().mockResolvedValue(resultat());
  m.getSettings.mockReset().mockResolvedValue({ entreprise_nom: "Bailly Déménagement", entreprise_email: "contact@bailly.fr", base_url: "https://devis.bailly.fr/" });
  vi.stubEnv("ESPACE_CLIENT_EMAIL_EQUIPE", "");
  vi.stubEnv("ALERTES_SECRET", "secret-des-alertes");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("alertes-equipe/catalogue", () => {
  it("les clés sont uniques, les groupes connus", () => {
    expect(new Set(ALERTES.map((a) => a.cle)).size).toBe(ALERTES.length);
    for (const a of ALERTES) expect(GROUPES).toContain(a.groupe);
  });

  it("chaque texte de départ n'emploie que les variables déclarées", () => {
    for (const a of ALERTES.filter((x) => x.depart)) {
      for (const [, v] of `${a.depart!.objet} ${a.depart!.corps}`.matchAll(/\{([a-z_]+)\}/gi)) expect(a.variables, `${a.cle} : {${v}}`).toContain(v);
    }
  });

  it("une alerte héritée garde son texte dans le code de l'espace client, sans texte de départ", () => {
    for (const a of ALERTES.filter((x) => x.heritee)) {
      expect(a.texteCode, a.cle).toBeTruthy();
      expect(a.depart, a.cle).toBeUndefined();
    }
  });

  it("alerteDe et remplirAlerte (une variable absente reste vide, rien n'est échappé ici)", () => {
    expect(alerteDe("paiement_recu")?.titre).toBe("Arrhes ou paiement reçus");
    expect(alerteDe("inconnue")).toBeNull();
    expect(remplirAlerte("{client} — {absente} — {montant}", { client: "<b>C</b>", montant: 0 })).toBe("<b>C</b> —  — 0");
  });
});

describe("alertes-equipe — qui reçoit, sans base lisible", () => {
  it("adresseVariable : ESPACE_CLIENT_EMAIL_EQUIPE en minuscules, sans espaces ; null sinon", () => {
    expect(adresseVariable()).toBeNull();
    vi.stubEnv("ESPACE_CLIENT_EMAIL_EQUIPE", "  Equipe@Bailly.FR ");
    expect(adresseVariable()).toBe("equipe@bailly.fr");
  });

  it("une alerte qui existait part comme avant : à ESPACE_CLIENT_EMAIL_EQUIPE", async () => {
    vi.stubEnv("ESPACE_CLIENT_EMAIL_EQUIPE", "equipe@bailly.fr");
    const { destinataires } = await destinatairesAlerte("sav_declare", { conseillers: ["nadia@bailly.fr"] });
    expect(destinataires.map((d) => d.email)).toEqual(["equipe@bailly.fr"]);
  });

  it("… sinon au conseiller du dossier (rogné, en minuscules, sans doublon ni vide)", async () => {
    const { destinataires } = await destinatairesAlerte("sav_declare", { conseillers: [" Nadia@Bailly.fr", "nadia@bailly.fr", "", null, undefined, "  "] });
    expect(destinataires.map((d) => d.email)).toEqual(["nadia@bailly.fr"]);
  });

  it("une alerte nouvelle ne part à personne", async () => {
    vi.stubEnv("ESPACE_CLIENT_EMAIL_EQUIPE", "equipe@bailly.fr");
    expect((await destinatairesAlerte("paiement_recu", { conseillers: ["nadia@bailly.fr"] })).destinataires).toEqual([]);
  });

  it("une alerte inconnue ne part à personne", async () => {
    expect((await destinatairesAlerte("inconnue")).destinataires).toEqual([]);
  });

  it("une base qui lève vaut une base absente (destinataires d'avant)", async () => {
    m.base = async () => {
      throw new Error("relation crm.alertes_destinataires does not exist");
    };
    expect(await lireEtat()).toBeNull();
    const { destinataires } = await destinatairesAlerte("sav_declare", { conseillers: ["nadia@bailly.fr"] });
    expect(destinataires.map((d) => d.email)).toEqual(["nadia@bailly.fr"]);
  });
});

describe("alertes-equipe — qui reçoit, d'après les abonnements", () => {
  beforeEach(() => {
    brancherBase();
    equipe = [{ email: "celine@bailly.fr", nom: "Céline" }, { email: "christian@bailly.fr", nom: "Christian" }, { email: "nadia@bailly.fr", nom: "Nadia" }];
  });

  it("seuls les abonnés reçoivent une alerte nouvelle", async () => {
    abo = [{ email: "celine@bailly.fr", alerte: "paiement_recu", abonne: true }, { email: "christian@bailly.fr", alerte: "paiement_recu", abonne: false }];
    const { destinataires } = await destinatairesAlerte("paiement_recu");
    expect(destinataires.map((d) => d.email)).toEqual(["celine@bailly.fr"]);
  });

  it("un destinataire en pause ne reçoit rien", async () => {
    abo = [{ email: "celine@bailly.fr", alerte: "paiement_recu", abonne: true }];
    dest = [{ email: "celine@bailly.fr", nom: "Céline", manuel: false, en_pause: true }];
    expect((await destinatairesAlerte("paiement_recu")).destinataires).toEqual([]);
  });

  it("une alerte coupée par l'équipe ne part à personne", async () => {
    abo = [{ email: "celine@bailly.fr", alerte: "paiement_recu", abonne: true }];
    reg = [{ cle: "paiement_recu", actif: false, objet: null, corps: null, valide: true, maj_par: null, maj_le: null }];
    expect((await destinatairesAlerte("paiement_recu")).destinataires).toEqual([]);
  });

  it("« le conseiller du dossier » se résout en conseillers, sauf celui qui s'est désabonné ou mis en pause", async () => {
    abo = [{ email: CONSEILLER, alerte: "paiement_recu", abonne: true }, { email: "marc@bailly.fr", alerte: "paiement_recu", abonne: false }];
    dest = [{ email: "nadia@bailly.fr", nom: "Nadia", manuel: false, en_pause: true }];
    const { destinataires } = await destinatairesAlerte("paiement_recu", { conseillers: ["marc@bailly.fr", "nadia@bailly.fr", "paul@bailly.fr"] });
    expect(destinataires.map((d) => d.email)).toEqual(["paul@bailly.fr"]);
  });

  it("une adresse ajoutée à la main reçoit si elle est abonnée", async () => {
    dest = [{ email: "direction@bailly.fr", nom: "Direction", manuel: true, en_pause: false }];
    abo = [{ email: "direction@bailly.fr", alerte: "devis_signe", abonne: true }];
    expect((await destinatairesAlerte("devis_signe")).destinataires.map((d) => d.email)).toEqual(["direction@bailly.fr"]);
  });

  it("un membre de l'équipe qui est aussi le conseiller ne reçoit qu'une fois", async () => {
    abo = [{ email: CONSEILLER, alerte: "paiement_recu", abonne: true }, { email: "nadia@bailly.fr", alerte: "paiement_recu", abonne: true }];
    const { destinataires } = await destinatairesAlerte("paiement_recu", { conseillers: ["nadia@bailly.fr"] });
    expect(destinataires.map((d) => d.email)).toEqual(["nadia@bailly.fr"]);
  });

  it("une alerte héritée reste abonnée d'office pour le conseiller (rien ne change sans réglage)", async () => {
    const { destinataires } = await destinatairesAlerte("service_demande", { conseillers: ["nadia@bailly.fr"] });
    expect(destinataires.map((d) => d.email)).toEqual(["nadia@bailly.fr"]);
  });

  it("chaque destinataire porte son lien de désabonnement", async () => {
    abo = [{ email: "celine@bailly.fr", alerte: "paiement_recu", abonne: true }];
    const [d] = (await destinatairesAlerte("paiement_recu")).destinataires;
    expect(d.desabonnement).toMatch(new RegExp(`^${URL_INTERNE.replace(/[.:/]/g, "\\$&")}/desabonnement/[\\w-]+\\.[\\w-]{32}$`));
  });
});

describe("alertes-equipe — le jeton de désabonnement", () => {
  it("se relit : l'adresse (en minuscules) et l'alerte", () => {
    const j = jetonDesabonnement("  Celine@Bailly.fr ", "paiement_recu")!;
    expect(lireJeton(j)).toEqual({ email: "celine@bailly.fr", alerte: "paiement_recu" });
  });

  it("une signature altérée, un autre secret, une alerte inconnue, du charabia : rien", () => {
    const j = jetonDesabonnement("celine@bailly.fr", "paiement_recu")!;
    const [charge, sig] = j.split(".");
    expect(lireJeton(`${charge}.${sig.slice(0, -1)}A`)).toBeNull();
    expect(lireJeton(`${charge}x.${sig}`)).toBeNull();
    const autre = Buffer.from(JSON.stringify(["pirate@pirate.com", "paiement_recu"])).toString("base64url");
    expect(lireJeton(`${autre}.${sig}`)).toBeNull();
    expect(lireJeton("")).toBeNull();
    expect(lireJeton("a.b.c")).toBeNull();
    expect(lireJeton(undefined as unknown as string)).toBeNull();
    const inconnue = jetonDesabonnement("celine@bailly.fr", "inconnue")!;
    expect(lireJeton(inconnue)).toBeNull();
    vi.stubEnv("ALERTES_SECRET", "un-autre-secret");
    expect(lireJeton(j)).toBeNull();
  });

  it("sans secret (ni ALERTES_SECRET ni clé de service) : aucun jeton, aucun lien, rien ne se relit", () => {
    const j = jetonDesabonnement("celine@bailly.fr", "paiement_recu")!;
    vi.stubEnv("ALERTES_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(jetonDesabonnement("celine@bailly.fr", "paiement_recu")).toBeNull();
    expect(lienDesabonnement("celine@bailly.fr", "paiement_recu")).toBeNull();
    expect(lireJeton(j)).toBeNull();
  });

  it("à défaut d'ALERTES_SECRET, la clé de service signe", () => {
    vi.stubEnv("ALERTES_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    const j = jetonDesabonnement("celine@bailly.fr", "paiement_recu");
    expect(j).not.toBeNull();
    expect(lireJeton(j!)).toEqual({ email: "celine@bailly.fr", alerte: "paiement_recu" });
  });
});

describe("alertes-equipe — composerAlerte et texteAlerte", () => {
  const def = alerteDe("paiement_recu")!;

  it("le texte de départ, variables remplies ; celui de l'équipe s'il est réglé", () => {
    expect(texteAlerte(def, null)).toEqual(def.depart);
    expect(texteAlerte(def, { actif: true, objet: " ", corps: "Reçu {montant}", valide: true, maj_par: null, maj_le: null })).toEqual({ objet: def.depart!.objet, corps: "Reçu {montant}" });
    expect(texteAlerte(def, { actif: true, objet: "x", corps: "  ", valide: true, maj_par: null, maj_le: null })).toEqual(def.depart);
  });

  it("le corps est échappé, l'objet reste du texte, le lien et le désabonnement suivent", async () => {
    const vars = { client: "<script>alert(1)</script>", reference: "BD-1", montant: "900 €", libelle: "Arrhes" };
    const r = await composerAlerte(def, null, vars, { chemin: "/dossiers/77", libelle: "Ouvrir le dossier" }, "https://crm/desabonnement/x\"y");
    expect(r.sujet).toBe("Paiement reçu — BD-1");
    expect(r.html).not.toContain("<script>alert(1)</script>");
    expect(r.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(r.html).toContain(`${URL_INTERNE}/dossiers/77`);
    expect(r.html).toContain("https://crm/desabonnement/x&quot;y");
    expect(r.texte).toBe(`Paiement de 900 € reçu pour le dossier BD-1 (<script>alert(1)</script>) : Arrhes.\n\n${URL_INTERNE}/dossiers/77\n\nNe plus recevoir cette alerte : https://crm/desabonnement/x"y`);
  });

  it("des réglages illisibles ne l'empêchent pas", async () => {
    m.getSettings.mockRejectedValue(new Error("base"));
    const r = await composerAlerte(def, null, {}, null, null);
    expect(r.sujet).toBe("Paiement reçu — ");
    expect(r.texte).not.toContain("Ne plus recevoir");
  });
});

describe("alertes-equipe — alerterEquipe", () => {
  beforeEach(() => {
    brancherBase();
    equipe = [{ email: "celine@bailly.fr", nom: "Céline" }, { email: "christian@bailly.fr", nom: "Christian" }];
    abo = [{ email: "celine@bailly.fr", alerte: "paiement_recu", abonne: true }, { email: "christian@bailly.fr", alerte: "paiement_recu", abonne: true }];
  });

  const ev = { evenement: "session-se-1", reference: "BD-2026-0147", vars: { client: "Claire", reference: "BD-2026-0147", montant: "900 €", libelle: "Arrhes" } };

  it("un e-mail par abonné, par le module d'envoi, avec une clé « alerte:<alerte>:<événement>:<adresse> »", async () => {
    const r = await alerterEquipe("paiement_recu", ev);
    expect(r).toEqual({ destinataires: 2, partis: 2 });
    expect(m.envoyerEmail.mock.calls.map((c) => c[0].cle)).toEqual(["alerte:paiement_recu:session-se-1:celine@bailly.fr", "alerte:paiement_recu:session-se-1:christian@bailly.fr"]);
    expect(m.envoyerEmail.mock.calls[0][0]).toMatchObject({ origine: "crm", modele: "Alerte équipe : Arrhes ou paiement reçus", reference: "BD-2026-0147", a: "celine@bailly.fr", sujet: "Paiement reçu — BD-2026-0147" });
    expect(m.envoyerEmail.mock.calls[0][0]).not.toHaveProperty("plafonne");
    expect(evenementsNotes[0]).toEqual(["paiement_recu", "session-se-1", "BD-2026-0147", 2, "2 destinataires : envoye"]);
  });

  it("seuls les messages vraiment partis comptent ; le résumé dit ce qu'il en est", async () => {
    m.envoyerEmail.mockResolvedValueOnce(resultat("journalise")).mockResolvedValueOnce(resultat("envoye", true));
    const r = await alerterEquipe("paiement_recu", { ...ev, origine: "espace_client" });
    expect(r).toEqual({ destinataires: 2, partis: 1 });
    expect(m.envoyerEmail.mock.calls[0][0].origine).toBe("espace_client");
    expect(evenementsNotes[0][4]).toBe("2 destinataires : journalise, déjà traitée (même événement)");
  });

  it("aucun abonné : rien ne part, l'événement est noté", async () => {
    abo = [];
    expect(await alerterEquipe("paiement_recu", ev)).toEqual({ destinataires: 0, partis: 0 });
    expect(m.envoyerEmail).not.toHaveBeenCalled();
    expect(evenementsNotes[0]).toEqual(["paiement_recu", "session-se-1", "BD-2026-0147", 0, "Aucun abonné : rien n'est parti."]);
  });

  it("une alerte au texte dans le code de l'espace client (sans texte de départ) ne part pas d'ici", async () => {
    for (const cle of ["cartons_demandes", "recap_cartons", "sav_declare", "service_demande", "inconnue"]) {
      expect(await alerterEquipe(cle, ev), cle).toEqual({ destinataires: 0, partis: 0 });
    }
    expect(m.envoyerEmail).not.toHaveBeenCalled();
  });

  it("ne lève jamais, même si l'envoi lève", async () => {
    m.envoyerEmail.mockRejectedValue(new Error("boom"));
    await expect(alerterEquipe("paiement_recu", ev)).resolves.toEqual({ destinataires: 0, partis: 0 });
  });

  it("un journal des alertes injoignable ne bloque rien", async () => {
    const lire = m.base!;
    m.base = vi.fn(async (sql: string, p?: unknown[]) => {
      if (sql.startsWith("insert")) throw new Error("table absente");
      return lire(sql, p);
    });
    expect(await alerterEquipe("paiement_recu", ev)).toEqual({ destinataires: 2, partis: 2 });
  });

  it("l'événement et le résumé notés sont bornés (200 et 500 caractères)", async () => {
    await alerterEquipe("paiement_recu", { ...ev, evenement: "e".repeat(400) });
    expect((evenementsNotes[0][1] as string).length).toBe(200);
  });

  it("l'alerte « envoi bloqué » porte une clé « alerte: » : le module d'envoi ne la signale pas à son tour (pas de boucle)", async () => {
    abo = [{ email: "celine@bailly.fr", alerte: "envoi_bloque", abonne: true }];
    await alerterEquipe("envoi_bloque", { evenement: "ec:42", vars: { modele: "acces", reference: "BD-1", destinataire: "client@gmail.com", motif: "Recette" } });
    expect(m.envoyerEmail.mock.calls[0][0].cle.startsWith("alerte:")).toBe(true);
  });
});
