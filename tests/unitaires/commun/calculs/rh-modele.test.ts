import { describe, expect, it } from "vitest";
import {
  aUnEspaceRh,
  ETAPE_RH,
  ETAPES_EN_COURS,
  ETAPES_RH,
  etapeDeDemande,
  etapeDeDossier,
  exempleRh,
  FORMULES_ORDRE,
  FORMULES_RH,
  formuleRh,
  moisDe,
  PAYEURS_RH,
  villeDeLAdresse,
} from "@/lib/rh-modele";

describe("étapes RH", () => {
  it("l'ordre de chaque étape est son rang dans la liste", () => {
    ETAPES_RH.forEach((e, i) => expect(ETAPE_RH[e.cle].ordre).toBe(i));
  });

  it("les étapes en cours sont les six premières ; terminé, sans suite et clôturée sont fermées", () => {
    expect(ETAPES_EN_COURS.map((e) => e.cle)).toEqual(["recue", "estimee", "visite", "devis", "signe", "planifie"]);
    for (const c of ["termine", "sans_suite", "cloturee"] as const) expect(ETAPE_RH[c].ouverte).toBe(false);
  });

  it("les mots de vente de l'équipe (« Perdu », « Gagnée ») n'apparaissent pas", () => {
    for (const e of ETAPES_RH) expect(e.label).not.toMatch(/perdu|gagn/i);
  });

  it.each([
    ["new", "recue"], ["qualified", "estimee"], ["quoted", "devis"], ["won", "signe"],
    ["lost", "sans_suite"], ["archived", "cloturee"], ["", "recue"], ["inconnu", "recue"],
  ])("statut de demande %j → %s", (statut, etape) => {
    expect(etapeDeDemande(statut)).toBe(etape);
  });

  it.each([
    ["visite", false, "visite"], ["devis", false, "devis"], ["commande", false, "signe"],
    ["planifie", false, "planifie"], ["planifie", true, "cloturee"],
    ["termine", false, "termine"], ["termine", true, "termine"],
    ["perdu", false, "sans_suite"], ["perdu", true, "sans_suite"],
    ["nouveau", false, "recue"], ["nouveau", true, "cloturee"],
  ] as const)("dossier %s (archivé : %s) → %s", (statut, archive, etape) => {
    expect(etapeDeDossier(statut, archive)).toBe(etape);
  });
});

describe("payeur et formules", () => {
  it("chaque payeur a un libellé et une aide", () => {
    for (const p of Object.values(PAYEURS_RH)) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.aide.length).toBeGreaterThan(0);
    }
  });

  it("l'espace pro standard n'a pas d'espace RH", () => {
    expect(aUnEspaceRh({ slug: "standard" })).toBe(false);
    expect(aUnEspaceRh({ slug: "carrefour" })).toBe(true);
  });

  it.each([
    ["eco", "eco"], ["economique", "eco"], ["standard", "standard"], ["luxe", "luxe"], ["premium", "luxe"],
    ["Premium", null], ["", null], [null, null], [undefined, null],
  ])("formule %j → %j", (v, f) => {
    expect(formuleRh(v)).toBe(f);
  });

  it("les noms du questionnaire : Économique, Standard, Premium", () => {
    expect(FORMULES_ORDRE.map((f) => FORMULES_RH[f])).toEqual(["Économique", "Standard", "Premium"]);
  });
});

describe("moisDe", () => {
  it("le mois de la date, sinon le mois prévu", () => {
    expect(moisDe({ date: "2027-03-15", mois: "2027-05" })).toBe("2027-03");
    expect(moisDe({ date: "2027-03-15T10:00:00Z", mois: null })).toBe("2027-03");
    expect(moisDe({ date: null, mois: "2027-05" })).toBe("2027-05");
    expect(moisDe({ date: null, mois: null })).toBeNull();
  });
});

describe("villeDeLAdresse — la ville, jamais la rue", () => {
  it.each([
    ["12 rue X, 75015 Paris", "Paris", "75015"],
    ["12 rue X 75015 Paris", "Paris", "75015"],
    ["3 avenue Foch, 69006 Lyon, France", "Lyon", "69006"],
    ["8 place Bellecour 69002 Lyon 2e", "Lyon", "69002"],
    ["1 rue du Moulin, 42000 Saint-Étienne", "Saint-Étienne", "42000"],
    ["5 rue Paul Bert, 94240 L'Haÿ-les-Roses", "L'Haÿ-les-Roses", "94240"],
    ["91300 Massy", "Massy", "91300"],
  ])("%j → %s (%s)", (a, ville, cp) => {
    expect(villeDeLAdresse(a)).toEqual({ ville, cp });
  });

  it("« Paris 15e » reste tel quel", () => {
    expect(villeDeLAdresse("Paris 15e")).toEqual({ ville: "Paris 15e", cp: null });
  });

  it("sans code postal : le dernier morceau qui n'est pas un pays", () => {
    expect(villeDeLAdresse("Lyon, France")).toEqual({ ville: "Lyon", cp: null });
    expect(villeDeLAdresse("Genève, Suisse")).toEqual({ ville: "Genève", cp: null });
  });

  it.each([
    ["12 rue de la Paix"],
    ["Rue de la Paix"],
    ["Boulevard Haussmann"],
    ["Bd Haussmann"],
    ["Allée des Roses"],
    ["Impasse du Puits, France"],
    ["Quai de Seine"],
    ["France"],
    [""],
    ["   "],
    [null],
    [undefined],
  ])("%j : rien plutôt qu'une rue", (a) => {
    expect(villeDeLAdresse(a)).toEqual({ ville: null, cp: null });
  });

  it("jamais une ville qui commence par un numéro", () => {
    for (const a of ["12 bis, 3 rue X", "4, 5", "75015", "  7 impasse Y  "]) {
      const v = villeDeLAdresse(a).ville;
      if (v) expect(v).not.toMatch(/^\d/);
    }
  });

  // « Av. », comme « Bd », est un mot de rue : mieux vaut un tiret qu'une rue.
  it("« Av. Foch » : rien plutôt qu'une rue", () => {
    expect(villeDeLAdresse("Av. Foch")).toEqual({ ville: null, cp: null });
  });
});

describe("exempleRh — le jeu d'exemple de l'aperçu", () => {
  const MAINTENANT = Date.parse("2026-11-15T10:00:00Z");
  const avec = exempleRh("carrefour", true, MAINTENANT);
  const sans = exempleRh("carrefour", false, MAINTENANT);

  it("toujours le même pour une même entreprise et un même instant", () => {
    expect(exempleRh("carrefour", true, MAINTENANT)).toEqual(avec);
  });

  it("deux entreprises ont deux jeux différents", () => {
    expect(exempleRh("engie", true, MAINTENANT).mobilites).not.toEqual(avec.mobilites);
  });

  it("38 mobilités, triées de la plus récente à la plus ancienne", () => {
    expect(avec.mobilites).toHaveLength(38);
    for (let i = 1; i < avec.mobilites.length; i++) expect(avec.mobilites[i - 1].cree_le >= avec.mobilites[i].cree_le).toBe(true);
  });

  it("une graine vide fonctionne aussi", () => {
    expect(exempleRh("", true, MAINTENANT).mobilites).toHaveLength(38);
  });

  it("sans accès aux coûts : aucun montant, aucune facture", () => {
    expect(sans.factures).toEqual([]);
    for (const m of sans.mobilites) {
      expect(m.montant).toBeNull();
      expect(m.facture_ttc).toBe(0);
    }
  });

  it("avec accès aux coûts : TTC = HT × 1,2 arrondi, HT à la dizaine", () => {
    for (const m of avec.mobilites)
      if (m.montant) {
        expect(m.montant.ttc).toBe(Math.round(m.montant.ht * 1.2));
        expect(m.montant.ht % 10).toBe(0);
      }
  });

  it("le prix d'un salarié qui paie lui-même ne regarde que lui ; une demande non chiffrée n'a pas de prix", () => {
    for (const m of avec.mobilites) {
      if (m.payeur === "salarie") expect(m.montant).toBeNull();
      if (m.etape === "recue") expect(m.montant).toBeNull();
    }
  });

  it("payeur à confirmer ⇔ demande sans dossier", () => {
    for (const m of avec.mobilites) expect(m.payeur === "a_confirmer").toBe(m.origine === "demande");
  });

  it("date fixée ⇔ planifiée ou terminée", () => {
    for (const m of avec.mobilites) expect(m.date_fixee).toBe(m.etape === "planifie" || m.etape === "termine");
  });

  it("chronologie du plus ancien au plus récent, ouverte par la demande", () => {
    for (const m of avec.mobilites) {
      expect(m.chronologie[0].libelle).toBe("Demande envoyée par le collaborateur");
      for (let i = 1; i < m.chronologie.length; i++) expect(m.chronologie[i - 1].date <= m.chronologie[i].date).toBe(true);
    }
  });

  it("départ et arrivée toujours différents, distance et volume plausibles", () => {
    for (const m of avec.mobilites) {
      expect(m.depart).not.toBe(m.arrivee);
      expect(m.distance_km).toBeGreaterThan(0);
      expect(m.volume_m3).toBeGreaterThanOrEqual(12);
      expect(m.volume_m3).toBeLessThanOrEqual(60);
    }
  });

  it("factures : seulement pour un déménagement terminé payé par l'entreprise, au même TTC que la mobilité", () => {
    const parId = new Map(avec.mobilites.map((m) => [m.id, m]));
    for (const f of avec.factures) {
      const m = parId.get(f.mobilite!)!;
      expect(m.etape).toBe("termine");
      expect(m.payeur).toBe("entreprise");
      expect(f.ttc).toBe(m.facture_ttc);
      expect(f.reste).toBe(f.statut === "payee" ? 0 : f.ttc);
    }
    for (let i = 1; i < avec.factures.length; i++) expect(avec.factures[i - 1].emise_le >= avec.factures[i].emise_le).toBe(true);
  });

  it("une facture en retard a dépassé son échéance de 30 jours", () => {
    for (const f of avec.factures) {
      if (f.statut === "retard") expect(Date.parse(f.echeance_le!)).toBeLessThan(MAINTENANT);
      if (f.statut === "emise") expect(Date.parse(f.echeance_le!) + 86_400_000).toBeGreaterThanOrEqual(MAINTENANT);
    }
  });
});
