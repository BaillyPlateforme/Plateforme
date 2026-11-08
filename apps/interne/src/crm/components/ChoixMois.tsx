/*
 * Un mois (« novembre 2026 » → valeur « 2026-11 »), dans une liste.
 *
 * Remplace <input type="month"> : Safari l'affiche comme un champ vide, sans
 * calendrier ni indication (David, 08/11/2026 : « que mettre pour la
 * date ? »). La liste va de trois mois en arrière à deux ans devant ; une
 * valeur déjà enregistrée hors de ces bornes y reste.
 */

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Le mois d'un texte libre (« Souhaitée le 19 novembre 2026 », « Fin janvier 2027 ») : « 2026-11 », ou "". */
export function moisDuTexte(texte: string | null | undefined): string {
  const m = String(texte ?? "").toLowerCase().match(/(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/);
  if (!m) return "";
  const i = MOIS.findIndex((n) => n.normalize("NFD").replace(/\p{M}/gu, "") === m[1].normalize("NFD").replace(/\p{M}/gu, ""));
  return i < 0 ? "" : `${m[2]}-${String(i + 1).padStart(2, "0")}`;
}

export default function ChoixMois({
  name,
  defaultValue = "",
  required = false,
  ariaLabel,
}: {
  name: string;
  /** « AAAA-MM », ou "" (aucun). */
  defaultValue?: string;
  required?: boolean;
  ariaLabel?: string;
}) {
  const d = new Date();
  const options: { valeur: string; libelle: string }[] = [];
  for (let k = -3; k <= 24; k++) {
    const m = new Date(d.getFullYear(), d.getMonth() + k, 1);
    options.push({ valeur: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`, libelle: `${MOIS[m.getMonth()]} ${m.getFullYear()}` });
  }
  if (defaultValue && !options.some((o) => o.valeur === defaultValue)) {
    const [a, mm] = defaultValue.split("-").map(Number);
    if (a && mm) options.unshift({ valeur: defaultValue, libelle: `${MOIS[mm - 1]} ${a}` });
  }
  return (
    <select name={name} defaultValue={defaultValue} required={required} aria-label={ariaLabel}>
      <option value="" disabled={required}>
        Choisir le mois…
      </option>
      {options.map((o) => (
        <option key={o.valeur} value={o.valeur}>
          {o.libelle}
        </option>
      ))}
    </select>
  );
}
