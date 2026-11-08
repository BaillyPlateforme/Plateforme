/** Montants et taux à la française, au centime : module neutre, lisible du serveur comme du navigateur. */
export const euros = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${String(Math.round(n * 100) / 100).replace(".", ",")} %`);
