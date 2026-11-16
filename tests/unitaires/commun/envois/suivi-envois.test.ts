import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clicAutomatique,
  DELAI_MACHINE_S,
  DELAI_PROXY_AUTOMATIQUE_S,
  destinationDe,
  equiperHtml,
  familleAgent,
  GIF_TRANSPARENT,
  LIENS_MAX,
  ouvertureAutomatique,
  pageDuChemin,
} from "@/lib/suivi-envois/regles";

/*
 * Le suivi des e-mails : les règles pures (regles.ts), puis l'équipement
 * d'un e-mail par le serveur (index.ts), avec la base simulée.
 */

const m = vi.hoisted(() => ({ lire: null as null | ((sql: string, p?: unknown[]) => Promise<unknown[]>) }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/base-crm", () => ({ baseCrm: () => m.lire }));

const JETON = "AbCdEfGhIjKlMnOpQrStUv.sig1234567890123456789";
const BASE = "https://plateforme.bailly.fr";

describe("suivi-envois/regles — familleAgent", () => {
  const cas: [string | null, string][] = [
    [null, "inconnu"],
    ["", "inconnu"],
    ["Mozilla/5.0", "apple_proxy"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0", "navigateur"],
    ["Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)", "google_proxy"],
    ["YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html", "yahoo_proxy"],
    ["Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17126; Pro)", "outlook"],
    ["Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Mail/3774", "messagerie"],
    ["Thunderbird/115.0", "messagerie"],
    ["python-requests/2.31", "robot"],
    ["curl/8.4.0", "robot"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1)", "robot"],
    ["Mozilla/5.0 Barracuda Sentinel", "robot"],
    ["HeadlessChrome/120", "robot"],
    ["quelque chose d'autre", "inconnu"],
  ];
  for (const [ua, famille] of cas) it(`${JSON.stringify(ua)} → ${famille}`, () => expect(familleAgent(ua)).toBe(famille));
});

describe("suivi-envois/regles — relevés automatiques, aux bornes", () => {
  it("Apple (protection de la vie privée) et robots : toujours automatiques", () => {
    expect(ouvertureAutomatique("apple_proxy", 3600)).toBe(true);
    expect(ouvertureAutomatique("robot", null)).toBe(true);
  });

  it(`n'importe qui moins de ${DELAI_MACHINE_S} s après l'envoi : machine ; à ${DELAI_MACHINE_S} s pile : non`, () => {
    expect(ouvertureAutomatique("navigateur", DELAI_MACHINE_S - 0.001)).toBe(true);
    expect(ouvertureAutomatique("navigateur", DELAI_MACHINE_S)).toBe(false);
    expect(clicAutomatique("navigateur", DELAI_MACHINE_S - 0.001)).toBe(true);
    expect(clicAutomatique("navigateur", DELAI_MACHINE_S)).toBe(false);
  });

  it(`proxy d'images moins de ${DELAI_PROXY_AUTOMATIQUE_S} s après l'envoi : automatique ; à ${DELAI_PROXY_AUTOMATIQUE_S} s pile : vraie ouverture`, () => {
    expect(ouvertureAutomatique("google_proxy", DELAI_PROXY_AUTOMATIQUE_S - 0.001)).toBe(true);
    expect(ouvertureAutomatique("google_proxy", DELAI_PROXY_AUTOMATIQUE_S)).toBe(false);
    expect(ouvertureAutomatique("yahoo_proxy", 59)).toBe(true);
    expect(ouvertureAutomatique("outlook", 59)).toBe(false);
  });

  it("un délai inconnu n'est pas tenu pour automatique (sauf Apple et robots)", () => {
    expect(ouvertureAutomatique("google_proxy", null)).toBe(false);
    expect(clicAutomatique("navigateur", null)).toBe(false);
  });

  it("un clic par un proxy d'images ou Apple : automatique, quel que soit le délai", () => {
    for (const a of ["google_proxy", "yahoo_proxy", "apple_proxy", "robot"] as const) expect(clicAutomatique(a, 86_400), a).toBe(true);
  });
});

describe("suivi-envois/regles — pageDuChemin et destinationDe", () => {
  it("rend la page de l'espace d'un dossier, « accueil » pour sa racine", () => {
    expect(pageDuChemin("/espace-client/BD-2026-0012/devis", "BD-2026-0012")).toBe("devis");
    expect(pageDuChemin("/espace-client/BD-2026-0012", "BD-2026-0012")).toBe("accueil");
    expect(pageDuChemin("/espace-client/BD-2026-0012/paiement?x=1", "BD-2026-0012")).toBe("paiement");
  });

  it("rien hors de l'espace du dossier, pour une page inconnue, ou pour la signature (app de l'équipe)", () => {
    expect(pageDuChemin("/espace-client/BD-2026-0013/devis", "BD-2026-0012")).toBeNull();
    expect(pageDuChemin("/autre/BD-2026-0012/devis", "BD-2026-0012")).toBeNull();
    expect(pageDuChemin("/espace-client/BD-2026-0012/inconnue", "BD-2026-0012")).toBeNull();
    expect(pageDuChemin("/espace-client/BD-2026-0012/signature", "BD-2026-0012")).toBeNull();
    expect(pageDuChemin("/espace-client/%E0%A4%A/devis", "BD")).toBeNull();
  });

  // Le chemin vient du navigateur : « constructor », « toString »… hérités d'Object ne sont pas des pages.
  it("une propriété héritée d'Object n'est pas une page de l'espace", () => {
    for (const nom of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(pageDuChemin(`/espace-client/BD-2026-0012/${nom}`, "BD-2026-0012"), nom).toBeNull();
    }
  });

  it("destinationDe : hôte et chemin, sans requête ni ancre, les jetons masqués", () => {
    expect(destinationDe("https://espace.bailly.fr/espace-client/BD-1/devis?jeton=SECRET#x")).toBe("espace.bailly.fr/espace-client/BD-1/devis");
    expect(destinationDe("https://crm.bailly.fr/signature/a1b2c3d4e5f6g7h8i9j0")).toBe("crm.bailly.fr/signature/…");
    expect(destinationDe("https://bailly.fr/")).toBe("bailly.fr");
    expect(destinationDe("https://bailly.fr/demenagement-international-longue-adresse")).toBe("bailly.fr/demenagement-international-longue-adresse");
    expect(destinationDe("pas une url?x=1")).toBe("pas une url");
    expect(destinationDe(`https://bailly.fr/${"a".repeat(500)}`).length).toBe(200);
  });
});

describe("suivi-envois/regles — equiperHtml", () => {
  it("réécrit chaque lien http(s) vers /t/c/<jeton>?l=<n> et garde les destinations", () => {
    const { html, liens } = equiperHtml('<a href="https://bailly.fr/a">Voir</a> <a class="b" href=\'https://bailly.fr/b?x=1&amp;y=2\'>Deux</a>', { base: `${BASE}/`, jeton: JETON });
    expect(html).toContain(`<a href="${BASE}/t/c/${JETON}?l=0">Voir</a>`);
    expect(html).toContain(`<a class="b" href='${BASE}/t/c/${JETON}?l=1'>Deux</a>`);
    expect(liens).toEqual([
      { indice: 0, libelle: "Voir", url: "https://bailly.fr/a", destination: "bailly.fr/a" },
      { indice: 1, libelle: "Deux", url: "https://bailly.fr/b?x=1&y=2", destination: "bailly.fr/b" },
    ]);
  });

  it("laisse tels quels mailto:, tel:, les ancres, les liens sans href et ceux déjà suivis", () => {
    const source = `<a href="mailto:a@b.fr">M</a><a href="tel:+33169103535">T</a><a href="#haut">H</a><a name="x">N</a><a href="${BASE}/t/c/zz?l=0">S</a><a href="javascript:alert(1)">J</a>`;
    const { html, liens } = equiperHtml(source, { base: BASE, jeton: JETON });
    expect(liens).toEqual([]);
    expect(html.startsWith(source)).toBe(true);
  });

  it("un même lien écrit deux fois avec le même libellé : un seul indice", () => {
    const { liens, html } = equiperHtml('<a href="https://x.fr">Go</a><a href="https://x.fr">Go</a><a href="https://x.fr">Autre</a>', { base: BASE, jeton: JETON });
    expect(liens.map((l) => l.indice)).toEqual([0, 1]);
    expect(html.match(/\?l=0/g)).toHaveLength(2);
  });

  it(`au plus ${LIENS_MAX} liens suivis ; les suivants restent tels quels`, () => {
    const source = Array.from({ length: LIENS_MAX + 5 }, (_, i) => `<a href="https://x.fr/${i}">L${i}</a>`).join("");
    const { liens, html } = equiperHtml(source, { base: BASE, jeton: JETON });
    expect(liens).toHaveLength(LIENS_MAX);
    expect(html).toContain(`<a href="https://x.fr/${LIENS_MAX}">`);
    expect(html).not.toContain(`<a href="https://x.fr/${LIENS_MAX - 1}">`);
  });

  it("le pixel se pose avant le dernier </body>, sinon à la fin", () => {
    const pixel = `<img src="${BASE}/t/o/${JETON}.gif"`;
    const avec = equiperHtml("<html><body><p>a</p></body><!-- </body> --></body></html>", { base: BASE, jeton: JETON }).html;
    expect(avec.indexOf(pixel)).toBeGreaterThan(avec.indexOf("<!-- </body> -->"));
    expect(avec.endsWith("</body></html>")).toBe(true);
    const sans = equiperHtml("<p>a</p>", { base: BASE, jeton: JETON }).html;
    expect(sans.startsWith("<p>a</p><img")).toBe(true);
  });

  it("le libellé : le texte du lien sans balises ni flèches, sinon le texte de l'image", () => {
    const { liens } = equiperHtml('<a href="https://x.fr/1"><b>Voir</b> &rsaquo;</a><a href="https://x.fr/2"><img alt="Logo &amp; co"></a><a href="https://x.fr/3"><img src=y></a>', { base: BASE, jeton: JETON });
    expect(liens.map((l) => l.libelle)).toEqual(["Voir", "Logo & co", null]);
  });

  it("le GIF transparent est un GIF valide d'un pixel (en-tête GIF89a, 1 × 1, fin 0x3B)", () => {
    const b = Buffer.from(GIF_TRANSPARENT, "base64");
    expect(b.subarray(0, 6).toString("latin1")).toBe("GIF89a");
    expect(b.readUInt16LE(6)).toBe(1);
    expect(b.readUInt16LE(8)).toBe(1);
    expect(b.at(-1)).toBe(0x3b);
  });
});

describe("suivi-envois — l'équipement d'un e-mail par le serveur", () => {
  const ID = "11111111-2222-4333-8444-555555555555";
  let appels: { sql: string; p: unknown[] }[];

  beforeEach(() => {
    (globalThis as { __suiviPret?: unknown }).__suiviPret = undefined;
    appels = [];
    m.lire = vi.fn(async (sql: string, p: unknown[] = []) => {
      appels.push({ sql, p });
      return [];
    });
    vi.stubEnv("ESPACE_CLIENT_SECRET", "secret-de-test");
    vi.stubEnv("SUIVI_URL", "https://plateforme.bailly.fr/");
    vi.stubEnv("SUIVI_EMAILS", "");
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    (globalThis as { __suiviPret?: unknown }).__suiviPret = undefined;
  });

  it("réécrit les liens, pose le pixel et garde les destinations chiffrées (jamais en clair)", async () => {
    const { equiperEmail } = await import("@/lib/suivi-envois");
    const { dechiffrer, lireJetonEnvoi } = await import("@/lib/suivi-envois/jetons");
    const html = await equiperEmail(ID, '<a href="https://espace.bailly.fr/connexion?jeton=SECRET">Entrer</a></body>');
    const jeton = /\/t\/c\/([^?]+)\?l=0/.exec(html)?.[1];
    expect(jeton).toBeTruthy();
    expect(lireJetonEnvoi(jeton)).toBe(ID);
    expect(html).toContain(`https://plateforme.bailly.fr/t/o/${jeton}.gif`);
    expect(html).not.toContain("SECRET");
    const insertion = appels.find((a) => a.sql.includes("insert into public.envois_liens"))!;
    expect(insertion.p[0]).toBe(ID);
    expect(insertion.p[3]).toEqual(["espace.bailly.fr/connexion"]);
    expect(JSON.stringify(insertion.p)).not.toContain("SECRET");
    expect(dechiffrer((insertion.p[4] as string[])[0])).toBe("https://espace.bailly.fr/connexion?jeton=SECRET");
  });

  it("SUIVI_EMAILS=desactive (ou off, 0) : l'e-mail part tel quel", async () => {
    const { equiperEmail } = await import("@/lib/suivi-envois");
    for (const v of ["desactive", "désactivé", "OFF", "0"]) {
      vi.stubEnv("SUIVI_EMAILS", v);
      expect(await equiperEmail(ID, '<a href="https://x.fr">x</a>'), v).toBe('<a href="https://x.fr">x</a>');
    }
    expect(appels).toHaveLength(0);
  });

  it("en démonstration : tel quel", async () => {
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
    const { equiperEmail } = await import("@/lib/suivi-envois");
    expect(await equiperEmail(ID, "<p>x</p>")).toBe("<p>x</p>");
  });

  it("sans base (pas de DATABASE_URL utilisable) : tel quel", async () => {
    m.lire = null;
    const { equiperEmail } = await import("@/lib/suivi-envois");
    expect(await equiperEmail(ID, '<a href="https://x.fr">x</a>')).toBe('<a href="https://x.fr">x</a>');
  });

  it("les destinations qui ne se gardent pas : l'e-mail repart TEL QUEL (un lien suivi perdu ne mènerait nulle part)", async () => {
    m.lire = vi.fn(async (sql: string) => {
      if (sql.includes("envois_liens")) throw new Error("insertion refusée");
      return [];
    });
    const { equiperEmail } = await import("@/lib/suivi-envois");
    const source = '<a href="https://x.fr">x</a>';
    expect(await equiperEmail(ID, source)).toBe(source);
  });

  it("un identifiant d'envoi invalide ne fait pas lever : tel quel", async () => {
    const { equiperEmail } = await import("@/lib/suivi-envois");
    expect(await equiperEmail("pas-un-uuid", '<a href="https://x.fr">x</a>')).toBe('<a href="https://x.fr">x</a>');
  });

  it("un e-mail sans lien reçoit le pixel, sans écriture des liens", async () => {
    const { equiperEmail } = await import("@/lib/suivi-envois");
    const html = await equiperEmail(ID, "<p>x</p>");
    expect(html).toMatch(/<img src="https:\/\/plateforme\.bailly\.fr\/t\/o\/[^"]+\.gif"/);
    expect(appels.some((a) => a.sql.includes("insert into public.envois_liens"))).toBe(false);
  });

  it("un jeton d'envoi falsifié ne se relit pas", async () => {
    const { jetonEnvoi, lireJetonEnvoi } = await import("@/lib/suivi-envois/jetons");
    const j = jetonEnvoi(ID);
    expect(lireJetonEnvoi(j)).toBe(ID);
    expect(lireJetonEnvoi(`${j}.gif`)).toBe(ID);
    expect(lireJetonEnvoi(`${j.slice(0, -1)}${j.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(lireJetonEnvoi("")).toBeNull();
    expect(lireJetonEnvoi(null)).toBeNull();
    vi.stubEnv("ESPACE_CLIENT_SECRET", "autre");
    expect(lireJetonEnvoi(j)).toBeNull();
  });

  it("l'empreinte d'une adresse IP n'est jamais l'adresse", async () => {
    const { empreinteIp } = await import("@/lib/suivi-envois/jetons");
    const e = empreinteIp("203.0.113.7, 10.0.0.1");
    expect(e).toHaveLength(16);
    expect(e).not.toContain("203");
    expect(empreinteIp("203.0.113.7")).toBe(e);
    expect(empreinteIp("")).toBeNull();
    expect(empreinteIp(null)).toBeNull();
  });
});

describe("suivi-envois — les événements (pixel, clics, portail, Brevo)", () => {
  const ID = "11111111-2222-4333-8444-555555555555";
  let appels: { sql: string; p: unknown[] }[];
  let liens: { libelle: string | null; destination: string; url_chiffree: string }[];
  let envoi: { id: string; reference: string | null; secondes: number }[];

  beforeEach(() => {
    (globalThis as { __suiviPret?: unknown }).__suiviPret = undefined;
    appels = [];
    liens = [];
    envoi = [{ id: ID, reference: "BD-2026-0147", secondes: 3600 }];
    m.lire = vi.fn(async (sql: string, p: unknown[] = []) => {
      appels.push({ sql, p });
      if (sql.includes("from public.envois_liens")) return liens;
      if (sql.includes("from public.envois where id")) return envoi;
      if (sql.includes("returning id::text")) return [{ id: "1" }];
      return [];
    });
    vi.stubEnv("ESPACE_CLIENT_SECRET", "secret-de-test");
    vi.stubEnv("SUIVI_EMAILS", "");
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    (globalThis as { __suiviPret?: unknown }).__suiviPret = undefined;
  });

  const inserts = (table: string) => appels.filter((a) => a.sql.includes(`insert into public.${table}`));

  it("lienSuivi : la destination relue dans la base, déchiffrée", async () => {
    const { lienSuivi } = await import("@/lib/suivi-envois");
    const { chiffrer } = await import("@/lib/suivi-envois/jetons");
    liens = [{ libelle: "Entrer", destination: "espace.bailly.fr/connexion", url_chiffree: chiffrer("https://espace.bailly.fr/connexion?jeton=S") }];
    expect(await lienSuivi(ID, 0)).toEqual({ url: "https://espace.bailly.fr/connexion?jeton=S", libelle: "Entrer", destination: "espace.bailly.fr/connexion" });
  });

  it("lienSuivi : jamais une redirection ouverte — indice hors bornes, adresse non http(s), chiffre altéré : rien", async () => {
    const { lienSuivi } = await import("@/lib/suivi-envois");
    const { chiffrer } = await import("@/lib/suivi-envois/jetons");
    for (const i of [-1, 1000, 1.5, Number.NaN]) expect(await lienSuivi(ID, i), String(i)).toBeNull();
    liens = [{ libelle: null, destination: "x", url_chiffree: chiffrer("javascript:alert(1)") }];
    expect(await lienSuivi(ID, 0)).toBeNull();
    const bon = chiffrer("https://bailly.fr");
    liens = [{ libelle: null, destination: "x", url_chiffree: `${bon.slice(0, -2)}AA` }];
    expect(await lienSuivi(ID, 0)).toBeNull();
    liens = [];
    expect(await lienSuivi(ID, 0)).toBeNull();
  });

  it("noterOuverture : la famille de l'agent, l'empreinte de l'IP (jamais l'IP), le drapeau automatique", async () => {
    const { noterOuverture } = await import("@/lib/suivi-envois");
    await noterOuverture(ID, { ua: "Mozilla/5.0", ip: "203.0.113.7" });
    const [ins] = inserts("envois_evenements");
    expect(ins.p[0]).toBe(ID);
    expect(ins.p[2]).toBe("apple_proxy");
    expect(ins.p[3]).toHaveLength(16);
    expect(JSON.stringify(ins.p)).not.toContain("203.0.113.7");
    expect(ins.p[4]).toBe(true);
  });

  it("noterOuverture : un envoi inconnu (ou un SMS) n'inscrit rien ; une base qui lève ne fait pas lever", async () => {
    const { noterOuverture } = await import("@/lib/suivi-envois");
    envoi = [];
    await noterOuverture(ID, { ua: "x", ip: null });
    expect(inserts("envois_evenements")).toHaveLength(0);
    m.lire = vi.fn(async () => {
      throw new Error("base");
    });
    (globalThis as { __suiviPret?: unknown }).__suiviPret = undefined;
    await expect(noterOuverture(ID, { ua: "x", ip: null })).resolves.toBeUndefined();
  });

  it("noterClic : un clic d'antivirus est marqué automatique", async () => {
    const { noterClic } = await import("@/lib/suivi-envois");
    await noterClic(ID, { indice: 0, libelle: "Entrer", destination: "espace.bailly.fr" }, { ua: "Mozilla/5.0 Proofpoint", ip: "1.2.3.4" });
    const [ins] = inserts("envois_evenements");
    expect(ins.p[5]).toBe("robot");
    expect(ins.p[7]).toBe(true);
  });

  it("noterPortail : rien pour un robot, rien quand le suivi est coupé ; la page bornée à 40 caractères", async () => {
    const { noterPortail } = await import("@/lib/suivi-envois");
    const v = { page: "p".repeat(100), reference: "BD-1", ecDossierId: null, crmDossierId: 7, envoiId: null };
    await noterPortail(v, { ua: "curl/8", ip: null });
    expect(inserts("envois_evenements")).toHaveLength(0);
    vi.stubEnv("SUIVI_EMAILS", "off");
    await noterPortail(v, { ua: "Mozilla/5.0 (Macintosh) Safari/605", ip: null });
    expect(inserts("envois_evenements")).toHaveLength(0);
    vi.stubEnv("SUIVI_EMAILS", "");
    await noterPortail(v, { ua: "Mozilla/5.0 (Macintosh) Safari/605", ip: null });
    expect(inserts("envois_evenements")[0].p[2]).toBe("p".repeat(40));
  });

  it("noterBrevo : rend le nombre inscrit, saute les identifiants vides ; sans base, lève (le webhook répond en erreur)", async () => {
    const { noterBrevo } = await import("@/lib/suivi-envois");
    const ev = { type: "delivre" as const, messageId: " <m1@smtp> ", cle: "k1", genre: "delivered", raison: null, quand: null };
    expect(await noterBrevo([ev, { ...ev, messageId: "  " }])).toBe(1);
    expect(inserts("envois_evenements")[0].p[0]).toBe("<m1@smtp>");
    m.lire = null;
    (globalThis as { __suiviPret?: unknown }).__suiviPret = undefined;
    await expect(noterBrevo([ev])).rejects.toThrow("Suivi indisponible (base).");
  });

  it("requeteDe : l'agent et l'adresse transmise", async () => {
    const { requeteDe } = await import("@/lib/suivi-envois");
    expect(requeteDe(new Headers({ "user-agent": "UA", "x-real-ip": "9.9.9.9" }))).toEqual({ ua: "UA", ip: "9.9.9.9" });
    expect(requeteDe(new Headers())).toEqual({ ua: null, ip: null });
  });
});
