import { beforeEach, describe, expect, it, vi } from "vitest";

/* La base, l'espace client et les envois sont simulés : le moteur ne lit que ce qu'on lui donne ici. */
const etat = vi.hoisted(() => ({
  regles: [] as Record<string, unknown>[],
  cartes: [] as Record<string, unknown>[],
  devis: [] as Record<string, unknown>[],
  dejaRelances: [] as { dossier_id: number }[],
  factures: [] as Record<string, unknown>[],
  decisions: [] as Record<string, unknown>[],
  exclusions: [] as { dossier_id: number; type: string }[],
}));
vi.mock("@/crm/lib/db", () => ({
  q1: vi.fn(async (sql: string) => (/select 1 from modeles_messages/.test(sql) ? { "?column?": 1 } : undefined)),
  q: vi.fn(async (sql: string) => {
    if (/insert into relances_regles/.test(sql)) return [];
    if (/from relances_regles/.test(sql)) return etat.regles;
    if (/from modeles_messages where cle is not null/.test(sql)) return etat.cartes;
    if (/join devis v on v\.dossier_id = d\.id/.test(sql)) return etat.devis;
    if (/select distinct dossier_id from relances where type='devis'/.test(sql)) return etat.dejaRelances;
    if (/from factures f join factures_soldes/.test(sql)) return etat.factures;
    if (/from relances_exclusions/.test(sql)) return etat.exclusions;
    if (/from relances$/.test(sql.trim())) return etat.decisions;
    return [];
  }),
}));
vi.mock("@/crm/envois", () => ({
  envoyerCarte: vi.fn(),
  jourParis: (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }),
}));
vi.mock("@/lib/alertes-equipe", () => ({ alerterEquipe: vi.fn() }));
vi.mock("@/lib/espace-client/depot", () => ({ lireDonnees: vi.fn(async () => ({ dossiers: [] })) }));
vi.mock("@/lib/espace-client/lectures", () => ({ snapshotDe: vi.fn() }));
vi.mock("@/lib/espace-client/progression", () => ({ calculerFrise: vi.fn(() => []), piecesManquantes: vi.fn(() => []) }));
vi.mock("@/lib/espace-client/outil-metier", () => ({ lienRegle: vi.fn() }));
vi.mock("@/lib/espace-client/config", () => ({ adressePublique: vi.fn(() => "https://espace.example") }));
vi.mock("@/lib/adresses", () => ({ versInterne: (s: string) => s, URL_EXTERNE: "https://bailly.example" }));

import {
  canalEnClair, creneauEnClair, creneauOuvert, defCourrier, defRelance, delaiEnClair, ecart, familleDe, heureParis, heureVeilleParis, jourIso, jourPermis,
  libelleCanal, plus, RELANCES, repereDe, SEGMENTS, validerRegle, type ReglageRegle, type Regle, type Relance, type TypeRelance,
} from "@/crm/relances/regles";
import {
  blocRelance, elementsChoisis, enListe, EXEMPLES, MARQUE_LISTE, TEXTES_PROPOSES, texteAEnvoyer, texteLisible, typeDeCarte, varsRelance, versTexteCarte,
} from "@/crm/relances/courrier";
import { duesPourLaVeille, listerRelances, RATTRAPAGE_JOURS, simulerRegle } from "@/crm/relances/moteur";

const espaces = (s: string) => s.replace(/[  ]/g, " ");
const regleOk: Partial<ReglageRegle> = { actif: true, premier_delai_jours: 2, intervalle_jours: 5, nombre_max: 2, repere: "envoi_devis", canaux: ["email"], jours_envoi: null, heure_debut: null, heure_fin: null, segments_exclus: [] };

describe("relances/regles · validerRegle", () => {
  it("accepte une règle correcte et la normalise", () => {
    const r = validerRegle("devis", { ...regleOk, canaux: ["sms", "email", "fax" as never], jours_envoi: [5, 1, 1, 9, 3], segments_exclus: ["compte", "inconnu"] });
    expect(r).toEqual({ ok: true, regle: { ...regleOk, canaux: ["email", "sms"], jours_envoi: [1, 3, 5], segments_exclus: ["compte"] } });
  });
  it("sept jours d'envoi valent « tous les jours » (null)", () => {
    const r = validerRegle("devis", { ...regleOk, jours_envoi: [7, 6, 5, 4, 3, 2, 1] });
    expect(r.ok && r.regle.jours_envoi).toBeNull();
  });
  it("bornes : premier délai 0–120, intervalle 1–60, 1 à 6 relances, entiers seulement", () => {
    expect(validerRegle("devis", { ...regleOk, premier_delai_jours: 0 }).ok).toBe(true);
    expect(validerRegle("devis", { ...regleOk, premier_delai_jours: 120 }).ok).toBe(true);
    for (const [k, v] of [["premier_delai_jours", 121], ["premier_delai_jours", -1], ["premier_delai_jours", 2.5], ["premier_delai_jours", NaN], ["intervalle_jours", 0], ["intervalle_jours", 61], ["nombre_max", 0], ["nombre_max", 7], ["nombre_max", "2"]] as const) {
      expect(validerRegle("devis", { ...regleOk, [k]: v }).ok).toBe(false);
    }
  });
  it("refuse un type, un repère, des canaux, des jours ou des heures impossibles", () => {
    expect(validerRegle("loto", regleOk)).toEqual({ ok: false, erreur: "Type de relance inconnu." });
    expect(validerRegle("devis", { ...regleOk, repere: "facture" })).toEqual({ ok: false, erreur: "Repère du premier délai inconnu." });
    expect(validerRegle("devis", { ...regleOk, canaux: [] })).toEqual({ ok: false, erreur: "Choisissez au moins un canal." });
    expect(validerRegle("devis", { ...regleOk, canaux: undefined })).toMatchObject({ ok: false });
    expect(validerRegle("devis", { ...regleOk, jours_envoi: [0, 8] })).toEqual({ ok: false, erreur: "Choisissez au moins un jour d'envoi." });
    expect(validerRegle("devis", { ...regleOk, heure_debut: 24 })).toEqual({ ok: false, erreur: "Heure de début invalide." });
    expect(validerRegle("devis", { ...regleOk, heure_fin: 0 })).toEqual({ ok: false, erreur: "Heure de fin invalide." });
    expect(validerRegle("devis", { ...regleOk, heure_debut: 18, heure_fin: 9 })).toEqual({ ok: false, erreur: "L'heure de début doit précéder l'heure de fin." });
    expect(validerRegle("devis", { ...regleOk, heure_debut: 9, heure_fin: 9 }).ok).toBe(false);
    expect(validerRegle("devis", { ...regleOk, heure_debut: 0, heure_fin: 24 }).ok).toBe(true);
  });
  it("exclure tous les segments est refusé : on désactive plutôt la règle", () => {
    expect(validerRegle("devis", { ...regleOk, segments_exclus: SEGMENTS.map((s) => s.cle) })).toMatchObject({ ok: false });
  });
  it("chaque type a ses repères ; le premier est celui par défaut", () => {
    expect(RELANCES.map((r) => r.type)).toEqual(["devis", "pieces", "conditions", "solde", "avis"]);
    for (const d of RELANCES) {
      expect(validerRegle(d.type, { ...regleOk, repere: d.reperes[0].cle }).ok).toBe(true);
      expect(repereDe(d, "n'importe quoi")).toBe(d.reperes[0]);
    }
  });
});

describe("relances/regles · textes en clair", () => {
  it("délai en clair : « 2 j après l'envoi du devis, puis tous les 5 j (2 au plus) »", () => {
    expect(delaiEnClair(defRelance("devis")!, { premier_delai_jours: 2, intervalle_jours: 5, nombre_max: 2, repere: "envoi_devis" })).toBe("2 j après l'envoi du devis, puis tous les 5 j (2 au plus)");
    expect(delaiEnClair(defRelance("pieces")!, { premier_delai_jours: 21, intervalle_jours: 7, nombre_max: 1, repere: "demenagement" })).toBe("21 j avant le déménagement");
  });
  it("créneau en clair", () => {
    expect(creneauEnClair({ jours_envoi: null, heure_debut: null, heure_fin: null })).toBe("Tous les jours, à toute heure");
    expect(creneauEnClair({ jours_envoi: [1, 2, 3, 4, 5, 6], heure_debut: 9, heure_fin: null })).toBe("Sauf le dimanche, de 9 h à 24 h");
    expect(creneauEnClair({ jours_envoi: [1, 3, 5], heure_debut: null, heure_fin: 18 })).toBe("lun, mer, ven, de 0 h à 18 h");
  });
  it("canaux, familles de statuts, courrier « Ce qui manque »", () => {
    expect(libelleCanal("sms")).toBe("SMS");
    expect(libelleCanal("autre")).toBe("E-mail");
    expect(canalEnClair("email")).toBe("e-mail");
    expect(familleDe("envoye")).toBe("reussi");
    expect(familleDe("journalise")).toBe("garde_fou");
    expect(familleDe(null)).toBe("echec");
    expect(familleDe("inconnu")).toBe("echec");
    expect(defCourrier("espace")?.libelle).toBe("Ce qui manque");
    expect(defCourrier("devis")?.type).toBe("devis");
    expect(defCourrier("x")).toBeNull();
  });
});

describe("relances/regles · dates (à midi UTC : jamais de changement de jour)", () => {
  it("plus et ecart : fin d'année, 29 février, changements d'heure", () => {
    expect(plus("2026-12-30", 2)).toBe("2027-01-01");
    expect(plus("2028-02-28", 1)).toBe("2028-02-29");
    expect(plus("2026-03-29", -1)).toBe("2026-03-28");
    expect(ecart("2026-03-28", "2026-03-30")).toBe(2);
    expect(ecart("2026-10-24", "2026-10-26")).toBe(2);
    expect(ecart("2026-12-31", "2027-01-01")).toBe(1);
    expect(ecart("2026-11-15", "2026-11-10")).toBe(-5);
  });
  it("jourIso : 1 = lundi … 7 = dimanche", () => {
    expect(jourIso("2026-11-16")).toBe(1);
    expect(jourIso("2026-11-15")).toBe(7);
    expect(jourIso("2028-02-29")).toBe(2);
  });
  it("jourPermis : le premier jour d'envoi permis à partir du jour donné, lui compris", () => {
    const semaine = [1, 2, 3, 4, 5];
    expect(jourPermis("2026-11-14", semaine)).toBe("2026-11-16"); // samedi → lundi
    expect(jourPermis("2026-11-16", semaine)).toBe("2026-11-16");
    expect(jourPermis("2026-12-26", semaine)).toBe("2026-12-28");
    expect(jourPermis("2026-12-31", [6])).toBe("2027-01-02");
    expect(jourPermis("2026-11-14", null)).toBe("2026-11-14");
    expect(jourPermis("2026-11-14", [])).toBe("2026-11-14");
    expect(jourPermis("2026-11-14", [9])).toBe("2026-11-14"); // aucun jour possible : le jour même
  });
  it("creneauOuvert : jours permis et heures [début, fin[", () => {
    const r = { jours_envoi: [1, 2, 3, 4, 5], heure_debut: 9, heure_fin: 18 };
    expect(creneauOuvert(r, "2026-11-16", 9)).toBe(true);
    expect(creneauOuvert(r, "2026-11-16", 17)).toBe(true);
    expect(creneauOuvert(r, "2026-11-16", 18)).toBe(false);
    expect(creneauOuvert(r, "2026-11-16", 8)).toBe(false);
    expect(creneauOuvert(r, "2026-11-15", 12)).toBe(false);
    expect(creneauOuvert({ jours_envoi: null, heure_debut: null, heure_fin: null }, "2026-11-15", 0)).toBe(true);
  });
  it("l'heure de la veille à Paris : 17 h l'hiver, 18 h l'été, et le jour même des changements d'heure", () => {
    expect(heureVeilleParis("2026-12-01")).toBe(17);
    expect(heureVeilleParis("2026-07-01")).toBe(18);
    expect(heureVeilleParis("2026-03-29")).toBe(18);
    expect(heureVeilleParis("2026-10-25")).toBe(17);
    expect(heureParis(new Date("2026-12-31T23:30:00Z"))).toBe(0);
    expect(heureParis(new Date("2026-06-30T21:59:00Z"))).toBe(23);
  });
});

describe("relances/courrier", () => {
  it("enListe : « A, B et C »", () => {
    expect(enListe([])).toBe("");
    expect(enListe(["A"])).toBe("A");
    expect(enListe(["A", "B"])).toBe("A et B");
    expect(enListe(["A", "B", "C"])).toBe("A, B et C");
  });
  it("le type de relance d'une carte de « Courriers et SMS »", () => {
    expect(typeDeCarte("devis_relance")).toBe("devis");
    expect(typeDeCarte("relance_solde_sms")).toBe("solde");
    expect(typeDeCarte("relance_espace")).toBe("espace");
    expect(typeDeCarte("bienvenue")).toBeNull();
  });
  it("éléments retenus : ceux cochés, dans l'ordre de la relance ; tous sans précision", () => {
    const d = EXEMPLES.pieces;
    const ids = d.elements.map((e) => e.id);
    expect(elementsChoisis(d, null)).toBe(d.elements);
    expect(elementsChoisis(d, [...ids].reverse()).map((e) => e.id)).toEqual(ids);
    expect(elementsChoisis(d, [])).toEqual([]);
  });
  it("variables : {elements} en liste courte, {montant} = total des factures retenues", () => {
    const f = (id: string, montant: number) => ({ id, titre: `Facture ${id}`, court: id, detail: "", valeur: null, montant });
    const v = varsRelance("solde", { client: "Mme Martin" }, [f("FA-1", 100.5), f("FA-2", 49.5)]);
    expect(v.elements).toBe("FA-1 et FA-2");
    expect(espaces(v.montant)).toBe("150,00 €");
    expect(v.client).toBe("Mme Martin");
    expect(varsRelance("pieces", {}, [f("a", 0), f("b", 0)]).pieces).toBe("Facture a, Facture b");
  });
  it("le bloc d'un solde de plusieurs factures donne le total ; le texte brut reprend chaque élément", () => {
    const d = EXEMPLES.solde;
    const b = blocRelance("solde", d, d.elements, { parElement: {}, principal: "https://espace.example/f" });
    expect(b.texte).toContain("Régler en ligne : https://espace.example/f");
    for (const e of d.elements) expect(b.texte).toContain(e.titre);
    if (d.elements.length > 1) expect(espaces(b.texte)).toMatch(/Total à régler : /);
  });
  it("plusieurs devis : un lien chacun, pas de bouton commun ; un seul : le bouton mène au sien", () => {
    const e = (id: string) => ({ id, titre: `Devis ${id}`, court: id, detail: "", valeur: "1 000 € TTC" });
    const liens = { parElement: { "devis:1": "https://s/1", "devis:2": "https://s/2" }, principal: "https://espace" };
    const deux = blocRelance("devis", { elements: [e("devis:1"), e("devis:2")], espace: null, avant: null, faits: null }, [e("devis:1"), e("devis:2")], liens);
    expect(deux.texte).toContain("Voir et signer ce devis : https://s/1");
    expect(deux.texte).not.toContain("Signer le devis : ");
    const un = blocRelance("devis", { elements: [e("devis:1")], espace: null, avant: null, faits: null }, [e("devis:1")], liens);
    expect(un.texte).toContain("Signer le devis : https://s/1");
  });
  it("le bloc échappe ce que saisit le client ou l'équipe (pas d'injection HTML)", () => {
    const e = { id: "piece:1", titre: '<img src=x onerror="alert(1)">', court: "x", detail: "<script>alert(2)</script>", valeur: null };
    const b = blocRelance("pieces", { elements: [e], espace: null, avant: null, faits: null }, [e], { parElement: {}, principal: null });
    expect(b.html).not.toContain("<script>");
    expect(b.html).not.toContain("<img src=x");
    expect(b.html).toContain("&lt;script&gt;");
  });
  it("rien de coché : pas de bloc HTML", () => {
    expect(blocRelance("pieces", EXEMPLES.pieces, [], { parElement: {}, principal: null }).html).toBe("");
  });
  it("texteLisible : la liste marquée là où l'e-mail la posera, variables remplies", () => {
    const corps = "Bonjour {client},\n\nIl manque des pièces.\n\nMerci,\n{commercial}";
    // Trois paragraphes ou plus, sans {elements} : la liste avant la signature.
    expect(texteLisible(corps, { client: "Mme Martin", commercial: "Céline", elements: "X" }, "email")).toBe(`Bonjour Mme Martin,\n\nIl manque des pièces.\n\n${MARQUE_LISTE}\n\nMerci,\nCéline`);
    expect(texteLisible("Votre devis {elements} attend.", { elements: "DV-1" }, "sms")).toBe(`Votre devis ${MARQUE_LISTE} attend.`);
    expect(texteLisible("Court.", {}, "email")).toBe(`Court.\n\n${MARQUE_LISTE}`);
    expect(texteAEnvoyer(`A ${MARQUE_LISTE} B ${MARQUE_LISTE}`)).toBe("A {elements} B {elements}");
  });
  it("versTexteCarte : rend le texte personnalisé à ses variables quand c'est sûr", () => {
    const origine = { objet: "Votre dossier", corps: "Bonjour {client},\n\nVotre dossier {ref}.\n\n{elements}\n\nMerci,\n{commercial}" };
    const vars = { client: "Madame Dupont", commercial: "Céline Moreau", ref: "BD-2026-0042", elements: "x" };
    const perso = { objet: "Votre dossier", corps: `Bonjour Madame Dupont,\n\nVotre dossier BD-2026-0042. Un mot de plus.\n\n${MARQUE_LISTE}\n\nMerci,\nCéline Moreau` };
    expect(versTexteCarte(perso, origine, vars, ["client", "commercial", "ref", "elements"], "email")).toEqual({
      ok: true, objet: "Votre dossier", corps: "Bonjour {client},\n\nVotre dossier {ref}. Un mot de plus.\n\n{elements}\n\nMerci,\n{commercial}",
    });
  });
  // Protège le comptage sur l'objet REMPLI, tel que l'éditeur le présente (variable dans l'objet de la carte).
  it("versTexteCarte accepte un objet de carte qui contient une variable (texte proposé du solde)", () => {
    const origine = TEXTES_PROPOSES.relance_solde;
    const vars = { client: "Madame Dupont", commercial: "Céline Moreau", ref: "BD-2026-0042", montant: "150,00 €", elements: "FA-1" };
    const { elements: _e, ...autres } = vars;
    void _e;
    const perso = { objet: origine.objet!.replace("{montant}", autres.montant), corps: texteLisible(origine.corps, vars, "email").replace("Bien cordialement", "Bien à vous") };
    const r = versTexteCarte(perso, origine, vars, ["client", "commercial", "date", "heure", "ref", "montant", "elements"], "email");
    expect(r).toMatchObject({ ok: true, objet: "Votre règlement de {montant} reste à effectuer" });
  });
  it("versTexteCarte refuse : valeur déjà écrite en dur, valeur répétée, valeurs qui se recoupent, variable inconnue", () => {
    const origine = { objet: null, corps: "Bonjour {client}, Bailly Déménagement vous écrit." };
    const v = ["client", "commercial"];
    expect(versTexteCarte({ objet: null, corps: "Bonjour Bailly Déménagement" }, origine, { client: "Bailly Déménagement" }, v, "sms")).toMatchObject({ ok: false });
    expect(versTexteCarte({ objet: null, corps: "Bonjour Jean, Jean !" }, { objet: null, corps: "Bonjour {client} !" }, { client: "Jean" }, v, "sms")).toMatchObject({ ok: false });
    expect(versTexteCarte({ objet: null, corps: "x" }, origine, { client: "Jean Moreau", commercial: "Moreau" }, v, "sms")).toMatchObject({ ok: false });
    expect(versTexteCarte({ objet: null, corps: "Bonjour {client} {pirate}" }, { objet: null, corps: "Bonjour {client}" }, { client: "Jean" }, v, "sms")).toEqual({ ok: false, raison: "{pirate} n'est pas une variable de cette carte." });
  });
});

/* ---------- le moteur : quelle relance tombe quand ---------- */

const regleDevis = (o: Partial<Regle> = {}) => ({ type: "devis", actif: true, premier_delai_jours: 2, intervalle_jours: 5, nombre_max: 2, repere: "envoi_devis", canaux: ["email"], jours_envoi: null, heure_debut: null, heure_fin: null, segments_exclus: [], maj_le: null, maj_par: null, ...o });
const carte = (cle: string, corps = "Bonjour {client}", actif = true) => ({ id: 1, cle, canal: cle.endsWith("_sms") ? "sms" : "email", nom: cle, objet: null, corps, etape: null, actif, delai_jours: null, a_valider: false, maj_le: null });
const dossierDevis = (o: Record<string, unknown> = {}) => ({
  id: 1, ref: "BD-2026-0001", statut: "devis", date_chargement: null, segment: "particulier", nom: "Martin", prenom: "Anne", societe: null,
  envoye: "2026-11-10 09:00:00+00", numero: "DV-2026-0001", signe: false,
  attente: [{ id: 11, numero: "DV-2026-0001", formule: "standard", montant: 1200, envoye_le: "2026-11-10T09:00:00Z", validite: "2027-01-09", token: "abc" }], ...o,
});
const decision = (cle: string, o: Record<string, unknown>) => ({ cle, statut: "envoyee", report_au: null, envoyee_le: null, envoi_statut: "envoye", envoi_motif: null, canaux: ["email"], ...o });
const devisDe = (rs: Relance[]) => rs.filter((r) => r.type === "devis").map((r) => ({ cle: r.cle, colonne: r.colonne, prevue: r.prevue, motif: r.motif }));

describe("relances/moteur · listerRelances (relance de devis)", () => {
  beforeEach(() => {
    Object.assign(etat, { regles: [regleDevis()], cartes: [carte("devis_relance")], devis: [dossierDevis()], dejaRelances: [], factures: [], decisions: [], exclusions: [] });
  });

  it("première relance 2 jours après l'envoi : à venir, puis aujourd'hui, puis en retard", async () => {
    expect(devisDe(await listerRelances("2026-11-11"))).toEqual([{ cle: "devis:1:1", colonne: "avenir", prevue: "2026-11-12", motif: null }]);
    expect((await listerRelances("2026-11-12"))[0].colonne).toBe("aujourdhui");
    expect((await listerRelances("2026-11-14"))[0].colonne).toBe("retard");
  });
  it("la relance porte ce qu'elle demande : chaque devis sans réponse", async () => {
    const [r] = await listerRelances("2026-11-12");
    expect(r.demande.elements.map((e) => e.id)).toEqual(["devis:11"]);
    expect(espaces(r.demande.elements[0].valeur!)).toBe("1 200,00 € TTC");
    expect(r.canaux).toEqual(["email"]);
  });
  it("après la première envoyée : la seconde au calendrier (envoi + 2 + 5 = 17)", async () => {
    etat.decisions = [decision("devis:1:1", { envoyee_le: "2026-11-12T10:00:00Z" })];
    expect(devisDe(await listerRelances("2026-11-13"))).toEqual([
      { cle: "devis:1:1", colonne: "envoyee", prevue: "2026-11-12", motif: null },
      { cle: "devis:1:2", colonne: "avenir", prevue: "2026-11-17", motif: null },
    ]);
  });
  it("une relance envoyée en retard repousse la suivante : jamais moins de l'intervalle après la dernière partie", async () => {
    etat.decisions = [decision("devis:1:1", { envoyee_le: "2026-11-15T10:00:00Z" })]; // 15 + 5 = 20 > 17
    expect((await listerRelances("2026-11-16")).find((r) => r.cle === "devis:1:2")?.prevue).toBe("2026-11-20");
  });
  it("une relance envoyée à la main en avance ne rapproche pas la suivante du calendrier", async () => {
    etat.decisions = [decision("devis:1:1", { envoyee_le: "2026-11-10T16:00:00Z" })]; // 10 + 5 = 15 < 17
    expect((await listerRelances("2026-11-11")).find((r) => r.cle === "devis:1:2")?.prevue).toBe("2026-11-17");
  });
  it("toutes parties : plus rien d'à venir, les envoyées restent visibles", async () => {
    etat.decisions = [decision("devis:1:1", { envoyee_le: "2026-11-12T10:00:00Z" }), decision("devis:1:2", { envoyee_le: "2026-11-17T10:00:00Z" })];
    expect(devisDe(await listerRelances("2026-11-20")).map((r) => r.colonne)).toEqual(["envoyee", "envoyee"]);
  });
  it("hors suite, à la main : un 3ᵉ envoi s'ajoute au-delà du nombre de la règle", async () => {
    etat.decisions = [decision("devis:1:1", { envoyee_le: "2026-11-12T10:00:00Z" }), decision("devis:1:2", { envoyee_le: "2026-11-17T10:00:00Z" })];
    const r = (await listerRelances("2026-11-20", { manuelles: true })).find((x) => x.cle === "devis:1:3")!;
    expect(r).toMatchObject({ rang: 3, prevue: "2026-11-20", colonne: "aujourdhui", bloquee: null });
    expect(r.horsSuite).toMatch(/Les 2 relances prévues sont parties/);
  });
  it("repoussée : à la date choisie, marquée reportée ; annulée : désactivée et bloquée", async () => {
    etat.decisions = [decision("devis:1:1", { statut: "reportee", report_au: new Date("2026-11-20T00:00:00Z"), envoyee_le: null })];
    expect((await listerRelances("2026-11-13"))[0]).toMatchObject({ prevue: "2026-11-20", reportee: true, colonne: "avenir" });
    etat.decisions = [decision("devis:1:1", { statut: "annulee", envoyee_le: null })];
    expect((await listerRelances("2026-11-13"))[0]).toMatchObject({ colonne: "desactivee", motif: "Annulée par l'équipe.", bloquee: "Annulée par l'équipe." });
  });
  it("jours d'envoi : une relance qui tomberait un samedi part le lundi", async () => {
    etat.regles = [regleDevis({ jours_envoi: [1, 2, 3, 4, 5] })];
    etat.devis = [dossierDevis({ envoye: "2026-11-12 09:00:00+00" })]; // jeudi + 2 = samedi 14
    expect((await listerRelances("2026-11-13"))[0].prevue).toBe("2026-11-16");
  });
  it("devis signé sans relance passée : aucune relance ; avec relances passées : arrêtée, réglée", async () => {
    etat.devis = [dossierDevis({ signe: true })];
    expect(devisDe(await listerRelances("2026-11-13"))).toEqual([]);
    etat.dejaRelances = [{ dossier_id: 1 }];
    const [r] = await listerRelances("2026-11-13");
    expect(r).toMatchObject({ colonne: "desactivee", motif: "Devis signé : relances arrêtées.", reglee: true });
  });
  it("dossier perdu : la suite s'arrête avec la raison", async () => {
    etat.devis = [dossierDevis({ statut: "perdu" })];
    expect((await listerRelances("2026-11-13"))[0]).toMatchObject({ colonne: "desactivee", motif: "Dossier perdu." });
  });
  it("règle désactivée, dossier exclu, segment écarté : désactivée et bloquée même à la main", async () => {
    etat.regles = [regleDevis({ actif: false })];
    expect((await listerRelances("2026-11-13"))[0]).toMatchObject({ colonne: "desactivee", bloquee: "Règle désactivée." });
    etat.regles = [regleDevis()];
    etat.exclusions = [{ dossier_id: 1, type: "*" }];
    expect((await listerRelances("2026-11-13"))[0].bloquee).toBe("Dossier marqué « ne pas relancer ».");
    etat.exclusions = [];
    etat.regles = [regleDevis({ segments_exclus: ["particulier"] })];
    expect((await listerRelances("2026-11-13"))[0].bloquee).toBe("Segment « Particulier » exclu de cette relance.");
  });
  it("carte sans texte : désactivée pour la veille, mais pas bloquée (l'écran d'envoi propose un texte)", async () => {
    etat.cartes = [carte("devis_relance", "   ")];
    expect((await listerRelances("2026-11-13"))[0]).toMatchObject({ colonne: "desactivee", motif: "Texte de la carte à valider dans « Courriers et SMS ».", bloquee: null, aRediger: true });
    etat.cartes = [carte("devis_relance", "Bonjour", false)];
    expect((await listerRelances("2026-11-13"))[0]).toMatchObject({ motif: "Carte désactivée dans « Courriers et SMS ».", aRediger: false });
  });
  // Protège le jour d'envoi du devis lu à Paris, pas en UTC (envoi entre minuit et 1 h).
  it("le jour d'envoi d'un devis est celui de Paris (envoyé le 11 nov. à 0 h 30)", async () => {
    etat.devis = [dossierDevis({ envoye: "2026-11-10 23:30:00+00" })];
    const [r] = await listerRelances("2026-11-11");
    expect(r.prevue).toBe("2026-11-13");
    expect(r.objet).toMatch(/envoyé le 11 nov\./);
  });
  it("une relance désactivée de plus de 60 jours n'est plus montrée", async () => {
    etat.regles = [regleDevis({ actif: false })];
    expect(await listerRelances("2027-01-12")).toEqual([]); // prévue le 12 nov., plus de 60 jours avant
    expect(await listerRelances("2027-01-10")).toHaveLength(1);
  });
  it("repère « avant la date de chargement » : rien au-delà du déménagement ; sans date, compté à part", async () => {
    etat.regles = [regleDevis({ repere: "demenagement" })];
    etat.devis = [dossierDevis({ date_chargement: new Date("2026-12-01T00:00:00Z") })];
    // 1er déc. − 2 j = 29 nov. ; la 2ᵉ (29 nov. + 5) tomberait après le chargement : pas de 2ᵉ.
    expect(devisDe(await listerRelances("2026-11-20"))).toEqual([{ cle: "devis:1:1", colonne: "avenir", prevue: "2026-11-29", motif: null }]);
    expect(await listerRelances("2026-12-01")).toEqual([]);
    etat.devis = [dossierDevis({ date_chargement: null })];
    const s = await simulerRegle("devis", regleDevis({ repere: "demenagement" }) as Regle, "2026-11-20");
    expect(s.sansDate.apres).toBe(1);
    expect(s.apres).toEqual([]);
  });
  it("simulerRegle : compare la règle enregistrée et un brouillon, sans rien envoyer", async () => {
    const s = await simulerRegle("devis", regleDevis({ premier_delai_jours: 7 }) as Regle, "2026-11-11");
    expect(s.avant.map((r) => r.prevue)).toEqual(["2026-11-12"]);
    expect(s.apres.map((r) => r.prevue)).toEqual(["2026-11-17"]);
  });
  it("les relances sont triées par date prévue", async () => {
    etat.devis = [dossierDevis({ id: 2, ref: "B", envoye: "2026-11-12 09:00:00+00" }), dossierDevis({ id: 1, envoye: "2026-11-01 09:00:00+00" }), dossierDevis({ id: 3, ref: "C", envoye: "2026-11-05 09:00:00+00" })];
    const p = (await listerRelances("2026-11-10")).map((r) => r.prevue);
    expect(p).toEqual([...p].sort());
  });
});

describe("relances/moteur · duesPourLaVeille", () => {
  const rel = (cle: string, colonne: Relance["colonne"], prevue: string, type: TypeRelance = "devis") => ({ cle, colonne, prevue, type }) as Relance;
  const regles = (o: Partial<Regle> = {}) => new Map([["devis", regleDevis(o) as Regle]]) as Map<TypeRelance, Regle>;
  const liste = [rel("a", "aujourdhui", "2026-11-16"), rel("b", "retard", "2026-11-13"), rel("c", "retard", "2026-11-12"), rel("d", "avenir", "2026-11-20"), rel("e", "envoyee", "2026-11-16"), rel("f", "desactivee", "2026-11-16")];
  const lundi16h = new Date("2026-11-16T15:00:00Z"); // lundi, 16 h à Paris

  it("celles du jour et celles en retard de trois jours au plus ; au-delà, elles attendent l'équipe", () => {
    expect(RATTRAPAGE_JOURS).toBe(3);
    const r = duesPourLaVeille(liste, regles(), lundi16h);
    expect(r.dues.map((x) => x.cle)).toEqual(["a", "b"]);
    expect(r.enAttente).toBe(1);
    expect(r.horsCreneau).toBe(0);
  });
  it("hors des heures ou des jours d'envoi de la règle : retenues, comptées « hors créneau »", () => {
    expect(duesPourLaVeille(liste, regles({ heure_debut: 9, heure_fin: 16 }), lundi16h)).toMatchObject({ dues: [], horsCreneau: 2 });
    expect(duesPourLaVeille(liste, regles({ jours_envoi: [2, 3, 4, 5] }), lundi16h).dues).toEqual([]);
    expect(duesPourLaVeille(liste, regles({ heure_debut: 16, heure_fin: 17 }), lundi16h).dues).toHaveLength(2);
  });
  it("le jour de la veille est celui de Paris : à 23 h 30 UTC le 31 décembre, c'est le 1er janvier", () => {
    const r = duesPourLaVeille([rel("x", "aujourdhui", "2027-01-01"), rel("y", "retard", "2026-12-28"), rel("z", "retard", "2026-12-29")], regles(), new Date("2026-12-31T23:30:00Z"));
    expect(r.dues.map((x) => x.cle)).toEqual(["x", "z"]);
    expect(r.enAttente).toBe(1);
  });
});
