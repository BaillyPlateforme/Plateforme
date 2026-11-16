import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  capacitePour, cleDestination, couleursDestinations, dateCourte, dateLongue, destination, estVerrouillee, jauge, lignesDe, lireVolume, m3,
  nomsDestinations, normaliser, slug, somme,
} from "@/crm/dispatch/outils";
import {
  appliquerCorrespondance, CHAMPS, cleDoublon, devinerCorrespondance, estVide, LIGNE_VIDE, nbReconnus, separerDestination, verifierLigne,
} from "@/crm/dispatch/saisie";
import { lireFichier, TAILLE_MAX } from "@/crm/dispatch/fichiers";
import type { Ligne, LigneSaisie } from "@/crm/dispatch/types";

const enc = (s: string) => new TextEncoder().encode(s);
const ligne = (o: Partial<Ligne> & { id: number }): Ligne => ({
  colonneId: null, rang: 0, client: `Client ${o.id}`, ville: null, pays: null, volume: 1, remarques: null, telephone: null, dossierId: null, dossierRef: null, ...o,
});

describe("dispatch/outils · normaliser, destinations", () => {
  it("« Fort-de-France » et « FORT DE FRANCE » désignent la même ville", () => {
    expect(normaliser("Fort-de-France")).toBe("fort de france");
    expect(normaliser("  FORT DE FRANCE ")).toBe("fort de france");
    expect(normaliser("La Réunion")).toBe("la reunion");
    expect(normaliser(null)).toBe("");
    expect(normaliser("☃ ✈ !!")).toBe("");
  });
  it("la destination de regroupement : le pays, sinon la ville, sinon « sans destination »", () => {
    expect(cleDestination({ pays: "Martinique", ville: "Fort-de-France" })).toBe("martinique");
    expect(cleDestination({ pays: "  ", ville: "Papeete" })).toBe("papeete");
    expect(cleDestination({ pays: null, ville: null })).toBe("sans destination");
    expect(destination({ pays: "Martinique", ville: "Le Lamentin" })).toBe("Le Lamentin, Martinique");
    expect(destination({ pays: null, ville: null })).toBe("Destination à préciser");
  });
  it("une couleur par destination, stable (ordre alphabétique) et cyclique au-delà de 12", () => {
    const a = couleursDestinations([{ pays: "Martinique", ville: null }, { pays: "Guadeloupe", ville: null }]);
    const b = couleursDestinations([{ pays: "guadeloupe", ville: null }, { pays: "MARTINIQUE", ville: null }, { pays: "Martinique", ville: null }]);
    expect([...a]).toEqual([...b]);
    const treize = couleursDestinations(Array.from({ length: 13 }, (_, i) => ({ pays: `Pays ${String(i).padStart(2, "0")}`, ville: null })));
    expect(treize.get("pays 12")).toBe(treize.get("pays 00"));
  });
  it("le nom affiché d'une destination : l'orthographe la plus fréquente", () => {
    const n = nomsDestinations([{ pays: "martinique", ville: null }, { pays: "Martinique", ville: null }, { pays: "Martinique", ville: null }, { pays: null, ville: "Papeete" }]);
    expect(n.get("martinique")).toBe("Martinique");
    expect(n.get("papeete")).toBe("Papeete");
  });
});

describe("dispatch/outils · volumes et jauge", () => {
  it("lit « 12,5 », « 12.5 m³ », « 12 m3 », « 12M3 »", () => {
    expect(lireVolume("12,5")).toBe(12.5);
    expect(lireVolume("12.5 m³")).toBe(12.5);
    expect(lireVolume(" 12 m3 ")).toBe(12);
    expect(lireVolume("12M3")).toBe(12);
    expect(lireVolume("1 200")).toBe(1200);
    expect(lireVolume(7)).toBe(7);
    expect(lireVolume("-3")).toBe(-3);
  });
  it("refuse ce qui ne se lit pas comme un volume", () => {
    for (const v of ["", "abc", "1e3", "12.5.3", "Infinity", "NaN", "=1+1", "１２", "12 m²", "0x10", null, undefined, NaN, Infinity]) expect(lireVolume(v as never)).toBeNull();
  });
  it("m3 et somme : une décimale à la française, somme au centime", () => {
    expect(m3(12.345)).toBe("12,3 m³");
    expect(m3(null)).toBe("0 m³");
    expect(somme([{ volume: 0.1 }, { volume: 0.2 }])).toBe(0.3);
    expect(somme([])).toBe(0);
  });
  it("jauge : libre sans capacité, plein à 90 %, dépassé au-delà de 100 % (tolérance de calcul)", () => {
    expect(jauge(10, null)).toEqual({ pct: null, etat: "libre", reste: null });
    expect(jauge(10, 0)).toEqual({ pct: null, etat: "libre", reste: null });
    expect(jauge(10, -5).etat).toBe("libre");
    expect(jauge(10, 33)).toMatchObject({ etat: "ok", reste: 23 });
    expect(jauge(29.7, 33).etat).toBe("plein"); // 90 % pile
    expect(jauge(33, 33)).toMatchObject({ etat: "plein", reste: 0 });
    expect(jauge(33.0001, 33).etat).toBe("plein");
    expect(jauge(34, 33)).toMatchObject({ etat: "depasse", reste: -1 });
  });
  it("capacité d'un 20 ou d'un 40 pieds selon le plan ; aucune sans taille", () => {
    const plan = { capacite20: 30, capacite40: 60 };
    expect(capacitePour("20", plan)).toBe(30);
    expect(capacitePour("40", plan)).toBe(60);
    expect(capacitePour(null, plan)).toBeNull();
  });
});

describe("dispatch/outils · lignes, verrou, noms de fichier, dates", () => {
  it("les lignes d'une colonne, par rang puis par identifiant (tri stable)", () => {
    const ls = [ligne({ id: 3, colonneId: 1, rang: 1 }), ligne({ id: 1, colonneId: 1, rang: 1 }), ligne({ id: 2, colonneId: 1, rang: 0 }), ligne({ id: 4, colonneId: null })];
    expect(lignesDe(ls, 1).map((l) => l.id)).toEqual([2, 1, 3]);
    expect(lignesDe(ls, null).map((l) => l.id)).toEqual([4]);
  });
  it("une colonne est verrouillée dès qu'elle a une date de validation", () => {
    expect(estVerrouillee({ verrouilleeLe: "2026-11-01" })).toBe(true);
    expect(estVerrouillee({ verrouilleeLe: null })).toBe(false);
    expect(estVerrouillee(null)).toBe(false);
  });
  it("slug : sans accents ni espaces, 60 caractères au plus, « dispatch » par défaut", () => {
    expect(slug("Groupage Antilles — Novembre")).toBe("groupage-antilles-novembre");
    expect(slug("")).toBe("dispatch");
    expect(slug("../../etc/passwd")).toBe("etc-passwd");
    expect(slug("x".repeat(500))).toHaveLength(60);
  });
  it("dates courtes et longues lues en UTC (pas de glissement d'un jour)", () => {
    expect(dateCourte("2026-11-15")).toBe("15 nov.");
    expect(dateLongue("2027-01-01")).toBe("1 janvier 2027");
    expect(dateLongue("2028-02-29")).toBe("29 février 2028");
    expect(dateCourte(null)).toBeNull();
  });
});

describe("dispatch/saisie · correspondance des colonnes", () => {
  it("reconnaît les en-têtes usuels, accents et casse ignorés", () => {
    const c = devinerCorrespondance(["Nom du client", "Ville de livraison", "PAYS", "Volume (m³)", "Observations", "N° dossier", "Téléphone portable"]);
    expect(c).toMatchObject({ client: 0, ville: 1, pays: 2, volume: 3, remarques: 4, dossier: 5, telephone: 6, destination: -1 });
    expect(nbReconnus(c)).toBe(7);
  });
  it("une colonne n'est prise que par un champ", () => {
    const c = devinerCorrespondance(["Ville de livraison"]);
    expect(c.ville).toBe(0);
    expect(c.destination).toBe(-1);
  });
  it("aucun en-tête reconnu : tout à -1 (la première ligne n'est pas une ligne de titres)", () => {
    const c = devinerCorrespondance(["Martin", "Lyon", "12"]);
    expect(nbReconnus(c)).toBe(0);
    expect(Object.keys(c).sort()).toEqual(CHAMPS.map((x) => x.cle).sort());
  });
  it("sépare « Ville, Pays », « Ville (Pays) » et « Ville - Pays »", () => {
    expect(separerDestination("Fort-de-France, Martinique")).toEqual({ ville: "Fort-de-France", pays: "Martinique" });
    expect(separerDestination(" Fort-de-France (Martinique) ")).toEqual({ ville: "Fort-de-France", pays: "Martinique" });
    expect(separerDestination("Pointe-à-Pitre - Guadeloupe")).toEqual({ ville: "Pointe-à-Pitre", pays: "Guadeloupe" });
    expect(separerDestination("Papeete")).toEqual({ ville: "Papeete", pays: "" });
    expect(separerDestination("")).toEqual({ ville: "", pays: "" });
  });
  it("applique la correspondance ; la destination complète ne remplit que ce qui manque", () => {
    const c = devinerCorrespondance(["Client", "Destination", "Ville", "Volume"]);
    expect(appliquerCorrespondance([" Martin ", "Fort-de-France, Martinique", "", "12"], c)).toMatchObject({ client: "Martin", ville: "Fort-de-France", pays: "Martinique", volume: "12" });
    expect(appliquerCorrespondance(["Durand", "Basse-Terre, Guadeloupe", "Pointe-à-Pitre", "3"], c)).toMatchObject({ ville: "Pointe-à-Pitre", pays: "Guadeloupe" });
  });
  it("une ligne plus courte que les en-têtes ne plante pas : les cellules absentes sont vides", () => {
    const c = devinerCorrespondance(["Client", "Ville", "Pays", "Volume", "Téléphone"]);
    expect(appliquerCorrespondance(["Martin"], c)).toEqual({ ...LIGNE_VIDE, client: "Martin" });
    expect(estVide(appliquerCorrespondance([], c))).toBe(true);
    expect(estVide({ ...LIGNE_VIDE, remarques: "   " })).toBe(true);
  });
});

describe("dispatch/saisie · verifierLigne", () => {
  const base: LigneSaisie = { client: "Famille Martin", ville: "Fort-de-France", pays: "Martinique", volume: "12,5", remarques: "", dossier: "", telephone: "" };
  const ctx = { capaciteMax: 67 };
  const champs = (v: ReturnType<typeof verifierLigne>["erreurs"]) => v.map((e) => e.champ);

  it("une ligne complète passe, volume lu", () => {
    expect(verifierLigne(base, ctx)).toEqual({ erreurs: [], avertissements: [], volume: 12.5 });
  });
  it("nom, destination et volume manquants sont des erreurs", () => {
    const v = verifierLigne({ ...LIGNE_VIDE }, ctx);
    expect(champs(v.erreurs)).toEqual(["client", "ville", "volume"]);
  });
  it("sans pays : un avertissement, le regroupement se fera sur la ville", () => {
    expect(verifierLigne({ ...base, pays: " " }, ctx).avertissements.map((a) => a.champ)).toEqual(["pays"]);
  });
  it("volume illisible, négatif, hors limites (≥ 1 000) : erreur ; nul ou plus grand qu'un 40 pieds : avertissement", () => {
    expect(verifierLigne({ ...base, volume: "beaucoup de cartons et un piano" }, ctx).erreurs[0].texte).toBe("Volume illisible : « beaucoup de cartons  »");
    expect(verifierLigne({ ...base, volume: "-3" }, ctx).erreurs[0].texte).toBe("Volume négatif");
    expect(verifierLigne({ ...base, volume: "1000" }, ctx).erreurs[0].texte).toMatch(/hors limites/);
    expect(verifierLigne({ ...base, volume: "999" }, ctx).erreurs).toEqual([]);
    expect(verifierLigne({ ...base, volume: "0" }, ctx).avertissements[0].texte).toMatch(/Volume nul/);
    expect(verifierLigne({ ...base, volume: "70" }, ctx).avertissements[0].texte).toBe("Plus grand qu'un conteneur 40 pieds (67 m³) : à scinder");
    expect(verifierLigne({ ...base, volume: "70" }, { capaciteMax: 67.5 }).avertissements[0].texte).toMatch(/67,5 m³/);
  });
  it("bornes de longueur : nom de 160 caractères accepté, 161 refusé ; remarques de 1 000 acceptées, 1 001 refusées", () => {
    expect(verifierLigne({ ...base, client: "a".repeat(160) }, ctx).erreurs).toEqual([]);
    expect(champs(verifierLigne({ ...base, client: "a".repeat(161) }, ctx).erreurs)).toEqual(["client"]);
    expect(verifierLigne({ ...base, remarques: "r".repeat(1000) }, ctx).erreurs).toEqual([]);
    expect(champs(verifierLigne({ ...base, remarques: "r".repeat(1001) }, ctx).erreurs)).toEqual(["remarques"]);
  });
  it("une chaîne énorme ne fait pas exploser le message d'erreur (20 caractères cités au plus)", () => {
    const v = verifierLigne({ ...base, volume: "9".repeat(100000) + "x" }, ctx);
    expect(v.erreurs[0].texte.length).toBeLessThan(50);
  });
  it("dossier inconnu : avertissement en majuscules ; connu (casse indifférente) : rien", () => {
    const dossiers = new Map([["BD-2026-0001", 1]]);
    expect(verifierLigne({ ...base, dossier: " bd-2026-0001 " }, { ...ctx, dossiers }).avertissements).toEqual([]);
    expect(verifierLigne({ ...base, dossier: "bd-2026-9999" }, { ...ctx, dossiers }).avertissements[0].texte).toMatch(/BD-2026-9999 introuvable/);
    expect(verifierLigne({ ...base, dossier: "bd-2026-9999" }, ctx).avertissements).toEqual([]);
  });
  it("doublon signalé, sans bloquer", () => {
    const v = verifierLigne(base, { ...ctx, doublon: true });
    expect(v.erreurs).toEqual([]);
    expect(v.avertissements[0].champ).toBe("client");
  });
  it("cellules hostiles : une formule ou des caractères de contrôle restent du texte, sans planter", () => {
    const v = verifierLigne({ ...base, client: '=HYPERLINK("http://evil.example","x")', remarques: "\u0000\u0007\u001b[31m" }, ctx);
    expect(v.erreurs).toEqual([]);
    expect(verifierLigne({ ...base, volume: "=SUM(A1:A9)" }, ctx).erreurs[0].champ).toBe("volume");
  });
  it("la clé de doublon : même client, même ville, accents et casse ignorés", () => {
    expect(cleDoublon({ client: "Hélène Martin", ville: "Fort-de-France" })).toBe(cleDoublon({ client: "HELENE  MARTIN", ville: "fort de france" }));
    expect(cleDoublon({ client: "Martin", ville: null })).toBe("martin|");
  });
});

describe("dispatch/fichiers · lireFichier (CSV)", () => {
  it("détecte le point-virgule d'un CSV exporté d'Excel en France", async () => {
    const r = await lireFichier("clients.csv", enc("Client;Ville;Volume\nMartin;Lyon;12,5\n"));
    expect(r).toEqual({ format: "csv", feuilles: [{ nom: "clients", lignes: [["Client", "Ville", "Volume"], ["Martin", "Lyon", "12,5"]] }] });
  });
  it("lit la virgule, les guillemets doublés et les retours à la ligne entre guillemets", async () => {
    const r = await lireFichier("a.csv", enc('Client,Remarques\r\n"Dupont, Jean","Il a dit ""fragile""\nsur deux lignes"\r\n'));
    expect(r.feuilles[0].lignes).toEqual([["Client", "Remarques"], ["Dupont, Jean", 'Il a dit "fragile"\nsur deux lignes']]);
  });
  it("lit la tabulation", async () => {
    expect((await lireFichier("a.tsv", enc("a\tb\tc\n1\t2\t3"))).feuilles[0].lignes).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("retire le BOM UTF-8", async () => {
    const r = await lireFichier("a.csv", new Uint8Array([0xef, 0xbb, 0xbf, ...enc("Client;Ville\nÉlodie;Évry")]));
    expect(r.feuilles[0].lignes[0][0]).toBe("Client");
    expect(r.feuilles[0].lignes[1]).toEqual(["Élodie", "Évry"]);
  });
  it("décode un CSV en Windows-1252 : les lettres accentuées (zone commune avec Latin-1)", async () => {
    // « Hélène;Orléans » : é = 0xE9, è = 0xE8
    const octets = new Uint8Array([0x48, 0xe9, 0x6c, 0xe8, 0x6e, 0x65, 0x3b, 0x4f, 0x72, 0x6c, 0xe9, 0x61, 0x6e, 0x73]);
    expect((await lireFichier("a.csv", octets)).feuilles[0].lignes).toEqual([["Hélène", "Orléans"]]);
  });
  // Protège le décodage Windows-1252 de 0x80–0x9F (« ’ € œ … »), que Node 22 lit en Latin-1.
  it("décode un CSV en Windows-1252 : apostrophe typographique, euro, œ, points de suspension", async () => {
    // « l’Église;10 €;cœur… » : ’ = 0x92, € = 0x80, œ = 0x9C, … = 0x85, É = 0xC9
    const octets = new Uint8Array([0x6c, 0x92, 0xc9, 0x67, 0x6c, 0x69, 0x73, 0x65, 0x3b, 0x31, 0x30, 0x20, 0x80, 0x3b, 0x63, 0x9c, 0x75, 0x72, 0x85]);
    expect((await lireFichier("a.csv", octets)).feuilles[0].lignes).toEqual([["l’Église", "10 €", "cœur…"]]);
  });
  it("garde une formule telle quelle, en texte (rien n'est évalué)", async () => {
    const r = await lireFichier("a.csv", enc('Client;Volume\n=HYPERLINK("http://evil.example";"x");=1+1\n+cmd|\' /C calc\'!A0;@SUM(1)\n'));
    // Le guillemet d'ouverture de « "x") » ouvre une cellule entre guillemets : x, puis « ) » après la fermeture.
    expect(r.feuilles[0].lignes[1]).toEqual(['=HYPERLINK("http://evil.example"', "x)", "=1+1"]);
    expect(r.feuilles[0].lignes[2]).toEqual(["+cmd|' /C calc'!A0", "@SUM(1)", ""]);
  });
  it("un guillemet au milieu d'une cellule est un caractère ordinaire ; un guillemet non fermé ne plante pas", async () => {
    expect((await lireFichier("a.csv", enc('ab"c;d'))).feuilles[0].lignes).toEqual([['ab"c', "d"]]);
    expect((await lireFichier("a.csv", enc('"abc;def\nghi'))).feuilles[0].lignes).toEqual([["abc;def\nghi"]]);
  });
  it("met au propre : espaces insécables, lignes vides en fin, colonnes vides à droite", async () => {
    const r = await lireFichier("a.csv", enc(" Martin ;Lyon;;;\n;;;;\n\n;;\n"));
    expect(r.feuilles[0].lignes).toEqual([["Martin", "Lyon"]]);
  });
  it("complète les lignes courtes à la largeur du tableau", async () => {
    expect((await lireFichier("a.csv", enc("a;b;c\nx\n"))).feuilles[0].lignes).toEqual([["a", "b", "c"], ["x", "", ""]]);
  });
  it("plafonne à 2 000 lignes de données (plus l'en-tête) et 40 colonnes", async () => {
    const r = await lireFichier("a.csv", enc(Array.from({ length: 5000 }, (_, i) => `c${i};${Array.from({ length: 60 }, () => "x").join(";")}`).join("\n")));
    expect(r.feuilles[0].lignes).toHaveLength(2001);
    expect(r.feuilles[0].lignes[0]).toHaveLength(40);
  });
  it("une cellule énorme est lue sans planter", async () => {
    const r = await lireFichier("a.csv", enc(`Client;Remarques\nMartin;${"z".repeat(2_000_000)}`));
    expect(r.feuilles[0].lignes[1][1]).toHaveLength(2_000_000);
  });
  it("refuse le fichier vide, le .xls et les formats inconnus, avec un message clair", async () => {
    await expect(lireFichier("a.csv", enc(""))).rejects.toThrow("Le fichier est vide.");
    await expect(lireFichier("a.csv", enc(" ; ;\n\n"))).rejects.toThrow("Le fichier est vide.");
    await expect(lireFichier("Clients.XLS", enc("x"))).rejects.toThrow(/\.xls \(Excel 97-2003\)/);
    await expect(lireFichier("photo.pdf", enc("%PDF"))).rejects.toThrow("Format « .pdf » non pris en charge");
  });
  // Protège la lecture en CSV d'un fichier sans extension (au lieu du refus « Format « .export » »).
  it("un fichier sans extension est lu comme un CSV", async () => {
    const r = await lireFichier("export", enc("Client;Ville\nMartin;Lyon"));
    expect(r.format).toBe("csv");
  });
  it("la taille maximale annoncée est de 10 Mo", () => {
    expect(TAILLE_MAX).toBe(10 * 1024 * 1024);
  });
});

describe("dispatch/fichiers · lireFichier (Excel .xlsx)", () => {
  async function classeur(remplir: (wb: ExcelJS.Workbook) => void) {
    const wb = new ExcelJS.Workbook();
    remplir(wb);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it("lit chaque nature de cellule en texte : formule (son résultat), texte enrichi, date, booléen, lien, erreur, nombre", async () => {
    const octets = await classeur((wb) => {
      const f = wb.addWorksheet("Clients");
      f.addRow(["Client", "Volume", "Date", "Assuré", "Lien", "Erreur", "Calcul"]);
      f.addRow([
        { richText: [{ text: "Famille " }, { font: { bold: true }, text: "Martin" }] },
        { formula: "10+2.5", result: 12.5 },
        new Date("2026-11-15T00:00:00Z"),
        true,
        { text: "site", hyperlink: "https://example.com" },
        { error: "#N/A" },
        12.3456789,
      ]);
    });
    const r = await lireFichier("plan.xlsx", octets);
    expect(r.format).toBe("excel");
    expect(r.feuilles[0].nom).toBe("Clients");
    expect(r.feuilles[0].lignes[1]).toEqual(["Famille Martin", "12.5", "2026-11-15", "oui", "site", "", "12.345679"]);
  });
  it("une formule hostile n'est jamais évaluée : seul son résultat enregistré est lu", async () => {
    const octets = await classeur((wb) => {
      const f = wb.addWorksheet("F");
      f.addRow(["Client"]);
      f.addRow([{ formula: 'HYPERLINK("http://evil.example","clic")', result: "clic" }]);
    });
    expect((await lireFichier("a.xlsx", octets)).feuilles[0].lignes).toEqual([["Client"], ["clic"]]);
  });
  // Protège la lecture d'une formule sans résultat enregistré : vide, jamais « [object Object] ».
  it("une formule sans valeur calculée se lit vide, jamais « [object Object] »", async () => {
    const octets = await classeur((wb) => {
      const f = wb.addWorksheet("F");
      f.addRow(["Client", "Volume"]);
      f.addRow(["Martin", { formula: "B3*2" }]);
    });
    expect((await lireFichier("a.xlsx", octets)).feuilles[0].lignes[1]).toEqual(["Martin", ""]);
  });
  it("ignore les feuilles masquées et vides ; reconnaît un .xlsx à sa signature PK", async () => {
    const octets = await classeur((wb) => {
      wb.addWorksheet("Vide");
      wb.addWorksheet("Cachée", { state: "hidden" }).addRow(["secret"]);
      wb.addWorksheet("Visible").addRow(["Client", "Ville"]);
    });
    const r = await lireFichier("sans-extension", octets);
    expect(r.feuilles.map((f) => f.nom)).toEqual(["Visible"]);
  });
  it("un classeur sans feuille remplie est refusé", async () => {
    const octets = await classeur((wb) => wb.addWorksheet("Vide"));
    await expect(lireFichier("a.xlsx", octets)).rejects.toThrow("Le classeur ne contient aucune feuille remplie.");
  });
  it("un faux .xlsx (endommagé) est refusé avec un message clair", async () => {
    await expect(lireFichier("a.xlsx", enc("PK pas vraiment un zip"))).rejects.toThrow(/n'a pas pu être ouvert/);
  });
});
