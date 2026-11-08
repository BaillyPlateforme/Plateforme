/*
 * Les paramètres du devis, à fournir par Bailly (écran /devis/parametres).
 * Tant qu'un paramètre est vide, le devis reprend la valeur déjà présente
 * dans le code (TVA 20 %, arrhes 30 %, validité 60 jours) ou n'imprime rien
 * (CGV, taux d'assurance). Module pur : la lecture en base est dans donnees.ts.
 */
import { ARRHES_CODE, TVA_CODE, VALIDITE_CODE } from "./modele";

export interface ParametresDevis {
  cgv: string;
  arrhesPct: number | null;
  validiteJours: number | null;
  tvaDefaut: number | null;
  tvaAssurance: number | null;
  tauxContractuelle: number | null;
  tauxDommage: number | null;
  reglementsSolde: string[];
  origines: string[];
  comptes: string[];
  modesReglement: string[];
}
export const PARAMETRES_VIDES: ParametresDevis = {
  cgv: "", arrhesPct: null, validiteJours: null, tvaDefaut: null, tvaAssurance: null, tauxContractuelle: null, tauxDommage: null,
  reglementsSolde: [], origines: [], comptes: [], modesReglement: [],
};
export const CLES_PARAMETRES = Object.keys(PARAMETRES_VIDES) as (keyof ParametresDevis)[];

/** Les valeurs effectives : le paramètre s'il est renseigné, sinon celle du code. */
export const effectifs = (p: ParametresDevis) => ({
  arrhesPct: p.arrhesPct ?? ARRHES_CODE,
  validiteJours: p.validiteJours ?? VALIDITE_CODE,
  tva: p.tvaDefaut ?? TVA_CODE,
  tvaAssurance: p.tvaAssurance ?? p.tvaDefaut ?? TVA_CODE,
});

/**
 * Suggestions vues dans Créagidem chez Bailly (vidéo du 23/09/2026), jamais
 * imposées : « Solde à la livraison » (conditions de règlement du solde),
 * « Chèque » et « Encaissements virements » (fenêtre « Valider un devis »).
 */
export const VUS_DANS_CREAGIDEM = { reglementsSolde: ["Solde à la livraison"], modesReglement: ["Chèque"], comptes: ["Encaissements virements"] };
