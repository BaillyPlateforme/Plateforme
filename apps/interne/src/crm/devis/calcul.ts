/*
 * Le calcul du devis, au centime, identique dans l'éditeur (en direct) et
 * au serveur (à l'enregistrement). Module pur.
 *
 * Règles :
 * - une ligne « à la charge du client » n'est pas facturée ;
 * - montant d'une ligne = quantité × prix unitaire, arrondi au centime ;
 * - la remise (%) s'applique taux de TVA par taux, arrondie au centime ;
 * - saisie HT : TVA = base nette × taux, par taux ; saisie TTC (devis
 *   d'avant) : HT = TTC net ÷ (1 + taux), la TVA est la différence ;
 * - l'assurance (prime = valeur × taux) s'ajoute en HT, avec sa TVA ;
 * - TTC = HT + TVA ; arrhes = TTC × pourcentage ; marge sur le HT.
 */
import type { Achat, Assurance, Chiffrage, LigneDevis } from "./modele";

/** Arrondi au centime, sans l'erreur des flottants (1,005 → 1,01). */
export const r2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const nb = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export interface Taux { taux: number; brut: number; remise: number; net: number; ht: number; tva: number; ttc: number }
export interface Calcul {
  /** Montant de chaque ligne (HT ou TTC selon la saisie), avant remise. */
  montants: Record<string, number>;
  brut: number;
  remise: number;
  net: number;
  parTaux: Taux[];
  primeContractuelle: number;
  primeDommage: number;
  assuranceHt: number;
  assuranceTva: number;
  ht: number;
  tva: number;
  ttc: number;
}

export function montantLigne(l: Pick<LigneDevis, "qte" | "pu">) {
  return r2(nb(l.qte) * nb(l.pu));
}

export function primes(a: Assurance) {
  const c = r2((nb(a.contractuelle.valeur) * nb(a.contractuelle.taux)) / 100);
  const d = r2((nb(a.dommage.valeur) * nb(a.dommage.taux)) / 100);
  return { c, d };
}

export function calculer(ch: Chiffrage, tvaAssuranceParDefaut: number): Calcul {
  const remise = Math.min(100, Math.max(0, nb(ch.remisePct))) / 100;
  const montants: Record<string, number> = {};
  const brutParTaux = new Map<number, number>();
  for (const l of ch.lignes) {
    const m = montantLigne(l);
    montants[l.id] = m;
    if (l.charge === "client") continue;
    const t = nb(l.tva);
    brutParTaux.set(t, r2((brutParTaux.get(t) ?? 0) + m));
  }
  const parTaux: Taux[] = [...brutParTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, brut]) => {
      const rem = r2(brut * remise), net = r2(brut - rem);
      if (ch.saisie === "ttc") {
        const ht = r2(net / (1 + taux / 100));
        return { taux, brut, remise: rem, net, ht, tva: r2(net - ht), ttc: net };
      }
      const tva = r2((net * taux) / 100);
      return { taux, brut, remise: rem, net, ht: net, tva, ttc: r2(net + tva) };
    });
  const { c, d } = primes(ch.assurance);
  const assuranceHt = r2(c + d);
  const assuranceTva = r2((assuranceHt * (ch.assurance.tva ?? tvaAssuranceParDefaut)) / 100);
  const somme = (k: keyof Taux) => r2(parTaux.reduce((a, t) => a + t[k], 0));
  const ht = r2(somme("ht") + assuranceHt);
  const tva = r2(somme("tva") + assuranceTva);
  return {
    montants,
    brut: somme("brut"),
    remise: somme("remise"),
    net: somme("net"),
    parTaux,
    primeContractuelle: c,
    primeDommage: d,
    assuranceHt,
    assuranceTva,
    ht,
    tva,
    ttc: r2(ht + tva),
  };
}

export const arrhes = (ttc: number, pct: number) => r2((ttc * pct) / 100);

/** Les achats : prévu, réel (là où il est saisi), et ce qui manque encore. */
export function totauxAchats(achats: Achat[]) {
  const prevu = r2(achats.reduce((a, x) => a + nb(x.prevu), 0));
  const reelSaisi = r2(achats.reduce((a, x) => a + nb(x.reel), 0));
  // Le réel estimé : le coût réel quand il est connu, sinon le prévu.
  const reelEstime = r2(achats.reduce((a, x) => a + (x.reel != null ? x.reel : nb(x.prevu)), 0));
  const manquants = achats.filter((x) => x.reel == null && nb(x.prevu) > 0).length;
  return { prevu, reelSaisi, reelEstime, manquants };
}
export function marge(ventesHt: number, couts: number) {
  const m = r2(ventesHt - couts);
  return { montant: m, pct: ventesHt > 0 ? Math.round((m / ventesHt) * 1000) / 10 : null };
}

/** Prix de vente HT d'un coût, selon la marge voulue : sur le coût (majoration) ou sur le prix de vente (taux de marque). */
export function prixDeVente(cout: number, margePct: number, mode: "cout" | "prix") {
  if (mode === "prix") return margePct >= 100 ? 0 : r2(cout / (1 - margePct / 100));
  return r2(cout * (1 + margePct / 100));
}

/**
 * Les lignes telles que la base les garde : les champs du chiffrage, plus
 * `prix`, le TTC net de la ligne (remise déduite), que lisent la fiche, le
 * Kanban et la projection vers l'espace client. La somme des `prix` des
 * lignes facturées vaut exactement le TTC du devis : l'écart d'arrondi va à
 * la plus grosse ligne. L'assurance y figure en lignes automatiques.
 */
export function lignesPourBase(ch: Chiffrage, c: Calcul, tvaAssurance: number) {
  const remise = Math.min(100, Math.max(0, nb(ch.remisePct))) / 100;
  const lignes: Record<string, unknown>[] = ch.lignes.map((l) => {
    const m = c.montants[l.id] ?? 0;
    const net = m * (1 - remise);
    const prix = l.charge === "client" ? 0 : ch.saisie === "ttc" ? r2(net) : r2(net * (1 + nb(l.tva) / 100));
    return { id: l.id, groupe: l.groupe, libelle: l.libelle, detail: l.detail || undefined, qte: l.qte, unite: l.unite || undefined, pu: l.pu, tva: l.tva, charge: l.charge, prix };
  });
  const taux = tvaAssurance / 100;
  if (c.primeContractuelle > 0) lignes.push({ id: "assurance-c", auto: "assurance", libelle: "Assurance contractuelle", charge: "bailly", prix: r2(c.primeContractuelle * (1 + taux)) });
  if (c.primeDommage > 0) lignes.push({ id: "assurance-d", auto: "assurance", libelle: "Assurance dommage", charge: "bailly", prix: r2(c.primeDommage * (1 + taux)) });
  const facturees = lignes.filter((l) => l.charge !== "client" && (l.prix as number) !== 0);
  const ecart = r2(c.ttc - facturees.reduce((a, l) => a + (l.prix as number), 0));
  if (ecart !== 0 && facturees.length) {
    const grosse = facturees.reduce((a, l) => ((l.prix as number) > (a.prix as number) ? l : a));
    grosse.prix = r2((grosse.prix as number) + ecart);
  }
  return lignes;
}
