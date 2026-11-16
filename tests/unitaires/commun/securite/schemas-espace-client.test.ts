import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptationsSchema,
  avarieSchema,
  conditionsLivraisonSchema,
  connexionSchema,
  declarationValeursSchema,
  erreursDe,
  estSamedi,
  ficheCartonsSchema,
  lireDeclaration,
  lireReponseDevis,
  messageSchema,
  reponseDevisSchemas,
  signatureDevisSchema,
  TAILLE_MAX,
  TELEPHONE_FR,
  TOTAL_MAX,
  TYPES_PHOTOS,
  verifierFichier,
  verifierPhotos,
} from "@/lib/espace-client/schemas";

/* Les formulaires du client : revalidés par le serveur avec le MÊME schéma (le navigateur ne compte pas). */

const fd = (champs: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, x);
  return f;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("TELEPHONE_FR", () => {
  it.each(["0612345678", "06 12 34 56 78", "06.12.34.56.78", "06-12-34-56-78", "+33 6 12 34 56 78", "+33612345678", "0033 6 12 34 56 78", "01 69 10 35 35"])(
    "accepte « %s »",
    (t) => expect(TELEPHONE_FR.test(t)).toBe(true),
  );

  it.each([
    "0012345678",
    "06 12 34 56 7",
    "06 12 34 56 789",
    "+44 20 7946 0958",
    "06 12 34 56 78 ; DROP",
    "<06 12 34 56 78>",
    "06\r\n12 34 56 78",
    "06\n12 34 56 78",
    "06 12\t34 56 78",
    "+33\n6 12 34 56 78",
    "06  12 34 56 78",
    "٠٦١٢٣٤٥٦٧٨",
    "",
  ])("refuse %j", (t) => expect(TELEPHONE_FR.test(t)).toBe(false));
});

describe("connexionSchema", () => {
  it("accepte une adresse valide, refuse une injection d'en-tête", () => {
    expect(connexionSchema.safeParse({ email: "jean@exemple.fr" }).success).toBe(true);
    expect(connexionSchema.safeParse({ email: "jean@exemple.fr\r\nBcc: x@y.fr" }).success).toBe(false);
    expect(connexionSchema.safeParse({ email: "jean" }).success).toBe(false);
    expect(connexionSchema.safeParse({}).success).toBe(false);
  });
});

describe("conditionsLivraisonSchema", () => {
  const valide = {
    adresse_livraison: "12 rue des Lilas, 75011 Paris",
    etage: "2",
    ascenseur: "non",
    asc_largeur: "",
    asc_profondeur: "",
    asc_hauteur: "",
    escalier: "droit",
    distance_portage_m: "10",
    acces_poids_lourd: "oui",
    stationnement: "facile",
    particularites_rue: [] as string[],
    monte_meuble: "non",
    horaires_restreints: "",
    commentaire: "",
    certification: "on",
  };
  const essai = (modif: Record<string, unknown>) => conditionsLivraisonSchema.safeParse({ ...valide, ...modif });

  it("accepte un questionnaire complet", () => {
    const r = essai({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.etage).toBe(2);
      expect(r.data.ascenseur).toBe(false);
      expect(r.data.commentaire).toBeNull();
    }
  });

  it.each(["-1", "10", "2.5", "2e1", "0x2", " ", "deux"])("refuse l'étage %j", (etage) => {
    expect(essai({ etage }).success).toBe(false);
  });

  it("refuse une distance de portage hors de 0 à 500", () => {
    expect(essai({ distance_portage_m: "501" }).success).toBe(false);
    expect(essai({ distance_portage_m: "-1" }).success).toBe(false);
    expect(essai({ distance_portage_m: "9".repeat(400) }).success).toBe(false);
  });

  it("exige les mesures de l'ascenseur, entre 40 et 400 cm, en chiffres seulement", () => {
    const avec = (l: string, p = "120", h = "200") => essai({ ascenseur: "oui", asc_largeur: l, asc_profondeur: p, asc_hauteur: h });
    expect(avec("80").success).toBe(true);
    expect(avec("39").success).toBe(false);
    expect(avec("401").success).toBe(false);
    expect(avec("").success).toBe(false);
    expect(avec("80.5").success).toBe(false);
    expect(avec("1e2").success).toBe(false);
    expect(avec("<b>").success).toBe(false);
  });

  it("au 3e étage sans ascenseur, refuse « pas de monte-meuble »", () => {
    expect(essai({ etage: "3", monte_meuble: "non" }).success).toBe(false);
    expect(essai({ etage: "3", monte_meuble: "a_evaluer" }).success).toBe(true);
  });

  it("refuse « Aucune » avec une autre particularité, et une particularité inventée", () => {
    expect(essai({ particularites_rue: ["Aucune", "Rue piétonne"] }).success).toBe(false);
    expect(essai({ particularites_rue: ["<script>"] }).success).toBe(false);
  });

  it("exige la certification exactement « on »", () => {
    expect(essai({ certification: "true" }).success).toBe(false);
    expect(essai({ certification: undefined }).success).toBe(false);
  });

  it("borne l'adresse (8 à 200), les horaires (300) et le commentaire (1000)", () => {
    expect(essai({ adresse_livraison: "court" }).success).toBe(false);
    expect(essai({ adresse_livraison: "a".repeat(201) }).success).toBe(false);
    expect(essai({ horaires_restreints: "a".repeat(301) }).success).toBe(false);
    expect(essai({ commentaire: "a".repeat(1001) }).success).toBe(false);
    expect(essai({ commentaire: "a".repeat(100_000) }).success).toBe(false);
  });

  it("refuse une énumération hors liste", () => {
    expect(essai({ escalier: "ascenseur-spatial" }).success).toBe(false);
    expect(essai({ stationnement: "partout" }).success).toBe(false);
    expect(essai({ acces_poids_lourd: "peut-être" }).success).toBe(false);
  });
});

describe("declarationValeursSchema et lireDeclaration", () => {
  const objet = { categorie: "Mobilier", designation: "Armoire", quantite: "1", valeur_unitaire: "300" };
  const decl = (modif: Record<string, unknown> = {}) =>
    declarationValeursSchema.safeParse({ declarant_nom: "Jean Dupont", declarant_qualite: "Client", lieu: "Paris", date: "2026-11-15", objets: [objet], certification: "on", ...modif });

  it("accepte une déclaration simple", () => {
    expect(decl().success).toBe(true);
  });

  it("refuse une quantité nulle, négative, décimale ou au-delà de 999", () => {
    for (const quantite of ["0", "-1", "1.5", "1000", ""]) expect(decl({ objets: [{ ...objet, quantite }] }).success).toBe(false);
  });

  it("refuse une valeur nulle, négative, infinie ou au-delà de 500 000 €", () => {
    for (const valeur_unitaire of ["0", "-5", "Infinity", "500001", "abc"]) expect(decl({ objets: [{ ...objet, valeur_unitaire }] }).success).toBe(false);
  });

  it("au-delà de 1 500 €, un objet se déclare seul", () => {
    expect(decl({ objets: [{ ...objet, quantite: "2", valeur_unitaire: "1501" }] }).success).toBe(false);
    expect(decl({ objets: [{ ...objet, quantite: "1", valeur_unitaire: "1501" }] }).success).toBe(true);
  });

  it("borne la liste à 200 lignes et exige au moins une ligne", () => {
    expect(decl({ objets: [] }).success).toBe(false);
    expect(decl({ objets: Array.from({ length: 201 }, () => objet) }).success).toBe(false);
  });

  it("refuse une catégorie inventée et une date impossible", () => {
    expect(decl({ objets: [{ ...objet, categorie: "Lingots" }] }).success).toBe(false);
    expect(decl({ date: "2026-02-30" }).success).toBe(false);
    expect(decl({ date: "15/11/2026" }).success).toBe(false);
  });

  it("lireDeclaration : un JSON cassé devient une liste vide, refusée ensuite", () => {
    const lu = lireDeclaration(fd({ objets: "{pas du json", certification: "on" }));
    expect(lu.objets).toEqual([]);
  });

  it("lireDeclaration : un JSON piégé ne pollue pas le prototype et les clés inconnues tombent", () => {
    const lu = lireDeclaration(fd({ objets: '[{"__proto__":{"pollue":1},"categorie":"Mobilier","designation":"Armoire","quantite":"1","valeur_unitaire":"10","prix":"0"}]' }));
    const r = declarationValeursSchema.safeParse({ declarant_nom: "Jean", declarant_qualite: "Client", lieu: "Paris", date: "2026-11-15", objets: lu.objets, certification: "on" });
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data.objets[0]).sort()).toEqual(["categorie", "designation", "quantite", "valeur_unitaire"]);
  });

  it("lireDeclaration : un fichier glissé à la place d'un texte n'est pas lu comme texte", () => {
    const f = new FormData();
    f.append("declarant_nom", new Blob(["Jean"]), "nom.txt");
    expect(lireDeclaration(f).declarant_nom).toBeUndefined();
  });
});

describe("acceptations, signature et réponses au devis", () => {
  it("les cases ne valent que cochées (« on »)", () => {
    expect(acceptationsSchema.safeParse({ cgv: "on", rgpd: "on" }).success).toBe(true);
    expect(acceptationsSchema.safeParse({ cgv: "on" }).success).toBe(false);
    expect(acceptationsSchema.safeParse({ cgv: "off", rgpd: "on" }).success).toBe(false);
    expect(signatureDevisSchema.safeParse({ cgv: "ON" }).success).toBe(false);
    expect(signatureDevisSchema.safeParse({}).success).toBe(false);
  });

  it("borne les textes des réponses au devis", () => {
    expect(reponseDevisSchemas.refus.safeParse({ texte: "" }).success).toBe(true);
    expect(reponseDevisSchemas.refus.safeParse({ texte: "a".repeat(601) }).success).toBe(false);
    expect(reponseDevisSchemas.modification.safeParse({ texte: "ab" }).success).toBe(false);
    expect(reponseDevisSchemas.modification.safeParse({ texte: "a".repeat(1501) }).success).toBe(false);
    expect(reponseDevisSchemas.renouvellement.safeParse({ texte: "a".repeat(100_000) }).success).toBe(false);
  });

  it("lireReponseDevis ramène les fins de ligne Windows à \\n", () => {
    expect(lireReponseDevis(fd({ texte: "a\r\nb\r\nc" })).texte).toBe("a\nb\nc");
    expect(lireReponseDevis(new FormData()).texte).toBe("");
  });

  it("messageSchema : 10 à 2000 caractères, après retrait des blancs", () => {
    expect(messageSchema.safeParse({ message: "   court   " }).success).toBe(false);
    expect(messageSchema.safeParse({ message: "Bonjour, une question." }).success).toBe(true);
    expect(messageSchema.safeParse({ message: "a".repeat(2001) }).success).toBe(false);
  });
});

describe("ficheCartonsSchema et estSamedi", () => {
  const bornes = { min: "2026-11-21", max: "2026-12-19" };
  const fiche = (modif: Record<string, unknown> = {}) =>
    ficheCartonsSchema(bornes).safeParse({ adresse: "12 rue des Lilas, Paris", complement: "", code_acces: "", contact_nom: "Jean", contact_tel: "06 12 34 56 78", date_samedi: "2026-11-28", ...modif });

  it("estSamedi reconnaît le samedi, quel que soit le fuseau", () => {
    expect(estSamedi("2026-11-28")).toBe(true);
    expect(estSamedi("2026-11-29")).toBe(false);
  });

  it("accepte un samedi dans les bornes", () => {
    expect(fiche().success).toBe(true);
  });

  it("refuse un dimanche, un samedi trop proche ou après le déménagement", () => {
    expect(fiche({ date_samedi: "2026-11-29" }).success).toBe(false);
    expect(fiche({ date_samedi: "2026-11-14" }).success).toBe(false);
    expect(fiche({ date_samedi: "2026-12-26" }).success).toBe(false);
  });

  it("refuse une date au format piégé qui passerait la comparaison de chaînes", () => {
    expect(fiche({ date_samedi: "2026-11-28T00:00:00Z" }).success).toBe(false);
    expect(fiche({ date_samedi: "2026-11-28 OR 1=1" }).success).toBe(false);
  });

  it("refuse un téléphone non français et un code d'accès de plus de 20 caractères", () => {
    expect(fiche({ contact_tel: "+44 20 7946 0958" }).success).toBe(false);
    expect(fiche({ code_acces: "1".repeat(21) }).success).toBe(false);
  });
});

describe("avarieSchema", () => {
  const avarie = (date_constat: string) =>
    avarieSchema.safeParse({ reserves_emises: "oui", date_constat, objets: "Armoire", description: "La porte de l'armoire est fendue sur toute la hauteur." });

  it("refuse une date de constat dans le futur", () => {
    vi.useFakeTimers({ now: new Date("2026-11-15T12:00:00+01:00") });
    expect(avarie("2026-11-16").success).toBe(false);
    expect(avarie("2026-11-15").success).toBe(true);
    expect(avarie("2026-11-14").success).toBe(true);
  });

  // « Aujourd'hui » est le jour de Paris : juste après minuit, UTC est encore la veille.
  it("accepte la date du jour, à Paris, juste après minuit", () => {
    vi.useFakeTimers({ now: new Date("2026-11-15T00:30:00+01:00") });
    expect(avarie("2026-11-15").success).toBe(true);
  });

  it("exige une description d'au moins 20 caractères et au plus 2000", () => {
    const r = avarieSchema.safeParse({ reserves_emises: "non", date_constat: "2026-01-01", objets: "Armoire", description: "trop court" });
    expect(r.success).toBe(false);
    const long = avarieSchema.safeParse({ reserves_emises: "non", date_constat: "2026-01-01", objets: "Armoire", description: "a".repeat(2001) });
    expect(long.success).toBe(false);
  });
});

describe("verifierFichier et verifierPhotos", () => {
  const f = (name: string, type: string, size = 1000) => ({ name, type, size });

  it("refuse un type hors liste : SVG, HTML, exécutable, type vide", () => {
    expect(verifierFichier(f("logo.svg", "image/svg+xml"))).toMatch(/format non accepté/);
    expect(verifierFichier(f("page.html", "text/html"))).toMatch(/format non accepté/);
    expect(verifierFichier(f("virus.exe", "application/x-msdownload"))).toMatch(/format non accepté/);
    expect(verifierFichier(f("x", ""))).toMatch(/format non accepté/);
    expect(verifierFichier(f("x.pdf", "application/PDF"))).toMatch(/format non accepté/);
  });

  it("accepte un PDF et une photo dans la limite de 10 Mo, refuse au-delà", () => {
    expect(verifierFichier(f("devis.pdf", "application/pdf", TAILLE_MAX))).toBeNull();
    expect(verifierFichier(f("devis.pdf", "application/pdf", TAILLE_MAX + 1))).toMatch(/dépasse 10 Mo/);
  });

  it("un fichier vide ou absent : obligatoire ou non selon l'appel", () => {
    expect(verifierFichier(null)).toBe("Choisissez un fichier.");
    expect(verifierFichier(f("x.pdf", "application/pdf", 0))).toBe("Choisissez un fichier.");
    expect(verifierFichier(null, undefined, false)).toBeNull();
  });

  it("un PDF n'est pas une photo", () => {
    expect(verifierFichier(f("x.pdf", "application/pdf"), TYPES_PHOTOS)).toMatch(/JPEG, PNG, HEIC ou WebP/);
  });

  it("verifierPhotos : nombre, formats et poids total", () => {
    const p = (n: number, size = 1000) => Array.from({ length: n }, (_, i) => f(`p${i}.jpg`, "image/jpeg", size));
    expect(verifierPhotos([], { min: 1, max: 5 })).toMatch(/au moins une photo/);
    expect(verifierPhotos(p(6), { max: 5 })).toBe("5 photos maximum.");
    expect(verifierPhotos([...p(2), f("x.svg", "image/svg+xml")], { max: 5 })).toMatch(/format non accepté/);
    expect(verifierPhotos(p(4, TAILLE_MAX), { max: 5 })).toMatch(/dépasse 30 Mo/);
    expect(verifierPhotos(p(3, TOTAL_MAX / 3), { max: 5 })).toBeNull();
    // Les fichiers vides (champ laissé vide) ne comptent pas.
    expect(verifierPhotos([...p(5), f("", "", 0), f("", "", 0)], { max: 5 })).toBeNull();
  });

  it("le nom d'un fichier hostile revient tel quel dans le message (texte, à échapper par l'affichage)", () => {
    expect(verifierFichier(f("<img src=x onerror=alert(1)>.svg", "image/svg+xml"))).toContain("<img src=x onerror=alert(1)>.svg");
  });
});

describe("erreursDe", () => {
  it("rend une erreur par champ, la première seulement", () => {
    const r = conditionsLivraisonSchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = erreursDe(r.error);
      expect(e.adresse_livraison).toBe("L'adresse de livraison est obligatoire.");
      expect(Object.values(e).every((m) => typeof m === "string")).toBe(true);
    }
  });
});
