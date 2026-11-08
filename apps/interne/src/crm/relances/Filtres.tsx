"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import s from "./relances.module.css";

/*
 * Des filtres en listes déroulantes de verre, pour la rangée du bas du
 * bandeau : chaque choix change l'adresse (le filtre se partage et survit au
 * rechargement), le dossier ouvert (?dossier=) est gardé.
 */

export type Filtre = { cle: string; libelle: string; options: { valeur: string; libelle: string }[] };

export default function Filtres({ filtres }: { filtres: Filtre[] }) {
  const router = useRouter();
  const chemin = usePathname();
  const sp = useSearchParams();
  const changer = (cle: string, valeur: string) => {
    const u = new URLSearchParams(sp.toString());
    if (valeur) u.set(cle, valeur);
    else u.delete(cle);
    const qs = u.toString();
    router.push(`${chemin}${qs ? `?${qs}` : ""}`);
  };
  const actifs = filtres.filter((f) => sp.get(f.cle));
  const raz = new URLSearchParams();
  if (sp.get("dossier")) raz.set("dossier", sp.get("dossier")!);
  return (
    <div className={s.filtres} role="group" aria-label="Filtres">
      {filtres.map((f) => (
        <select key={f.cle} className={s.filtre} data-actif={sp.get(f.cle) ? "" : undefined} value={sp.get(f.cle) ?? ""} aria-label={f.libelle} onChange={(e) => changer(f.cle, e.target.value)}>
          <option value="">{f.libelle}</option>
          {f.options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      ))}
      {actifs.length > 0 && (
        <Link className={s.filtreRaz} href={`${chemin}${raz.toString() ? `?${raz}` : ""}`}>
          Tout effacer
        </Link>
      )}
    </div>
  );
}
