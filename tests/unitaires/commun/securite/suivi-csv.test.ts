import { describe, expect, it } from "vitest";
import { SUIVI_VIDE, versCsv, type Lead } from "@/lib/suivi-commun";

/*
 * L'export CSV du suivi des leads (suivi-commun.ts, versCsv) : une cellule
 * qui commence par = + - @ (ou tabulation, retour chariot) serait une formule
 * pour Excel — « =HYPERLINK(…) saisi dans le formulaire public » : une
 * apostrophe la garde en texte. Les nombres ne sont pas touchés.
 */

const lead = (modif: Partial<Lead> = {}): Lead => ({
  id: "r-1", created_at: "2026-11-15T10:00:00.000Z", client_nom: "Jean Dupont", client_email: "jean@exemple.fr", client_tel: "06 12 34 56 78",
  depart_ville: "Paris", depart_code_postal: "75011", arrivee_ville: "Lyon", arrivee_code_postal: "69003", volume_m3: 30, estimation_prix: 2_000,
  express: null, espace_nom: null, parcours: "particulier", transfert: null, mutation: null, societe: null, suivi: { ...SUIVI_VIDE }, ...modif,
});

/** Le CSV relu comme le relit un tableur : « ; », guillemets doublés, et une fin de ligne en \r, \n ou \r\n. */
function relire(csv: string): string[][] {
  const s = csv.replace(/^﻿/, "");
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = "";
  let entreGuillemets = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (entreGuillemets) {
      if (c === '"' && s[i + 1] === '"') (cellule += '"'), i++;
      else if (c === '"') entreGuillemets = false;
      else cellule += c;
    } else if (c === '"' && cellule === "") entreGuillemets = true;
    else if (c === ";") (ligne.push(cellule), (cellule = ""));
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else cellule += c;
  }
  ligne.push(cellule);
  lignes.push(ligne);
  return lignes;
}
const formule = (c: string) => /^[=+\-@\t\r]/.test(c);

describe("versCsv — la forme", () => {
  it("commence par le BOM, puis l'en-tête de 14 colonnes séparées par « ; »", () => {
    const csv = versCsv([lead()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [entete, ligne] = relire(csv);
    expect(entete).toHaveLength(14);
    expect(entete[0]).toBe("Date d'entrée");
    expect(ligne).toHaveLength(14);
    expect(ligne[2]).toBe("Jean Dupont");
  });

  it("écrit les montants avec une virgule, sans les neutraliser, même négatifs", () => {
    const [, ligne] = relire(versCsv([lead({ suivi: { ...SUIVI_VIDE, statut: "commande", ca_attente: -1_200.5, ca_realise: 3_468.25 } })]));
    expect(ligne[11]).toBe("-1200,5");
    expect(ligne[12]).toBe("3468,25");
  });

  it("met entre guillemets une cellule qui contient « ; », un guillemet ou un saut de ligne", () => {
    const [, ligne] = relire(versCsv([lead({ client_nom: 'Jean "Jojo"; Dupont', suivi: { ...SUIVI_VIDE, note: "ligne 1\nligne 2" } })]));
    expect(ligne[2]).toBe('Jean "Jojo"; Dupont');
    expect(ligne[13]).toBe("ligne 1\nligne 2");
  });

  it("une cellule vide reste vide", () => {
    const [, ligne] = relire(versCsv([lead({ client_tel: null, societe: null })]));
    expect(ligne[3]).toBe("");
    expect(ligne[9]).toBe("");
  });
});

describe("versCsv — l'injection de formules", () => {
  const charges = [
    "=HYPERLINK(1)",
    "=1+1",
    "+33 6 12 34 56 78",
    "-2+3",
    "@SUM(A1:A9)",
    "\t=1+1",
    "=cmd|' /C calc'!A0",
    '=HYPERLINK("https://evil.test";"Cliquez")',
    "=1+1\n=2+2",
    "x\n=1+1",
    "x\r\n=1+1",
    '"=1+1"',
  ];

  it.each(["client_nom", "client_tel", "client_email", "depart_ville", "arrivee_ville", "societe"] as const)(
    "aucune cellule issue de %s n'est lue comme une formule",
    (champ) => {
      for (const charge of charges) {
        const lignes = relire(versCsv([lead({ [champ]: charge })]));
        expect(lignes, JSON.stringify(charge)).toHaveLength(2);
        expect(lignes.flat().filter(formule), JSON.stringify(charge)).toEqual([]);
      }
    },
  );

  it("la note de l'équipe est neutralisée de même", () => {
    const lignes = relire(versCsv([lead({ suivi: { ...SUIVI_VIDE, note: "=IMPORTXML(1)" } })]));
    expect(lignes[1][13]).toBe("'=IMPORTXML(1)");
  });

  it("l'apostrophe garde le texte intact derrière elle", () => {
    const [, ligne] = relire(versCsv([lead({ client_nom: "=1+1" })]));
    expect(ligne[2]).toBe("'=1+1");
  });

  it("le nom de l'espace pro, faute de société, passe par la même neutralisation", () => {
    const [, ligne] = relire(versCsv([lead({ societe: null, espace_nom: "@Carrefour" })]));
    expect(ligne[9]).toBe("'@Carrefour");
  });

  // Un retour chariot seul est une fin de ligne pour un tableur : la cellule qui en contient un est mise entre
  // guillemets, sans quoi la suite ouvrirait une nouvelle ligne et y redeviendrait une formule.
  it("un retour chariot seul dans une cellule ne crée pas de nouvelle ligne", () => {
    for (const charge of ["06\r=cmd|' /C calc'!A0", "\r=1+1", "Dupont\r@SUM(A1)", "x\r+1"]) {
      const lignes = relire(versCsv([lead({ client_tel: charge })]));
      expect(lignes, JSON.stringify(charge)).toHaveLength(2);
      expect(lignes.flat().filter(formule), JSON.stringify(charge)).toEqual([]);
    }
  });
});
