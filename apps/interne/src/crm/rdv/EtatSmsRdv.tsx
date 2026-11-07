import type { EtatAffiche } from "./sms";

/*
 * L'état du SMS d'un rendez-vous : confirmé, annulé par le client, sans
 * réponse, ou non parti. Dans le dossier, avec la saisie de la réponse ; au
 * planning, en pastille seule (`compact`).
 */
export function EtatSmsRdv({
  etat,
  confirmer,
  annuler,
  compact = false,
}: {
  etat?: EtatAffiche;
  confirmer?: () => Promise<void>;
  annuler?: () => Promise<void>;
  compact?: boolean;
}) {
  if (compact) {
    // Les couleurs du thème (--ok, --warn, --tache, --muted) : elles suivent la palette en vigueur.
    const teinte = { confirme: "var(--ok)", annule: "var(--warn)", sans_reponse: "var(--tache)", non_parti: "var(--muted)" }[etat?.etat ?? "non_parti"];
    // Au planning, un point de couleur sur la ligne de l'heure : toujours visible, même sur un créneau d'une heure.
    return etat ? (
      <i
        role="img"
        aria-label={`SMS : ${etat.libelle}`}
        title={`SMS : ${etat.libelle} · ${etat.detail}`}
        style={{ display: "inline-block", width: 8, height: 8, marginLeft: 5, borderRadius: "50%", verticalAlign: "middle", background: teinte, boxShadow: `0 0 0 2px color-mix(in srgb, ${teinte} 25%, #fff)` }}
      />
    ) : null;
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {etat && (
        <i className={`st ${etat.ton}`} title={etat.detail}>
          {etat.libelle}
        </i>
      )}
      {confirmer && etat?.etat !== "confirme" && (
        <form action={confirmer}>
          <button className="btn ghost sm" title="Le client a confirmé (réponse 1, ou par téléphone)">Confirmé</button>
        </form>
      )}
      {annuler && etat?.etat !== "annule" && (
        <form action={annuler}>
          <button className="btn ghost sm" title="Le client a annulé (réponse 2, ou par téléphone)">Annulé par le client</button>
        </form>
      )}
    </span>
  );
}
