import u from "@/crm/exploitation/ui/ui.module.css";
import { CATEGORIES } from "./categories";
import type { Partenaire } from "./donnees";

/*
 * Les champs d'une fiche de l'annuaire, communs à la création (fenêtre) et à
 * la modification (fiche) : la société, ses coordonnées, ses zones, ses notes.
 * Sans état : le composant se pose côté serveur comme côté navigateur.
 */
export default function ChampsPartenaire({ p, prefixe = "" }: { p?: Partial<Partenaire>; prefixe?: string }) {
  const idc = (k: string) => `${prefixe}${k}`;
  return (
    <>
      <div className={u.bloc}>
        <p className={u.blocTitre}>
          <i>1</i>Société
        </p>
        <div className={u.champs}>
          <div className={`${u.champ} ${u.w8}`}>
            <label htmlFor={idc("nom")}>
              Nom <em>*</em>
            </label>
            <input id={idc("nom")} type="text" name="nom" defaultValue={p?.nom ?? ""} required maxLength={120} placeholder="Rhône Déménagement" />
          </div>
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor={idc("categorie")}>Famille</label>
            <select id={idc("categorie")} name="categorie" defaultValue={p?.categorie ?? "sous_traitant"}>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor={idc("telephone")}>Téléphone</label>
            <input id={idc("telephone")} type="tel" name="telephone" defaultValue={p?.telephone ?? ""} />
          </div>
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor={idc("email")}>E-mail</label>
            <input id={idc("email")} type="email" name="email" defaultValue={p?.email ?? ""} />
          </div>
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor={idc("siret")}>SIRET</label>
            <input id={idc("siret")} type="text" name="siret" defaultValue={p?.siret ?? ""} />
          </div>
          <div className={`${u.champ} ${u.w12}`}>
            <label htmlFor={idc("adresse")}>Adresse</label>
            <input id={idc("adresse")} type="text" name="adresse" defaultValue={p?.adresse ?? ""} />
          </div>
          <div className={`${u.champ} ${u.w3}`}>
            <label htmlFor={idc("code_postal")}>Code postal</label>
            <input id={idc("code_postal")} type="text" name="code_postal" defaultValue={p?.code_postal ?? ""} />
          </div>
          <div className={`${u.champ} ${u.w5}`}>
            <label htmlFor={idc("ville")}>Ville</label>
            <input id={idc("ville")} type="text" name="ville" defaultValue={p?.ville ?? ""} />
          </div>
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor={idc("pays")}>Pays</label>
            <input id={idc("pays")} type="text" name="pays" defaultValue={p?.pays ?? ""} />
          </div>
          <div className={`${u.champ} ${u.w8}`}>
            <label htmlFor={idc("site")}>Site internet</label>
            <input id={idc("site")} type="text" name="site" defaultValue={p?.site ?? ""} placeholder="www…" />
          </div>
        </div>
      </div>
      <div className={u.bloc}>
        <p className={u.blocTitre}>
          <i>2</i>Zones et notes
        </p>
        <div className={u.champs}>
          <div className={`${u.champ} ${u.w12}`}>
            <label htmlFor={idc("zones")}>Zones couvertes</label>
            <input id={idc("zones")} type="text" name="zones" defaultValue={(p?.zones ?? []).join(", ")} placeholder="Séparées par des virgules : Rhône, Lyon, 69…" />
            <p className={u.aide}>Départements, régions, villes ou pays : elles servent au filtre de l&apos;annuaire.</p>
          </div>
          <div className={`${u.champ} ${u.w12}`}>
            <label htmlFor={idc("notes")}>Notes</label>
            <textarea id={idc("notes")} name="notes" defaultValue={p?.notes ?? ""} placeholder="Conditions, habitudes, points d'attention…" />
          </div>
        </div>
      </div>
    </>
  );
}
