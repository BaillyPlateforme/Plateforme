// Règles de chiffrage de la V1 (modifiables par la direction plus tard).
export interface Ligne { libelle: string; prix: number; charge: "bailly" | "client" }
export interface Formule { cle: "premium" | "standard" | "economique"; titre: string; sous: string; lignes: Ligne[]; montant: number }
const r10 = (n: number) => Math.round(n / 10) * 10;

export function formules(volume: number): Formule[] {
  const v = Math.max(volume, 8);
  const transport = r10(v * 62 + 380), demontage = 180, fragile = r10(v * 9), total = r10(v * 18), deballage = r10(v * 14);
  const mk = (cle: Formule["cle"], titre: string, sous: string, o: { fragile: boolean; total: boolean; deballage: boolean }): Formule => {
    const lignes: Ligne[] = [
      { libelle: "Transport, chargement et livraison", prix: transport, charge: "bailly" },
      { libelle: "Démontage / remontage du mobilier", prix: demontage, charge: "bailly" },
      { libelle: "Emballage des objets fragiles", prix: o.fragile ? fragile : 0, charge: o.fragile ? "bailly" : "client" },
      { libelle: "Emballage total", prix: o.total ? total : 0, charge: o.total ? "bailly" : "client" },
      { libelle: "Déballage et mise en place", prix: o.deballage ? deballage : 0, charge: o.deballage ? "bailly" : "client" },
    ];
    return { cle, titre, sous, lignes, montant: lignes.reduce((a, l) => a + l.prix, 0) };
  };
  return [
    mk("premium", "Premium", "Le client ne fait rien", { fragile: true, total: true, deballage: true }),
    mk("standard", "Standard", "Emballe ce qui casse", { fragile: true, total: false, deballage: false }),
    mk("economique", "Économique", "Le client fait tout", { fragile: false, total: false, deballage: false }),
  ];
}

/** Emballages calculés automatiquement, par paquets de 20 (règle exprimée en réunion). */
export function emballages(volume: number) {
  const paquets = (n: number) => Math.ceil(n / 20) * 20;
  return { cartonsStandard: paquets(volume * 1.4), cartonsLivres: paquets(volume * 0.4), penderies: Math.max(2, Math.ceil(volume / 8)), bulle: Math.max(1, Math.round(volume / 14)) };
}
