import { describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: vi.fn(async () => undefined) }));

import { dernierSigne, etapesPiste, leJour, leJourHeure, libellePage, resumePiste, type SuiviEnvoi } from "@/crm/suivi/etapes";
import { habillageActivite, issueEnvoi } from "@/crm/feed/phrases";
import { CATALOGUE, entree, raisonDeNePasEnvoyer, type LigneModele } from "@/crm/messages/catalogue";
import { RELANCE_ESPACE, RELANCES } from "@/crm/relances/regles";
import { TEXTES_PROPOSES } from "@/crm/relances/courrier";

const suivi = (o: Partial<SuiviEnvoi> = {}): SuiviEnvoi => ({
  envoiId: "e1", statut: "envoye", motif: null, envoyeLe: "2026-11-08T13:05:00Z", delivre: null, rebond: null, plainte: null, desinscription: null,
  ouvertures: { n: 0, auto: 0, premiere: null, derniere: null, premiereAuto: null, agents: [] }, clics: [], portail: { n: 0, premiere: null, derniere: null, pages: [] }, ...o,
});
const clic = (indice: number, libelle: string | null, n: number, dernier: string, auto = 0) => ({ indice, libelle, destination: null, n, auto, premier: dernier, dernier });

describe("suivi/etapes · la piste d'un e-mail", () => {
  it("dates à l'heure de Paris : « le 8 nov. à 14:05 »", () => {
    expect(leJourHeure("2026-11-08T13:05:00Z")).toBe("le 8 nov. à 14:05");
    expect(leJourHeure("2026-07-08T13:05:00Z")).toBe("le 8 juil. à 15:05");
    expect(leJour("2026-12-31T23:30:00Z")).toBe("le 1 janv.");
  });
  it("envoyé sans nouvelle : « pas d'ouverture relevée », jamais « non lu »", () => {
    const p = etapesPiste(suivi());
    expect(p.map((e) => [e.cle, e.libelle, e.etat])).toEqual([["depart", "Envoyé", "ok"], ["ouverture", "Pas d'ouverture relevée", "attente"]]);
    expect(p[0].titre).toBe("Parti chez Brevo · le 8 nov. à 14:05");
  });
  it("journalisé : rien n'est parti, la raison suit ; pas d'étape d'ouverture", () => {
    const p = etapesPiste(suivi({ statut: "journalise", motif: "ENVOI_MODE=desactive" }));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ libelle: "Journalisé", etat: "neutre" });
    expect(p[0].titre).toMatch(/ · ENVOI_MODE=desactive$/);
  });
  it("un statut inconnu s'affiche tel quel, neutre", () => {
    expect(etapesPiste(suivi({ statut: "mystere" }))[0]).toMatchObject({ libelle: "mystere", etat: "neutre" });
  });
  it("rebond : « Non délivré », et plus d'attente d'ouverture ; délivré seulement si Brevo l'a dit", () => {
    const p = etapesPiste(suivi({ rebond: { genre: "hard_bounce", le: "2026-11-08T13:06:00Z", raison: "boîte inconnue" }, delivre: "2026-11-08T13:06:00Z" }));
    expect(p.map((e) => e.libelle)).toEqual(["Envoyé", "Non délivré"]);
    expect(p[1].titre).toBe("Rebond (hard bounce) le 8 nov. à 14:06 · boîte inconnue — selon Brevo");
    expect(etapesPiste(suivi({ delivre: "2026-11-08T13:06:00Z" }))[1]).toMatchObject({ libelle: "Délivré", etat: "ok" });
  });
  it("une ouverture relevée par une machine est « probable », jamais certaine", () => {
    const p = etapesPiste(suivi({ ouvertures: { n: 0, auto: 2, premiere: null, derniere: null, premiereAuto: "2026-11-08T13:07:00Z", agents: ["apple_proxy", "apple_proxy"] } }));
    expect(p[1]).toMatchObject({ cle: "ouverture", libelle: "Ouverture probable", etat: "probable" });
    expect(p[1].titre).toContain("Apple Mail (protection de la vie privée) :");
  });
  it("ouvertures et clics : le lien le plus cliqué, à égalité le premier de l'e-mail", () => {
    const p = etapesPiste(suivi({
      ouvertures: { n: 3, auto: 1, premiere: "2026-11-08T14:00:00Z", derniere: "2026-11-09T08:00:00Z", premiereAuto: null, agents: [] },
      clics: [clic(2, "Mentions", 2, "2026-11-09T08:00:00Z"), clic(1, "Signer le devis", 2, "2026-11-08T14:01:00Z"), clic(3, null, 0, "2026-11-08T14:01:00Z", 4)],
      portail: { n: 2, premiere: "2026-11-08T14:02:00Z", derniere: "2026-11-08T14:10:00Z", pages: ["page-inconnue"] },
    }));
    expect(p.map((e) => e.libelle)).toEqual(["Envoyé", "Ouvert 3×", "Cliqué « Signer le devis » 2× +1 lien", "Sur le portail le 8 nov."]);
    expect(p[1].titre).toMatch(/^Ouvert 3 fois : la première le 8 nov\. à 15:00, la dernière le 9 nov\. à 09:00 · plus 1 relevé automatique\./);
    expect(p[3].titre).toContain("page-inconnue");
  });
  it("seulement des clics automatiques : « clic probable »", () => {
    expect(etapesPiste(suivi({ clics: [clic(1, null, 0, "2026-11-08T14:01:00Z", 1)] }))[2]).toMatchObject({ libelle: "Clic probable", etat: "probable" });
  });
  it("plainte et désinscription sont des alertes", () => {
    const p = etapesPiste(suivi({ plainte: "2026-11-08T15:00:00Z", desinscription: "2026-11-08T15:01:00Z" }));
    expect(p.filter((e) => e.etat === "alerte").map((e) => e.libelle)).toEqual(["Signalé comme indésirable", "Désinscrit"]);
  });
  it("résumé en une ligne, et le dernier signe de vie certain", () => {
    const s = suivi({ ouvertures: { n: 2, auto: 0, premiere: "2026-11-08T14:00:00Z", derniere: "2026-11-09T08:00:00Z", premiereAuto: null, agents: [] }, clics: [clic(1, "Signer", 1, "2026-11-09T09:00:00Z"), clic(2, "Pied", 2, "2026-11-08T10:00:00Z")] });
    expect(resumePiste(s)).toBe("Envoyé le 8 nov. · ouvert 2× · cliqué 3×");
    expect(resumePiste(s, { sansDepart: true })).toBe("ouvert 2× · cliqué 3×");
    expect(resumePiste(suivi({ rebond: { genre: "soft", le: "2026-11-08T13:06:00Z", raison: null }, ouvertures: { n: 0, auto: 1, premiere: null, derniere: null, premiereAuto: "x", agents: [] } }))).toBe("Envoyé le 8 nov. · non délivré · ouverture probable");
    expect(dernierSigne(s)).toEqual({ quand: "2026-11-09T09:00:00Z", quoi: "cliqué", libelle: "Signer" });
    expect(dernierSigne({ ...s, clics: [] })).toEqual({ quand: "2026-11-09T08:00:00Z", quoi: "ouvert", libelle: null });
    expect(dernierSigne(suivi({ ouvertures: { n: 0, auto: 5, premiere: null, derniere: null, premiereAuto: "x", agents: [] } }))).toBeNull();
    expect(libellePage("inconnue")).toBe("inconnue");
  });
});

describe("feed/phrases · issue d'un envoi et habit d'une ligne d'activité", () => {
  it("l'issue d'un message, quel que soit le journal", () => {
    expect(issueEnvoi("envoyee")).toEqual({ libelle: "Envoyé", ton: "vert" });
    expect(issueEnvoi("journalisee")?.ton).toBe("ambre");
    expect(issueEnvoi("incertain")).toEqual({ libelle: "Échec", ton: "rouge" });
    expect(issueEnvoi(null)).toBeNull();
    expect(issueEnvoi("toString")).toBeNull();
  });
  it("une suppression est rouge ; une signature au féminin ou au pluriel est verte ; sinon selon le genre", () => {
    expect(habillageActivite("devis", "x", true)).toEqual({ icone: "corbeille", ton: "rouge" });
    expect(habillageActivite("devis", "Fin de chantier signée")).toEqual({ icone: "signature", ton: "vert" });
    expect(habillageActivite("devis", "Conditions acceptées")).toEqual({ icone: "signature", ton: "vert" });
    expect(habillageActivite("message", "SMS de rappel")).toEqual({ icone: "sms", ton: "violet" });
    expect(habillageActivite("message", "E-mail de relance")).toEqual({ icone: "courrier", ton: "violet" });
    expect(habillageActivite("exploitation", "Dispatch du conteneur")).toEqual({ icone: "bateau", ton: "indigo" });
    expect(habillageActivite("inconnu", "Assignée à Paul")).toEqual({ icone: "dossierClient", ton: "indigo" });
  });
  // Protège la reconnaissance de « signé » et « accepté » (frontières de mot avec lettres accentuées).
  it("« Devis DV-2026-0001 signé par le client » et « Devis accepté » prennent l'icône de signature", () => {
    expect(habillageActivite("devis", "Devis DV-2026-0001 signé par le client")).toEqual({ icone: "signature", ton: "vert" });
    expect(habillageActivite("devis", "Devis accepté")).toEqual({ icone: "signature", ton: "vert" });
  });
});

describe("messages/catalogue · cohérence des cartes de « Courriers et SMS »", () => {
  it("des clés uniques ; chaque carte de relance existe et connaît {elements}", () => {
    const cles = CATALOGUE.map((e) => e.cle);
    expect(new Set(cles).size).toBe(cles.length);
    for (const d of [...RELANCES, RELANCE_ESPACE]) for (const cle of Object.values(d.cartes)) {
      const e = entree(cle);
      expect(e, cle).not.toBeNull();
      expect(e!.variables).toContain("elements");
    }
    expect(entree("inexistante")).toBeNull();
  });
  it("les textes proposés n'emploient que les variables de leur carte", () => {
    for (const [cle, t] of Object.entries(TEXTES_PROPOSES)) {
      const e = entree(cle);
      expect(e, cle).not.toBeNull();
      const vues = [...`${t.objet ?? ""} ${t.corps}`.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
      for (const v of vues) expect(e!.variables, `${cle} : {${v}}`).toContain(v);
    }
  });
  it("une carte n'est utilisable qu'active et avec un texte", () => {
    const m = (o: Partial<LigneModele>) => ({ id: 1, cle: "x", canal: "email", nom: "x", objet: null, corps: "Bonjour", etape: null, actif: true, delai_jours: null, a_valider: false, maj_le: null, ...o }) as LigneModele;
    expect(raisonDeNePasEnvoyer(m({}))).toBeNull();
    expect(raisonDeNePasEnvoyer(null)).toBe("Modèle introuvable dans « Courriers et SMS ».");
    expect(raisonDeNePasEnvoyer(m({ corps: " \n " }))).toMatch(/^Texte à rédiger/);
    expect(raisonDeNePasEnvoyer(m({ actif: false }))).toMatch(/^Message désactivé/);
    expect(raisonDeNePasEnvoyer(m({ actif: false, corps: "" }))).toMatch(/^Texte à rédiger/);
  });
});
