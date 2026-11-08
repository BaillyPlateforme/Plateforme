"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import s from "./filtres.module.css";

/*
 * Des filtres en listes déroulantes de verre, pour la rangée du bas du
 * bandeau (venus des relances, partagés depuis le 08/11/2026 avec les
 * factures) : chaque choix change l'adresse (le filtre se partage et survit
 * au rechargement), les autres paramètres sont gardés. « Tout effacer » ne
 * garde que ceux de `garder` (le dossier ouvert, la vue…).
 */

export type Filtre = { cle: string; libelle: string; options: { valeur: string; libelle: string }[] };

export default function Filtres({ filtres, garder = ["dossier"] }: { filtres: Filtre[]; garder?: string[] }) {
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
  for (const k of garder) if (sp.get(k)) raz.set(k, sp.get(k)!);
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
