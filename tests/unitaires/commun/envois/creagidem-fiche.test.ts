import { describe, expect, it } from "vitest";
import { dateOuPeriode, ficheDepuisDemande, jourCreagidem, manquesFiche, valeurDeclaree } from "@/lib/creagidem/fiche";
import { demande } from "./_demande";


const o = { emetteur: "BAILLY-WEB", distanceKm: 465.4, lienCrm: "https://crm.bailly.fr/dashboard/8d0c", aujourdhui: new Date("2026-11-15T09:00:00Z") };

describe("creagidem/fiche — jourCreagidem", () => {
  it("AAAAMMJJ, dans le fuseau de Paris (et non celui du serveur)", () => {
    expect(jourCreagidem(new Date("2026-11-15T12:00:00Z"))).toBe("20261115");
    // 23 h 30 UTC le 14 : déjà le 15 à Paris (UTC+1 en novembre).
    expect(jourCreagidem(new Date("2026-11-14T23:30:00Z"))).toBe("20261115");
    // 22 h 30 UTC le 30 juin : déjà le 1er juillet à Paris (UTC+2 en été).
    expect(jourCreagidem(new Date("2026-06-30T22:30:00Z"))).toBe("20260701");
    expect(jourCreagidem(new Date("2026-06-30T21:59:59Z"))).toBe("20260630");
  });
});

describe("creagidem/fiche — dateOuPeriode", () => {
  it("une date du calendrier devient AAAAMMJJ, même suivie d'une heure", () => {
    expect(dateOuPeriode("2026-12-05", null)).toBe("20261205");
    expect(dateOuPeriode("2026-12-05T08:00:00Z", "fin novembre")).toBe("20261205");
  });

  it("un mois entier « novembre 2026 » devient AAAAMM, accents et casse compris", () => {
    expect(dateOuPeriode(null, "Novembre 2026")).toBe("202611");
    expect(dateOuPeriode(null, "février 2027")).toBe("202702");
    expect(dateOuPeriode(null, "AOÛT 2027")).toBe("202708");
    expect(dateOuPeriode("", "décembre 2026")).toBe("202612");
  });

  it("« début », « mi », « fin », « avant », « après », « entre » : le texte en capitales, que l'équipe lit", () => {
    expect(dateOuPeriode(null, "fin septembre 2026")).toBe("FIN SEPTEMBRE 2026");
    expect(dateOuPeriode(null, "Début novembre 2026")).toBe("DÉBUT NOVEMBRE 2026");
    expect(dateOuPeriode(null, "mi décembre 2026")).toBe("MI DÉCEMBRE 2026");
    expect(dateOuPeriode(null, "après le 15 mars 2027")).toBe("APRÈS LE 15 MARS 2027");
  });

  it("un mois sans année, ou un texte libre : en capitales, borné à 60 caractères", () => {
    expect(dateOuPeriode(null, "septembre")).toBe("SEPTEMBRE");
    expect(dateOuPeriode(null, "dès que possible")).toBe("DÈS QUE POSSIBLE");
    expect(dateOuPeriode(null, "x".repeat(100))).toHaveLength(60);
  });

  it("rien de donné : chaîne vide", () => {
    expect(dateOuPeriode(null, null)).toBe("");
    expect(dateOuPeriode(undefined, "   ")).toBe("");
  });

  it("une date mal formée n'est pas prise pour une date", () => {
    expect(dateOuPeriode("05/12/2026", null)).toBe("");
    expect(dateOuPeriode("2026-1-5", "janvier 2027")).toBe("202701");
  });
});

describe("creagidem/fiche — valeurDeclaree", () => {
  it("la borne haute d'une tranche", () => {
    expect(valeurDeclaree("10 000 – 30 000 €")).toBe(30000);
    expect(valeurDeclaree("Entre 5 000 et 10 000 €")).toBe(10000);
    expect(valeurDeclaree("10\u00a0000 – 30\u202f000 €")).toBe(30000); // espaces insécables
  });

  it("un nombre saisi, avec ou sans séparateur de milliers", () => {
    expect(valeurDeclaree("25000")).toBe(25000);
    expect(valeurDeclaree("25.000")).toBe(25000);
    expect(valeurDeclaree(18000)).toBe(18000);
  });

  it("rien de lisible : null (jamais 0 ni NaN)", () => {
    expect(valeurDeclaree("")).toBeNull();
    expect(valeurDeclaree("je ne sais pas")).toBeNull();
    expect(valeurDeclaree(null)).toBeNull();
    expect(valeurDeclaree(0)).toBeNull();
    expect(valeurDeclaree({ montant: 5 })).toBeNull();
  });
});

describe("creagidem/fiche — ficheDepuisDemande", () => {
  it("la correspondance de base : émetteur, date du jour, client, adresses, opération", () => {
    const f = ficheDepuisDemande(demande(), o);
    expect(f.fiche).toEqual({ emetteur: "BAILLY-WEB", date_demande: "20261115" });
    expect(f.client).toEqual({ nom: "Claire Dumont", prenom: "", email: "claire@gmail.com", tel_portable: "06 12 34 56 78" });
    expect(f.chargement).toMatchObject({ adresse1: "12 rue de la Paix", code_postal: "75002", ville: "Paris", pays: "France", est_rdc: 0, etage: 3, est_ascenseur: 1, date_ou_periode: "20261205" });
    expect(f.livraison).toMatchObject({ adresse1: "4 place Bellecour", code_postal: "69002", ville: "Lyon", est_rdc: 1, etage: 0, est_ascenseur: 0, date_ou_periode: "20261205" });
    expect(f.operation).toMatchObject({ distance: "465.40", valeur: "0.00", type_assurance: "D" });
  });

  it("prénom et nom séparés quand le formulaire les donne, sinon le nom entier (jamais coupé)", () => {
    const separe = ficheDepuisDemande(demande({ raw_payload: { details: { contact: { nom: "Dumont", prenom: "Claire" } } } }), o);
    expect(separe.client).toMatchObject({ nom: "Dumont", prenom: "Claire" });
    const entier = ficheDepuisDemande(demande({ client_nom: "Jean-Pierre de La Fontaine" }), o);
    expect(entier.client).toMatchObject({ nom: "Jean-Pierre de La Fontaine", prenom: "" });
  });

  it("sans nom, l'adresse e-mail en tient lieu", () => {
    expect(ficheDepuisDemande(demande({ client_nom: null }), o).client.nom).toBe("claire@gmail.com");
    expect(ficheDepuisDemande(demande({ client_nom: "   " }), o).client.nom).toBe("claire@gmail.com");
  });

  it("garde les accents et les caractères du nom tels quels (l'API reçoit du JSON, pas du HTML)", () => {
    const f = ficheDepuisDemande(demande({ client_nom: "Émilie Çelik-Œuvray <b>&</b>" }), o);
    expect(f.client.nom).toBe("Émilie Çelik-Œuvray <b>&</b>");
  });

  it("code postal : chiffres seulement ; pays « France » pour un code à 5 chiffres", () => {
    const f = ficheDepuisDemande(demande({ depart_code_postal: "75 002", arrivee_code_postal: "H2X 1Y4", raw_payload: { details: { arrivee: { pays: "Canada" } } } }), o);
    expect(f.chargement.code_postal).toBe("75002");
    expect(f.chargement.pays).toBe("France");
    expect(f.livraison.code_postal).toBe("214");
    expect(f.livraison.pays).toBe("Canada");
    const sansPays = ficheDepuisDemande(demande({ arrivee_code_postal: "1000" }), o);
    expect(sansPays.livraison.pays).toBe("");
  });

  it("étage : entier positif ; RDC seulement pour l'étage 0 ; étage inconnu = 0, sans RDC", () => {
    expect(ficheDepuisDemande(demande({ depart_etage: 2.6 }), o).chargement).toMatchObject({ etage: 3, est_rdc: 0 });
    expect(ficheDepuisDemande(demande({ depart_etage: -1 }), o).chargement).toMatchObject({ etage: 0, est_rdc: 0 });
    expect(ficheDepuisDemande(demande({ depart_etage: null }), o).chargement).toMatchObject({ etage: 0, est_rdc: 0 });
    expect(ficheDepuisDemande(demande({ depart_etage: 0 }), o).chargement).toMatchObject({ etage: 0, est_rdc: 1 });
  });

  it("ascenseur et stationnement : 0 ou 1", () => {
    const f = ficheDepuisDemande(demande({ depart_ascenseur: null, raw_payload: { depart: { stationnement: "oui" }, arrivee: { stationnement: false } } }), o);
    expect(f.chargement).toMatchObject({ est_ascenseur: 0, est_demande_stationnement: 1 });
    expect(f.livraison.est_demande_stationnement).toBe(0);
    for (const v of [true, "true", "1", " OUI "]) expect(ficheDepuisDemande(demande({ raw_payload: { depart: { stationnement: v } } }), o).chargement.est_demande_stationnement, String(v)).toBe(1);
    for (const v of ["non", "0", 1, null, "peut-être"]) expect(ficheDepuisDemande(demande({ raw_payload: { depart: { stationnement: v } } }), o).chargement.est_demande_stationnement, String(v)).toBe(0);
  });

  it("le détail d'accès : accès difficile, difficulté, portage, logement, surface — 100 caractères au plus", () => {
    const f = ficheDepuisDemande(
      demande({ raw_payload: { depart: { acces_difficile: "oui", portage_m: 25, surface: 80 }, details: { depart: { type_difficulte: "Rue étroite", complement: "Bât. B" } } } }),
      o,
    );
    expect(f.chargement.detail_acces).toBe("Accès difficile poids lourds : oui. Rue étroite. Portage 25 m. Appartement. 80 m².");
    expect(f.chargement.adresse2).toBe("Bât. B");
    const long = ficheDepuisDemande(demande({ raw_payload: { details: { depart: { type_difficulte: "é".repeat(300) } } } }), o);
    expect(long.chargement.detail_acces.length).toBe(100);
    expect(ficheDepuisDemande(demande({ raw_payload: { depart: { acces_difficile: false } } }), o).chargement.detail_acces).toMatch(/^Accès difficile poids lourds : non\./);
  });

  it("décimaux à deux chiffres, sans séparateur de milliers", () => {
    const f = ficheDepuisDemande(demande({ raw_payload: { valeur_mobilier: "30 000 – 50 000 €" } }), { ...o, distanceKm: 1250 });
    expect(f.operation.distance).toBe("1250.00");
    expect(f.operation.valeur).toBe("50000.00");
  });

  it("distance absente, nulle, négative ou non finie : « 0.00 »", () => {
    for (const d of [null, 0, -12, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ficheDepuisDemande(demande(), { ...o, distanceKm: d }).operation.distance, String(d)).toBe("0.00");
    }
  });

  it("le type d'assurance est toujours « D »", () => {
    expect(ficheDepuisDemande(demande({ raw_payload: { assurance: "contractuelle" } }), o).operation.type_assurance).toBe("D");
  });

  it("le détail de l'opération reprend ce que le client a dit, et le lien du CRM", () => {
    const f = ficheDepuisDemande(
      demande({
        services: { emballage: true, demontage: false, monte_meuble: true },
        formule: "luxe",
        volume_m3: 1234.5,
        volume_method: "ai",
        flexibilite: "± 1 semaine",
        raw_payload: { assurance: "Ad valorem", valeur_mobilier: "10 000 – 30 000 €", piano: "oui", commentaire: "  Attention au chat  ", charges_lourdes: [{ label: "Coffre-fort", poids: "300 kg" }, { label: "" }] },
      }),
      o,
    );
    expect(f.operation.detail.split("\n")).toEqual([
      "Demande du site Bailly (particulier, devis complet) : https://crm.bailly.fr/dashboard/8d0c",
      `Volume : ${(1234.5).toLocaleString("fr-FR")} m³ (estimé sur photos)`,
      "Formule : Luxe",
      "Garantie : Ad valorem",
      "Valeur du mobilier déclarée : 10 000 – 30 000 €",
      "Services : emballage, monte-meuble",
      "Piano",
      "Charges lourdes : Coffre-fort 300 kg",
      "Période : ± 1 semaine",
      "Commentaire du client : Attention au chat",
    ]);
  });

  it("la porte d'entrée : express, entreprise (petit transfert / projet), mutation", () => {
    const porte = (raw: Record<string, unknown>) => ficheDepuisDemande(demande({ raw_payload: raw, volume_m3: null, formule: null }), { ...o, lienCrm: null }).operation.detail.split("\n")[0];
    expect(porte({ details: { express: true } })).toBe("Demande du site Bailly (particulier, devis express)");
    expect(porte({ details: { parcours: "entreprise", transfert: "projet" } })).toBe("Demande du site Bailly (entreprise, projet important)");
    expect(porte({ details: { parcours: "entreprise" } })).toBe("Demande du site Bailly (entreprise, petit transfert)");
    expect(porte({ details: { parcours: "mutation" } })).toBe("Demande du site Bailly (mutation professionnelle)");
    expect(porte({ type_client: "entreprise" })).toBe("Demande du site Bailly (entreprise)");
  });

  it("muté : la société est son employeur ; entreprise : « Société »", () => {
    const mute = ficheDepuisDemande(demande({ raw_payload: { societe: "Armée de Terre", details: { parcours: "mutation", fonction: "RH" } } }), o).operation.detail;
    expect(mute).toContain("Employeur : Armée de Terre (contact : RH)");
    const ent = ficheDepuisDemande(demande({ raw_payload: { societe: "Carrefour", details: { parcours: "entreprise", postes: 40, surface_locaux: 0 } } }), o).operation.detail;
    expect(ent).toContain("Société : Carrefour");
    expect(ent).toContain("Postes de travail : 40");
    expect(ent).not.toContain("Surface des locaux");
  });

  it("le détail est borné à 2000 caractères", () => {
    const f = ficheDepuisDemande(demande({ raw_payload: { commentaire: "x".repeat(5000) } }), o);
    expect(f.operation.detail.length).toBe(2000);
  });

  it("un raw_payload mal formé (tableaux, nombres, null) ne fait pas lever", () => {
    const f = ficheDepuisDemande(demande({ raw_payload: { details: [1, 2], depart: null, arrivee: "texte", charges_lourdes: "pas un tableau" } as unknown as Record<string, unknown> }), o);
    expect(f.chargement.ville).toBe("Paris");
    expect(f.client.nom).toBe("Claire Dumont");
  });

  it("un même jour de déménagement vaut pour le chargement et la livraison", () => {
    const f = ficheDepuisDemande(demande({ date_souhaitee: null, flexibilite: "octobre 2027" }), o);
    expect(f.chargement.date_ou_periode).toBe("202710");
    expect(f.livraison.date_ou_periode).toBe("202710");
  });
});

describe("creagidem/fiche — manquesFiche", () => {
  it("rien ne manque pour une demande complète", () => {
    expect(manquesFiche(ficheDepuisDemande(demande(), o))).toEqual([]);
  });

  it("nom, ville de chargement, ville de livraison : les trois champs obligatoires", () => {
    const f = ficheDepuisDemande(demande({ client_nom: null, client_email: null, depart_ville: "  ", arrivee_ville: null }), o);
    expect(manquesFiche(f)).toEqual(["nom du client", "ville de chargement", "ville de livraison"]);
  });
});
