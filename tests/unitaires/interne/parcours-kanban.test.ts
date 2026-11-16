import { describe, expect, it } from "vitest";
import { etapesDeLaDemande, etapesDu, GROUPES, groupesDu, jourFr, resume, type Faits } from "@/crm/parcours/etapes";
import { prochaineEtape } from "@/crm/parcours/prochaine";
import { adresse, avecDemandes, estEtape, estVueAnalyse, FILTRES_VIDES, garderDemande, garderDossier, lireFiltres, normaliser, statutsDe } from "@/crm/parcours/filtres";
import { demandeClose, libelleDemande, sousStatut } from "@/crm/parcours/demandes-commun";
import { COLONNES, verdict as verdictDossier, ville, type EtatDossier, type DevisCarte } from "@/crm/kanban/regles";
import { aDecider, etapeDossier, ETAPES_DEMANDE, ETAPES_DOSSIER, ETATS_RELANCE, GROUPES_PARCOURS, TEINTES } from "@/crm/kanban/etapes";
import { estOuverte, etapeDe, verdict as verdictDemande, type DemandeVue } from "@/crm/demandes/etapes";
import type { Carte } from "@/crm/kanban/donnees";

const espaces = (s: string) => s.replace(/[  ]/g, " ");

const faits = (o: Partial<Faits> = {}): Faits => ({
  statut: "prospect", segment: "particulier", aujourdhui: "2026-11-15",
  demande: { le: "2026-11-01", site: true, source: "form" }, qualifieLe: null, commercial: null,
  visite: { faite: null, prevue: null, mode: null, par: null },
  devis: { premierEnvoi: null, brouillons: 0, envoyes: 0, signe: null },
  paiements: { n: 0, premier: null, total: 0 }, commandeLe: null, planifieLe: null, chargement: null, livraison: null,
  lettres: { n: 0, livrees: 0, creeesLe: null },
  factures: { n: 0, payees: 0, premiere: null, derniereReglee: null, total: 0, impaye: 0 },
  sav: { ouverts: 0, clos: 0, le: null }, avisLe: null, ...o,
});
const etats = (f: Faits) => etapesDu(f).map((e) => e.etat);
const SIGNE = { le: "2026-10-05", numero: "DV-2026-0007", formule: "standard", montant: 2400 };

describe("parcours/etapes · etapesDu", () => {
  it("treize étapes en huit groupes, dans l'ordre", () => {
    const e = etapesDu(faits());
    expect(e).toHaveLength(13);
    expect(GROUPES).toEqual(GROUPES_PARCOURS.map((g) => g.label));
    expect(e.map((x) => x.groupe)).toEqual([0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7]);
  });
  it("un dossier neuf : la demande faite, la qualification en cours, le reste à venir", () => {
    expect(etats(faits())).toEqual(["fait", "encours", ...Array(11).fill("avenir")]);
    expect(resume(etapesDu(faits()))).toEqual({ etape: "Qualification", faites: 1 });
  });
  it("un dossier planifié : sous le palier, une visite sans trace est « sans objet », la lettre de voiture est en cours", () => {
    const f = faits({
      statut: "planifie", devis: { premierEnvoi: "2026-10-01", brouillons: 0, envoyes: 2, signe: SIGNE },
      paiements: { n: 1, premier: "2026-10-06", total: 720 }, chargement: "2026-12-01", planifieLe: "2026-10-10",
    });
    const e = etapesDu(f);
    expect(e.map((x) => x.etat)).toEqual(["fait", "fait", "sansobjet", "fait", "fait", "fait", "fait", "fait", "encours", "avenir", "avenir", "avenir", "avenir"]);
    expect(e[2].detail).toBe("Pas de visite enregistrée");
    expect(e[3].detail).toBe("3 formules envoyées"); // 2 envoyées + la signée
    expect(espaces(e[4].detail)).toBe("DV-2026-0007 · Standard · 2 400 €");
    expect(espaces(e[5].detail)).toBe("Reçu : 720 €");
    expect(e[7].detail).toBe("Chargement le 1 déc.");
    expect(resume(e)).toEqual({ etape: "Lettre de voiture", faites: 8 });
    expect(groupesDu(e).map((g) => g.etat)).toEqual(["fait", "fait", "fait", "fait", "encours", "avenir", "avenir", "avenir"]);
  });
  it("une étape sous le palier sans trace est « manquante », avec le texte qui le dit", () => {
    const e = etapesDu(faits({ statut: "commande", devis: { premierEnvoi: "2026-10-01", brouillons: 0, envoyes: 1, signe: SIGNE } }));
    expect(e[5]).toMatchObject({ cle: "arrhes", etat: "manque", detail: "Aucun paiement enregistré" });
  });
  it("arrhes attendues : 30 % du devis signé, arrondi à l'euro, tant que rien n'est reçu (étape en cours)", () => {
    const e = etapesDu(faits({ statut: "devis", devis: { premierEnvoi: "2026-10-01", brouillons: 0, envoyes: 0, signe: { ...SIGNE, montant: 1999 } } }));
    expect(e[5].etat).toBe("encours");
    expect(espaces(e[5].detail)).toBe("Attendues : 600 € (30 %)"); // 1 999 × 0,3 = 599,7 → 600
  });
  it("dossier militaire en commande sans devis : devis, signature et arrhes « sans objet »", () => {
    const e = etapesDu(faits({ statut: "commande", segment: "militaire" }));
    expect(e.slice(3, 6).map((x) => [x.etat, x.detail])).toEqual([
      ["sansobjet", "Dossier militaire : pas de devis"], ["sansobjet", "Commande sans devis"], ["sansobjet", "Sans devis, pas d'arrhes"],
    ]);
    expect(e[7].etat).toBe("encours");
  });
  it("dossier perdu : ni étape en cours, ni étape manquante", () => {
    const e = etats(faits({ statut: "perdu", qualifieLe: "2026-11-02" }));
    expect(e).not.toContain("encours");
    expect(e).not.toContain("manque");
    expect(e.slice(0, 2)).toEqual(["fait", "fait"]);
  });
  it("client « compte » terminé : facture et paiement sans objet, SAV en cours", () => {
    const e = etapesDu(faits({ statut: "termine", segment: "compte", chargement: "2026-10-01", devis: { premierEnvoi: "2026-09-01", brouillons: 0, envoyes: 0, signe: SIGNE }, paiements: { n: 1, premier: "2026-09-02", total: 1 }, lettres: { n: 1, livrees: 1, creeesLe: "2026-09-20" } }));
    expect(e.slice(9).map((x) => x.etat)).toEqual(["fait", "sansobjet", "sansobjet", "encours"]);
    expect(espaces(e[10].detail)).toBe("Client « compte » : pas de facture au CRM");
  });
  it("le déménagement : effectué si la date est passée, « Aujourd'hui » le jour J, « Prévu » avant", () => {
    const base = { statut: "planifie", devis: { premierEnvoi: "2026-10-01", brouillons: 0, envoyes: 0, signe: SIGNE } };
    expect(etapesDu(faits({ ...base, chargement: "2026-11-14" }))[9]).toMatchObject({ etat: "fait", detail: "Effectué" });
    expect(etapesDu(faits({ ...base, chargement: "2026-11-15" }))[9].detail).toBe("Aujourd'hui");
    expect(etapesDu(faits({ ...base, chargement: "2026-11-16" }))[9].detail).toBe("Prévu");
    // La livraison l'emporte sur le chargement pour dater le déménagement.
    expect(etapesDu(faits({ ...base, chargement: "2026-11-10", livraison: "2026-11-20" }))[9].detail).toBe("Prévu");
  });
  it("toutes les lettres livrées : le déménagement est fait, quelle que soit la date", () => {
    expect(etapesDu(faits({ statut: "planifie", chargement: "2026-12-01", lettres: { n: 2, livrees: 2, creeesLe: "2026-11-01" } }))[9].etat).toBe("fait");
  });
  it("propriété : au plus une étape en cours, jamais avant une étape manquante", () => {
    for (const statut of ["prospect", "visite", "devis", "commande", "planifie", "termine", "perdu", "inconnu"]) {
      for (const segment of ["particulier", "militaire", "compte"]) {
        const e = etats(faits({ statut, segment }));
        expect(e.filter((x) => x === "encours").length).toBeLessThanOrEqual(1);
        const i = e.indexOf("encours");
        if (i >= 0) expect(e.slice(i + 1).some((x) => x === "manque" || x === "sansobjet")).toBe(false);
      }
    }
  });
  it("jourFr : lu en UTC, sans glisser d'un jour, vide sans date", () => {
    expect(jourFr("2027-01-01")).toBe("1 janv. 2027");
    expect(jourFr("2026-03-29T00:00:00.000Z")).toBe("29 mars 2026");
    expect(jourFr(null)).toBe("");
  });
});

describe("parcours/etapes · etapesDeLaDemande", () => {
  it("une demande : reçue, qualification en cours (son détail dit où elle en est), le reste à venir", () => {
    const e = etapesDeLaDemande({ le: "2026-11-10T08:00:00Z", source: "email", statut: "analyzing", qualifieLe: null });
    expect(e.map((x) => x.etat)).toEqual(["fait", "encours", ...Array(11).fill("avenir")]);
    expect(e[0].detail).toBe("Reçue par e-mail");
    expect(e[1].detail).toBe("En analyse");
  });
  it("devis envoyé ou gagnée (anciens gestes) se lisent « Qualifiée » ; perdue ou archivée : plus rien en cours", () => {
    expect(etapesDeLaDemande({ le: "2026-11-10", source: "form", statut: "quoted", qualifieLe: "2026-11-11" })[1]).toMatchObject({ detail: "Qualifiée", date: "2026-11-11" });
    const perdue = etapesDeLaDemande({ le: "2026-11-10", source: "form", statut: "lost", qualifieLe: "2026-11-11" });
    expect(perdue[1]).toMatchObject({ etat: "avenir", date: null, detail: "Perdue" });
  });
  it("sous-statuts : seules les sous-étapes de « Demande » ; inconnu = nouvelle", () => {
    expect(sousStatut("won")).toBe("qualified");
    expect(sousStatut("archived")).toBe("archived");
    expect(sousStatut("zzz")).toBe("new");
    expect(libelleDemande("new")).toBe("Nouvelle");
    expect(demandeClose("lost") && demandeClose("archived")).toBe(true);
    expect(demandeClose("qualified")).toBe(false);
  });
});

describe("parcours/prochaine · prochaineEtape", () => {
  const ctx = { id: 7, reste: 0, espaceId: null as string | null };
  const titre = (f: Faits, c = ctx) => prochaineEtape(f, c).titre;

  it("perdu : rien à faire, il se rouvre", () => {
    expect(prochaineEtape(faits({ statut: "perdu" }), ctx)).toMatchObject({ titre: "Dossier perdu", ton: "perdu", actions: [] });
  });
  it("avant la commande : planifier la visite, la faire, établir le devis, l'envoyer, obtenir la signature", () => {
    const p = prochaineEtape(faits(), ctx);
    expect(p).toMatchObject({ titre: "Planifier la visite technique", ton: "faire" });
    expect(p.actions[0]).toEqual({ label: "Planifier la visite", href: "/planning/nouveau?dossier=7", principal: true });

    const prevue = prochaineEtape(faits({ visite: { faite: null, prevue: "2026-11-20T09:00:00Z", mode: "visio", par: "Paul" } }), ctx);
    expect(prevue).toMatchObject({ titre: "Faire la visite technique", ton: "attendre" });
    expect(prevue.detail).toBe("Prévue en visio le vendredi 20 novembre à 10:00 avec Paul. Confirmez-la au client, puis faites-la sur la tablette.");
    expect(prevue.actions.at(-1)?.href).toBe("/planning?semaine=2026-11-16");

    expect(titre(faits({ visite: { faite: "2026-11-12", prevue: null, mode: null, par: null } }))).toBe("Établir le devis");
    expect(prochaineEtape(faits({ devis: { premierEnvoi: null, brouillons: 2, envoyes: 0, signe: null } }), ctx).detail).toBe("2 devis en brouillon, pas encore envoyés au client.");
    expect(titre(faits({ devis: { premierEnvoi: "2026-11-01", brouillons: 0, envoyes: 1, signe: null } }))).toBe("Obtenir la signature");
  });
  it("une visite prévue alors qu'un devis est en route : le devis reste l'étape, la visite est rappelée", () => {
    const p = prochaineEtape(faits({ visite: { faite: null, prevue: "2026-11-20T09:00:00Z", mode: null, par: null }, devis: { premierEnvoi: "2026-11-01", brouillons: 0, envoyes: 1, signe: null } }), ctx);
    expect(p.titre).toBe("Obtenir la signature");
    expect(p.detail).toMatch(/Visite prévue le vendredi 20 novembre à 10:00\.$/);
  });
  it("militaire sans devis : passer en commande", () => {
    expect(titre(faits({ segment: "militaire", visite: { faite: "2026-11-02", prevue: null, mode: null, par: null } }))).toBe("Passer en commande");
  });
  it("après la signature : arrhes, dates, lettre de voiture, jour J, facture", () => {
    const signe = { statut: "commande", devis: { premierEnvoi: "2026-10-01", brouillons: 0, envoyes: 0, signe: SIGNE } };
    expect(titre(faits(signe))).toBe("Encaisser les arrhes");
    const payes = { ...signe, paiements: { n: 1, premier: "2026-10-06", total: 720 } };
    expect(titre(faits(payes))).toBe("Planifier le déménagement");
    expect(titre(faits({ ...payes, chargement: "2026-12-01" }))).toBe("Préparer la lettre de voiture");
    const pret = { ...payes, statut: "planifie", lettres: { n: 1, livrees: 0, creeesLe: "2026-11-01" } };
    expect(prochaineEtape(faits({ ...pret, chargement: "2026-12-01" }), ctx)).toMatchObject({ titre: "Déménagement le mardi 1 décembre", ton: "attendre" });
    expect(titre(faits({ ...pret, chargement: "2026-11-14" }))).toBe("Terminer et facturer");
  });
  it("terminé : le solde au-delà de 50 centimes, puis le SAV, puis l'avis, puis fini", () => {
    const fini = faits({ statut: "termine" });
    expect(espaces(prochaineEtape(fini, { ...ctx, reste: 120 }).detail)).toBe("Reste à payer : 120 €.");
    expect(titre(fini, { ...ctx, reste: 0.5 })).toBe("Dossier terminé");
    const sav = prochaineEtape(faits({ statut: "termine", sav: { ouverts: 2, clos: 0, le: null } }), { ...ctx, espaceId: "e1" });
    expect(sav).toMatchObject({ titre: "Traiter le SAV", detail: "2 réclamations ouvertes (litige ou SAV)." });
    expect(sav.actions).toHaveLength(2);
    expect(titre(fini, { ...ctx, espaceId: "e1" })).toBe("Demander l'avis du client");
    expect(titre(faits({ statut: "termine", avisLe: "2026-11-01" }), { ...ctx, espaceId: "e1" })).toBe("Dossier terminé");
  });
});

describe("parcours/filtres", () => {
  const carte = (o: Partial<Carte> = {}) => ({ statut: "devis", segment: "particulier", commercialId: 2, client: "Benoît Lefèvre", ref: "BD-2026-0042", depart: "Lyon", arrivee: "Évry", email: "b@x.fr", telephone: "06 12 34 56 78", ...o }) as Carte;

  it("les statuts d'une étape choisie ; toutes sans filtre ou pour une étape inconnue", () => {
    expect(statutsDe(null)).toEqual([...COLONNES]);
    expect(statutsDe("commande")).toEqual(["commande", "planifie"]);
    expect(statutsDe("demandes")).toEqual([]);
    expect(statutsDe("pirate")).toEqual([...COLONNES]);
    expect(avecDemandes(null) && avecDemandes("demandes")).toBe(true);
    expect(avecDemandes("devis")).toBe(false);
  });
  it("la recherche : accents ignorés, téléphone sur ses chiffres (4 au moins)", () => {
    const tous = [...COLONNES];
    expect(garderDossier(carte(), { ...FILTRES_VIDES, q: "benoit" }, tous)).toBe(true);
    expect(garderDossier(carte(), { ...FILTRES_VIDES, q: "EVRY" }, tous)).toBe(true);
    expect(garderDossier(carte(), { ...FILTRES_VIDES, q: "0612 34" }, tous)).toBe(true);
    expect(garderDossier(carte(), { ...FILTRES_VIDES, q: "061" }, tous)).toBe(false);
    expect(garderDossier(carte(), { ...FILTRES_VIDES, q: "   " }, tous)).toBe(true);
    expect(normaliser("Éléonore")).toBe("eleonore");
  });
  it("filtres de type, de commercial et d'étape", () => {
    expect(garderDossier(carte(), { ...FILTRES_VIDES, type: "compte" }, [...COLONNES])).toBe(false);
    expect(garderDossier(carte(), { ...FILTRES_VIDES, commercial: 3 }, [...COLONNES])).toBe(false);
    expect(garderDossier(carte(), FILTRES_VIDES, ["commande"])).toBe(false);
  });
  it("une demande du site : écartée par un filtre de commercial ; un filtre de type ne garde que les particuliers", () => {
    const d = { parcours: "particulier" as const, client: "Anne", societe: null, depart: null, arrivee: null, email: null, telephone: null };
    expect(garderDemande(d, FILTRES_VIDES)).toBe(true);
    expect(garderDemande(d, { ...FILTRES_VIDES, commercial: 2 })).toBe(false);
    expect(garderDemande(d, { ...FILTRES_VIDES, type: "particulier" })).toBe(true);
    expect(garderDemande({ ...d, parcours: "entreprise" }, { ...FILTRES_VIDES, type: "particulier" })).toBe(false);
    expect(garderDemande(d, { ...FILTRES_VIDES, etape: "devis" })).toBe(false);
  });
  it("lireFiltres ne garde que des valeurs connues ; la recherche est coupée à 80 caractères", () => {
    expect(lireFiltres({ q: "x".repeat(500), type: "pirate", commercial: "99", etape: "inconnue" }, ["particulier"], [1, 2])).toEqual({ q: "x".repeat(80), type: null, commercial: null, etape: null });
    expect(lireFiltres({ type: "particulier", commercial: "2", etape: "signe" }, ["particulier"], [1, 2])).toEqual({ q: "", type: "particulier", commercial: 2, etape: "signe" });
    expect(estEtape("perdu")).toBe(true);
    expect(estEtape("")).toBe(false);
    expect(estVueAnalyse("leads")).toBe(true);
    expect(estVueAnalyse("toString")).toBe(false);
  });
  it("l'adresse du Parcours : aller-retour avec lireFiltres", () => {
    expect(adresse("colonnes", FILTRES_VIDES)).toBe("/parcours");
    const f = { q: "Benoît & co", type: "compte", commercial: 2, etape: "commande" };
    const a = adresse("liste", f);
    expect(a).toBe("/parcours?vue=liste&q=Beno%C3%AEt+%26+co&type=compte&commercial=2&etape=commande");
    const sp = Object.fromEntries(new URL(a, "https://x").searchParams);
    expect(lireFiltres(sp, ["compte"], [2])).toEqual(f);
  });
});

describe("kanban/regles · verdict d'un dépôt", () => {
  const devis = (statut: DevisCarte["statut"], id = 1): DevisCarte => ({ id, numero: `DV-${id}`, formule: "standard", montant: 1000, statut, envoyeLe: null });
  const e = (o: Partial<EtatDossier> = {}): EtatDossier => ({ statut: "prospect", segment: "particulier", volume: 30, devis: [], facturesARegler: [], ...o });

  it("rien à faire dans sa propre colonne", () => {
    for (const s of COLONNES) expect(verdictDossier(e({ statut: s }), s)).toBeNull();
  });
  it("un dossier terminé ne bouge plus ; tout dossier ouvert peut être perdu", () => {
    expect(verdictDossier(e({ statut: "termine" }), "perdu")).toMatchObject({ ok: false });
    for (const s of ["prospect", "visite", "devis", "commande", "planifie"] as const) expect(verdictDossier(e({ statut: s }), "perdu")).toEqual({ ok: true, geste: { genre: "perdre" } });
  });
  it("un dossier perdu se rouvre seulement en « Visite à faire »", () => {
    expect(verdictDossier(e({ statut: "perdu" }), "visite")).toEqual({ ok: true, geste: { genre: "rouvrir" } });
    expect(verdictDossier(e({ statut: "perdu" }), "devis")).toMatchObject({ ok: false });
  });
  it("jamais de retour en arrière", () => {
    expect(verdictDossier(e({ statut: "commande" }), "devis")).toMatchObject({ ok: false, raison: expect.stringMatching(/ne revient pas en arrière/) });
    expect(verdictDossier(e({ statut: "devis" }), "visite")).toMatchObject({ ok: false });
    const v = verdictDossier(e({ statut: "visite" }), "prospect");
    expect(v?.ok).toBe(false);
    expect(espaces((v as { raison: string }).raison)).toBe("Le dossier ne revient pas à « Nouveau ».");
  });
  it("vers « Devis envoyé » : envoyer les devis ouverts, sinon établir les 3 formules (volume requis)", () => {
    expect(verdictDossier(e({ devis: [devis("brouillon"), devis("refuse", 2)] }), "devis")).toEqual({ ok: true, geste: { genre: "envoyer", devis: [devis("brouillon")] } });
    expect(verdictDossier(e(), "devis")).toEqual({ ok: true, geste: { genre: "generer" } });
    expect(verdictDossier(e({ volume: 0 }), "devis")).toMatchObject({ ok: false, raison: expect.stringMatching(/Volume nul/) });
    expect(verdictDossier(e({ segment: "militaire" }), "devis")).toMatchObject({ ok: false });
    expect(verdictDossier(e({ devis: [devis("signe")] }), "devis")).toMatchObject({ ok: false });
  });
  it("vers « Signé » : signer un devis ouvert ; un militaire passe sans devis ; sinon refus", () => {
    expect(verdictDossier(e({ statut: "devis", devis: [devis("envoye")] }), "commande")).toMatchObject({ ok: true, geste: { genre: "signer" } });
    expect(verdictDossier(e({ segment: "militaire" }), "commande")).toEqual({ ok: true, geste: { genre: "sansDevis" } });
    expect(verdictDossier(e(), "commande")).toMatchObject({ ok: false });
  });
  it("vers « Planifié » seulement depuis « Signé » ; vers « Terminé » seulement planifié, par la facture", () => {
    expect(verdictDossier(e({ statut: "commande" }), "planifie")).toEqual({ ok: true, geste: { genre: "planifier" } });
    expect(verdictDossier(e({ statut: "devis" }), "planifie")).toMatchObject({ ok: false });
    expect(verdictDossier(e({ statut: "commande" }), "termine")).toMatchObject({ ok: false, raison: expect.stringMatching(/Planifiez d'abord/) });
    const f = [{ id: 1, numero: "FA-1", objet: "Solde", montant: 500, emiseLe: "2026-11-01" }];
    expect(verdictDossier(e({ statut: "planifie", facturesARegler: f }), "termine")).toEqual({ ok: true, geste: { genre: "regler", factures: f } });
    expect(verdictDossier(e({ statut: "planifie", segment: "compte" }), "termine")).toMatchObject({ ok: false, raison: expect.stringMatching(/Client\s«\scompte\s»/) });
  });
  it("propriété : chaque paire (de, vers) donne un verdict défini, avec une raison quand il est refusé", () => {
    for (const de of COLONNES) for (const vers of COLONNES) for (const segment of ["particulier", "militaire", "compte"]) {
      const v = verdictDossier(e({ statut: de, segment }), vers);
      if (de === vers) expect(v).toBeNull();
      else if (!v!.ok) expect(v!.raison.length).toBeGreaterThan(10);
    }
  });
  it("la ville d'une adresse libre : dernière partie, sans code postal", () => {
    expect(ville("12 rue de Rivoli, 75004 Paris")).toBe("Paris");
    expect(ville("Lyon 69001")).toBe("Lyon");
    expect(ville("Montréal (QC) H2X 3K9")).toBe("Montréal (QC)");
    expect(ville("Papeete")).toBe("Papeete");
    expect(ville("")).toBeNull();
    expect(ville(null)).toBeNull();
  });
});

describe("kanban/etapes · définitions communes", () => {
  it("chaque teinte d'étape existe dans la palette", () => {
    for (const e of [...ETAPES_DEMANDE, ...ETAPES_DOSSIER, ...ETATS_RELANCE, ...GROUPES_PARCOURS]) expect(TEINTES[e.teinte]).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("un statut inconnu se lit « Nouveau » ; aDecider : ni dossier, ni perdue, ni archivée", () => {
    expect(etapeDossier("n'importe quoi").cle).toBe("prospect");
    expect(etapeDossier("planifie").label).toBe("Planifié");
    expect(aDecider({ statut: "new", dossier: null })).toBe(true);
    expect(aDecider({ statut: "new", dossier: { id: 1 } })).toBe(false);
    expect(aDecider({ statut: "lost", dossier: null })).toBe(false);
  });
});

describe("demandes/etapes · colonne et dépôt d'une demande", () => {
  const d = (o: Partial<DemandeVue> = {}) => ({ statut: "new", incomplete: false, rappel: null, devisSite: null, dossier: null, ...o }) as DemandeVue;

  it("la première règle qui décrit la demande l'emporte", () => {
    expect(etapeDe(d({ dossier: { id: 1, ref: "BD", statut: "devis" }, statut: "lost", incomplete: true }))).toBe("dossier");
    expect(etapeDe(d({ statut: "archived", incomplete: true }))).toBe("archivee");
    expect(etapeDe(d({ statut: "lost", devisSite: "accepte" }))).toBe("perdue");
    expect(etapeDe(d({ incomplete: true, devisSite: "accepte" }))).toBe("incomplete");
    expect(etapeDe(d({ devisSite: "accepte", rappel: "a_rappeler" }))).toBe("accepte");
    expect(etapeDe(d({ rappel: "en_cours", devisSite: "envoye" }))).toBe("rappel");
    expect(etapeDe(d({ rappel: "clos", devisSite: "envoye" }))).toBe("devis");
    expect(etapeDe(d({ statut: "analyzing" }))).toBe("analyse");
    expect(etapeDe(d({ statut: "new" }))).toBe("nouvelle");
    expect(etapeDe(d({ statut: "won" as never }))).toBe("qualifiee");
  });
  it("un dépôt pose le statut seulement si la carte arrive vraiment dans la colonne", () => {
    expect(verdictDemande(d(), "analyse")).toEqual({ ok: true, statut: "analyzing" });
    expect(verdictDemande(d(), "nouvelle")).toBeNull();
    expect(verdictDemande(d(), "dossier")).toMatchObject({ ok: false, raison: expect.stringMatching(/Accepter/) });
    expect(verdictDemande(d(), "devis")).toMatchObject({ ok: false, raison: expect.stringMatching(/se déduit de la demande/) });
    expect(verdictDemande(d({ incomplete: true }), "qualifiee")).toMatchObject({ ok: false, raison: expect.stringMatching(/Incomplète/) });
    expect(verdictDemande(d({ rappel: "a_rappeler" }), "analyse")).toMatchObject({ ok: false, raison: expect.stringMatching(/rappel/) });
    expect(verdictDemande(d({ devisSite: "envoye" }), "qualifiee")).toMatchObject({ ok: false, raison: expect.stringMatching(/envoyé/) });
    expect(verdictDemande(d({ incomplete: true }), "perdue")).toEqual({ ok: true, statut: "lost" });
    expect(verdictDemande(d({ dossier: { id: 1, ref: "BD", statut: "devis" } }), "perdue")).toMatchObject({ ok: false });
  });
  it("une demande ouverte : ni acceptée, ni perdue, ni archivée", () => {
    expect(estOuverte(d())).toBe(true);
    expect(estOuverte(d({ statut: "archived" }))).toBe(false);
  });
});
