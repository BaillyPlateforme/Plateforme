import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MESSAGE_TELEPHONE,
  adresseSchema,
  aujourdhuiParis,
  createRequestSchema,
  erreurEnFrancais,
  itemSchema,
  messageDeRefus,
  telephoneValide,
  volumeSchema,
} from "@/lib/schemas";

/*
 * Le schéma de la demande du formulaire public (lib/schemas.ts) : la seule
 * porte ouverte à n'importe qui sur Internet. Le nom du client s'écrit dans
 * « Bonjour {nom}, » des e-mails de Bailly : il est borné, limité à une liste
 * de caractères, et ne peut pas porter d'adresse web.
 */

const base = { depart: {}, arrivee: {} };
const demande = (client: Record<string, unknown>, reste: Record<string, unknown> = {}) =>
  createRequestSchema.safeParse({ ...base, ...reste, client: { email: "jean@exemple.fr", ...client } });
const nomAccepte = (nom: string) => demande({ nom }).success;
const emailAccepte = (email: string) => demande({ nom: "Jean", email }).success;

describe("createRequestSchema — le nom du client", () => {
  it.each([
    "Jean-Pierre O'Neil",
    "Jean-Pierre O’Neil",
    "Müller & Fils",
    "Société Générale (SG)",
    "M. et Mme Dupont",
    "Dupont — Martin",
    "Dupont – Martin",
    "Saint-Étienne / Lyon",
    "3+2 Logistique",
    "J.-P. Martin",
    "S.A.R.L. Dupont",
    "Dupont, Durand et associés",
    "Ngô Thị Lan",
    "Zoë Łukasz Øystein",
    "李小龙",
    "محمد",
    "Ἀλέξανδρος",
    "A",
  ])("accepte le nom légitime « %s »", (nom) => {
    expect(nomAccepte(nom)).toBe(true);
  });

  it("garde le nom tel quel, espaces de bord retirés", () => {
    const r = demande({ nom: "   Jean-Pierre O'Neil  " });
    expect(r.success && r.data.client.nom).toBe("Jean-Pierre O'Neil");
  });

  it("accepte exactement 80 caractères et refuse le 81e", () => {
    expect(nomAccepte("a".repeat(80))).toBe(true);
    expect(nomAccepte("a".repeat(81))).toBe(false);
  });

  it("refuse une chaîne de 100 000 caractères", () => {
    expect(nomAccepte("a".repeat(100_000))).toBe(false);
  });

  it.each(["", "   ", "\t\n"])("refuse un nom vide ou blanc (%j)", (nom) => {
    expect(nomAccepte(nom)).toBe(false);
  });

  it.each([
    ["une balise", "<script>alert(1)</script>"],
    ["une balise img", "Jean <img src=x onerror=alert(1)>"],
    ["un guillemet double", 'Jean "le grand"'],
    ["un point-virgule", "Jean; DROP TABLE requests"],
    ["un deux-points (javascript:)", "javascript:alert(1)"],
    ["un arobase", "jean@evil"],
    ["un dièse", "Jean #1"],
    ["des accolades (variable de modèle)", "{{lien_estimation}}"],
    ["des crochets", "[Jean](https)"],
    ["un retour à la ligne", "Jean\nBcc: x@y.fr"],
    ["un retour chariot", "Jean\rDupont"],
    ["une tabulation", "Jean\tDupont"],
    ["un octet nul", "Jean\u0000Dupont"],
    ["un caractère de contrôle", "Jean\u0007Dupont"],
    ["un RTL override", "Jean‮etnoD"],
    ["un espace de largeur nulle", "Jean​Dupont"],
    ["un joint de largeur nulle", "Jean‍Dupont"],
    ["un émoji", "Jean 😀"],
    ["un point idéographique", "evil。com"],
    ["un point pleine chasse", "evil．com"],
    ["une barre oblique inverse", "Jean\\Dupont"],
    ["un signe égal (formule de tableur)", "=HYPERLINK(1)"],
    ["un pourcentage (encodage d'URL)", "evil%2Ecom"],
  ])("refuse %s", (_, nom) => {
    expect(nomAccepte(nom)).toBe(false);
  });

  it.each([
    "evil.com",
    "EVIL.COM",
    "Jean evil.fr",
    "bit.ly",
    "bailly-paiement.paris",
    "site.it",
    "a.co",
    "192.168.1.1",
    "evil.c0m",
    "Payez sur bailly-paiement.fr",
    // Homoglyphes cyrilliques : ce sont des lettres, le point collé suffit à refuser.
    "pаypal.cоm",
  ])("refuse l'adresse web « %s » dans le nom", (nom) => {
    const r = demande({ nom });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => /adresse web/.test(i.message))).toBe(true);
  });

  it("dit au visiteur pourquoi son nom est refusé (liste de caractères)", () => {
    const r = demande({ nom: "Jean <b>" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/ne peut contenir que des lettres/);
  });

  it("laisse passer un point suivi d'un espace ou d'une seule lettre (initiales, abréviations)", () => {
    expect(nomAccepte("M. Dupont")).toBe(true);
    expect(nomAccepte("Dupont S.A.")).toBe(true);
    expect(nomAccepte("Dupont Cie.")).toBe(true);
  });
});

describe("createRequestSchema — l'e-mail du client", () => {
  it.each([
    "jean@exemple.fr",
    "jean+demenagement@gmail.com",
    "JEAN.DUPONT@GMAIL.COM",
    "o'neil@exemple.fr",
    "jean@xn--mller-kva.de",
    "  jean@exemple.fr  ",
  ])("accepte « %s »", (email) => {
    expect(emailAccepte(email)).toBe(true);
  });

  it("garde l'alias +étiquette et la casse (le plafond par e-mail les normalise lui-même)", () => {
    const r = demande({ nom: "Jean", email: "  Jean+Test@Gmail.com " });
    expect(r.success && r.data.client.email).toBe("Jean+Test@Gmail.com");
  });

  it.each([
    "jean",
    "jean@",
    "@exemple.fr",
    "jean@exemple",
    "jean@@exemple.fr",
    "jean@exemple.fr\r\nBcc: victime@exemple.fr",
    "jean@exemple.fr,autre@exemple.fr",
    "jean@exemple.fr;autre@exemple.fr",
    "jean dupont@exemple.fr",
    "<jean@exemple.fr>",
    "\"jean\"@exemple.fr",
    "jean@exemple.fr\u0000",
    "javascript:alert(1)//@exemple.fr",
  ])("refuse l'adresse hostile ou mal formée %j", (email) => {
    expect(emailAccepte(email)).toBe(false);
  });

  it("borne l'adresse à 254 caractères", () => {
    const local = "a".repeat(64);
    const domaine = (n: number) => `${"b".repeat(n)}.fr`;
    const a254 = `${local}@${domaine(254 - 64 - 1 - 3)}`;
    expect(a254.length).toBe(254);
    // La longueur est vérifiée AVANT la forme : 255 caractères sont refusés quoi qu'il arrive.
    expect(emailAccepte(`${local}@${domaine(254 - 64 - 1 - 3 + 1)}`)).toBe(false);
    expect(emailAccepte("a".repeat(100_000) + "@exemple.fr")).toBe(false);
  });

  it("exige un e-mail", () => {
    expect(createRequestSchema.safeParse({ ...base, client: { nom: "Jean" } }).success).toBe(false);
  });
});

describe("createRequestSchema — le téléphone et les champs bornés", () => {
  it("accepte un téléphone de 30 caractères et refuse le 31e", () => {
    const trente = "+33 (0) 6 . 12 . 34 . 56 . 78 ";
    expect(trente.length).toBe(30);
    expect(demande({ nom: "Jean", tel: trente }).success).toBe(true);
    expect(demande({ nom: "Jean", tel: `${trente} ` }).success).toBe(false);
    expect(demande({ nom: "Jean", tel: "0".repeat(31) }).success).toBe(false);
  });

  it("le téléphone est facultatif ; vide, il vaut « pas de téléphone »", () => {
    expect(demande({ nom: "Jean" }).success).toBe(true);
    expect(demande({ nom: "Jean", tel: "" }).success).toBe(true);
    expect(demande({ nom: "Jean", tel: "   " }).success).toBe(true);
  });

  // Campagne du 18/11/2026 : « 06 12 » passait, et partait dans la fiche Créagidem.
  it.each(["06 12 34 56 78", "0612345678", "06.12.34.56.78", "06-12-34-56-78", "01 69 10 35 35", "+33 6 12 34 56 78", "+33 (0)6 12 34 56 78", "+44 20 7946 0958", "+1 212 555 0142", "0044 20 7946 0958", "+352 621 123 456"])(
    "accepte le numéro « %s »",
    (tel) => {
      expect(telephoneValide(tel)).toBe(true);
      expect(demande({ nom: "Jean", tel }).success).toBe(true);
    },
  );

  it.each(["06 12", "0612", "06 12 34 56 7", "06 12 34 56 789", "6 12 34 56 78", "+33 6", "06 12 34 56 78 ou 07…", "appelez-moi", "0".repeat(30), "+" + "1".repeat(16)])(
    "refuse le numéro « %s », avec un message en français",
    (tel) => {
      expect(telephoneValide(tel)).toBe(false);
      const r = demande({ nom: "Jean", tel });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.some((i) => i.message === MESSAGE_TELEPHONE)).toBe(true);
    },
  );

  it("borne le nom de l'espace pro (80) et son code (40)", () => {
    expect(demande({ nom: "Jean" }, { espace: "x".repeat(80), espace_code: "y".repeat(40) }).success).toBe(true);
    expect(demande({ nom: "Jean" }, { espace: "x".repeat(81) }).success).toBe(false);
    expect(demande({ nom: "Jean" }, { espace_code: "y".repeat(41) }).success).toBe(false);
  });

  it.each([
    ["formule", { formule: "gratuite" }],
    ["type_client", { type_client: "admin" }],
    ["assurance", { assurance: "illimitee" }],
  ])("refuse une valeur hors liste pour %s", (_, reste) => {
    expect(demande({ nom: "Jean" }, reste).success).toBe(false);
  });

  it("refuse une distance négative", () => {
    expect(demande({ nom: "Jean" }, { distance_km: -10 }).success).toBe(false);
  });

  it("ne laisse pas un objet piégé polluer le prototype", () => {
    const brut = JSON.parse('{"client":{"nom":"Jean","email":"jean@exemple.fr","__proto__":{"admin":true}},"depart":{},"arrivee":{},"__proto__":{"pollue":true}}');
    const r = createRequestSchema.safeParse(brut);
    expect(r.success).toBe(true);
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  // La ville s'écrit dans l'e-mail que Bailly envoie à l'adresse saisie (email-render.ts : « Paris → Lyon ») :
  // comme le nom, elle ne doit pas pouvoir porter un lien d'hameçonnage.
  it("refuse une adresse web dans la ville de départ, recopiée dans l'e-mail au client", () => {
    const r = demande({ nom: "Service client" }, { depart: { ville: "Réglez sur bailly-paiement.fr" } });
    expect(r.success).toBe(false);
  });
});

describe("adresseSchema, itemSchema, volumeSchema", () => {
  it("refuse un étage négatif ou décimal, une surface et un portage négatifs", () => {
    expect(adresseSchema.safeParse({ etage: -1 }).success).toBe(false);
    expect(adresseSchema.safeParse({ etage: 1.5 }).success).toBe(false);
    expect(adresseSchema.safeParse({ surface: -20 }).success).toBe(false);
    expect(adresseSchema.safeParse({ portage_m: -5 }).success).toBe(false);
  });

  it("refuse une adresse vide quand elle est donnée", () => {
    expect(adresseSchema.safeParse({ adresse: "" }).success).toBe(false);
  });

  it("refuse une quantité nulle ou un volume négatif dans la liste", () => {
    expect(itemSchema.safeParse({ label: "Armoire", quantite: 0 }).success).toBe(false);
    expect(itemSchema.safeParse({ label: "Armoire", volume_unitaire_m3: -1 }).success).toBe(false);
    expect(itemSchema.safeParse({ label: "" }).success).toBe(false);
  });

  it("refuse une méthode de volume inconnue et une liste vide", () => {
    expect(volumeSchema.safeParse({ method: "magie", volume_m3: 10 }).success).toBe(false);
    expect(volumeSchema.safeParse({ method: "list", items: [] }).success).toBe(false);
    expect(volumeSchema.safeParse({ method: "ai", photos: [] }).success).toBe(false);
    expect(volumeSchema.safeParse({ method: "explicit", volume_m3: -3 }).success).toBe(false);
  });

  it("refuse NaN et l'infini comme volume", () => {
    expect(volumeSchema.safeParse({ method: "explicit", volume_m3: Number.NaN }).success).toBe(false);
    expect(volumeSchema.safeParse({ method: "explicit", volume_m3: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  // Campagne du 18/11/2026 : une demande à 0 m³ était chiffrée 750 €.
  it("refuse un volume nul ou négatif, et le dit en français ; accepte le moindre volume", () => {
    for (const v of [0, -12, -0.01]) {
      const r = volumeSchema.safeParse({ method: "explicit", volume_m3: v });
      expect(r.success, String(v)).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("Le volume à déménager doit être supérieur à 0 m³.");
    }
    expect(volumeSchema.safeParse({ method: "explicit", volume_m3: 0.5 }).success).toBe(true);
  });
});

describe("createRequestSchema — la date souhaitée, jamais dans le passé (heure de Paris)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("le 18/11/2026 à 23 h 30 UTC, il est déjà le 19 à Paris : le 18 est passé, le 19 ne l'est pas", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T23:30:00Z"));
    expect(aujourdhuiParis()).toBe("2026-11-19");
    const passee = demande({ nom: "Jean" }, { date_souhaitee: "2026-11-18" });
    expect(passee.success).toBe(false);
    if (!passee.success) expect(passee.error.issues[0].message).toBe("La date souhaitée est déjà passée : choisissez une date à venir.");
    expect(demande({ nom: "Jean" }, { date_souhaitee: "2026-11-19" }).success).toBe(true);
  });

  it("le 30/06/2025 : refusé (campagne du 18/11/2026) ; une date à venir, ou pas de date : accepté", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T09:00:00Z"));
    expect(demande({ nom: "Jean" }, { date_souhaitee: "2025-06-30" }).success).toBe(false);
    expect(demande({ nom: "Jean" }, { date_souhaitee: "2027-03-15" }).success).toBe(true);
    expect(demande({ nom: "Jean" }, { date_souhaitee: "" }).success).toBe(true);
  });

  it("une date impossible reste « n'est pas valide » (premier message)", () => {
    const r = demande({ nom: "Jean" }, { date_souhaitee: "2027-02-30" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("La date souhaitée n'est pas valide.");
  });
});

describe("erreurEnFrancais — chaque refus visible est en français, et nomme le champ", () => {
  const ANGLAIS = /Too (big|small)|expected|Invalid|Required|undefined|null/;
  const refus = (corps: Record<string, unknown>) => {
    const r = createRequestSchema.safeParse({ ...base, client: { nom: "Jean", email: "jean@exemple.fr" }, ...corps }, { error: erreurEnFrancais });
    expect(r.success).toBe(false);
    return r.success ? "" : messageDeRefus(r.error);
  };

  it("un nom de 86 caractères (campagne, n° 99)", () => {
    const m = refus({ client: { nom: "Marie-Charlotte Élisabeth-Joséphine de Montmorency-Laval de La Rochefoucauld-Liancourt", email: "jean@exemple.fr" } });
    expect(m).toBe("Texte trop long : le nom ne doit pas dépasser 80 caractères.");
  });

  it("un message de 6 000 caractères (campagne, n° 98)", () => {
    expect(refus({ commentaire: "x".repeat(6000) })).toBe(`Texte trop long : votre message ne doit pas dépasser ${(5000).toLocaleString("fr-FR")} caractères.`);
  });

  it("un volume négatif (campagne, n° 100)", () => {
    expect(refus({ volume: { method: "explicit", volume_m3: -12 } })).toBe("Le volume à déménager doit être supérieur à 0 m³.");
  });

  it("une ville de départ trop longue, un étage négatif, une liste de meubles vide", () => {
    expect(refus({ depart: { ville: "a".repeat(101) } })).toBe("Texte trop long : la ville de départ ne doit pas dépasser 100 caractères.");
    expect(refus({ arrivee: { etage: -1 } })).toBe("Valeur trop petite pour l'étage d'arrivée : 0 au moins.");
    expect(refus({ volume: { method: "list", items: [] } })).toBe("Ajoutez au moins un meuble à la liste.");
  });

  it.each([
    ["nom vide", { client: { nom: "", email: "jean@exemple.fr" } }],
    ["client absent", { client: undefined }],
    ["formule inconnue", { formule: "gratuite" }],
    ["méthode de volume inconnue", { volume: { method: "magie", volume_m3: 10 } }],
    ["étage décimal", { depart: { etage: 2.5 } }],
    ["période trop longue", { flexibilite: "x".repeat(121) }],
    ["société trop longue", { societe: "x".repeat(121) }],
    ["trop d'objets lourds", { charges_lourdes: Array.from({ length: 31 }, () => ({ label: "x" })) }],
    ["distance négative", { distance_km: -1 }],
  ])("%s : un message français, sans détail technique", (_, corps) => {
    const m = refus(corps as Record<string, unknown>);
    expect(m).not.toMatch(ANGLAIS);
    expect(m.length).toBeGreaterThan(10);
  });

  it("un corps qui n'est pas un objet : le message général, en français", () => {
    const r = createRequestSchema.safeParse([], { error: erreurEnFrancais });
    expect(!r.success && messageDeRefus(r.error)).toBe("Votre demande n'a pas pu être enregistrée : vérifiez les informations saisies, puis réessayez.");
  });

  it("un message propre au schéma l'emporte (adresse web dans le nom, e-mail)", () => {
    expect(refus({ client: { nom: "Promo sur bailly-promo.fr", email: "jean@exemple.fr" } })).toBe("Le nom ne peut pas contenir d'adresse web.");
    expect(refus({ client: { nom: "Jean", email: "pas-un-email" } })).toBe("L'adresse e-mail n'est pas valide.");
  });
});
