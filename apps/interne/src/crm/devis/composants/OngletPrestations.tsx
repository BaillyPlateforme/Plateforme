"use client";
import { FORMULES, PRESTATIONS_TYPE, nouvelId, prestationsType, type ChargePrestation, type Contrat, type PrestationDevis } from "../modele";
import { Interrupteur, PICTOS, Pic, Section } from "./champs";
import s from "../editeur.module.css";

/*
 * L'onglet Prestations : qui fait quoi, ligne par ligne — Entreprise (Bailly),
 * Client ou Sans objet —, libellés modifiables, lignes libres, et la
 * « catégorie spécifique » : un libellé de catégorie propre à ce devis,
 * imprimé à la place de la formule.
 */

const CHOIX: [ChargePrestation, string][] = [["bailly", "Entreprise"], ["client", "Client"], ["so", "Sans objet"]];

export default function OngletPrestations({
  prestations, onChange, contrat, onContrat,
}: {
  prestations: PrestationDevis[];
  onChange: (p: PrestationDevis[]) => void;
  contrat: Contrat;
  onContrat: (c: Partial<Contrat>) => void;
}) {
  const maj = (id: string, p: Partial<PrestationDevis>) => onChange(prestations.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const compte = (c: ChargePrestation) => prestations.filter((p) => p.charge === c && p.libelle.trim()).length;
  const listeType = PRESTATIONS_TYPE.every((l) => prestations.some((p) => p.libelle === l));
  // Appliquer une catégorie : la répartition s'applique aux lignes type ; les lignes libres gardent leur choix.
  const appliquer = (cle: Contrat["formule"]) => {
    const type = prestationsType(cle);
    onChange(prestations.map((p) => {
      const t = type.find((x) => x.libelle === p.libelle && p.libelle);
      return t ? { ...p, charge: t.charge } : p;
    }));
  };
  return (
    <Section
      surtitre="Prestations"
      titre="Qui fait quoi"
      texte={
        <>
          <b className={s.compteE}>{compte("bailly")} par l&apos;entreprise</b> · <b className={s.compteC}>{compte("client")} par le client</b> · {compte("so")} sans objet. Les lignes « sans objet » ne sont pas imprimées.
        </>
      }
      actions={
        <button type="button" className={s.boutonDoux} onClick={() => onChange([...prestations, { id: nouvelId("pl"), libelle: "", charge: "bailly" }])}>
          <Pic d={PICTOS.plus} /> Ligne libre
        </button>
      }
    >
      <div className={s.barrePrestations}>
        <div className={s.categorieSpecifique}>
          <Interrupteur actif={contrat.categorieSpecifique} onChange={(v) => onContrat({ categorieSpecifique: v })} label="Utiliser une catégorie spécifique" aide="Son libellé remplace la formule sur le devis imprimé" />
          {contrat.categorieSpecifique && (
            <input type="text" value={contrat.categorieLibelle} placeholder="Ex. : Catégorie 2 – Standard" aria-label="Libellé de la catégorie spécifique" onChange={(e) => onContrat({ categorieLibelle: e.target.value })} />
          )}
        </div>
        <div className={s.appliquer}>
          <span>Répartition type :</span>
          {FORMULES.filter((f) => f.cle !== "libre").map((f) => (
            <button key={f.cle} type="button" onClick={() => appliquer(f.cle)} aria-pressed={contrat.formule === f.cle}>{f.nom}</button>
          ))}
          {!listeType && (
            <button type="button" className={s.lienBouton} onClick={() => onChange([...prestationsType(contrat.formule), ...prestations.filter((p) => p.libelle.trim() && !PRESTATIONS_TYPE.includes(p.libelle)).map((p) => ({ ...p, id: nouvelId("pl") }))])}>
              Reprendre la liste type (19 lignes)
            </button>
          )}
        </div>
      </div>
      <ol className={s.prestations}>
        {prestations.map((p, i) => (
          <li key={p.id} data-charge={p.charge}>
            <span className={s.numero}>{i + 1}</span>
            <input type="text" value={p.libelle} placeholder="Ligne libre" aria-label={`Prestation ${i + 1}`} onChange={(e) => maj(p.id, { libelle: e.target.value })} />
            <div className={s.choixPrestation} role="radiogroup" aria-label={`Qui réalise : ${p.libelle || `ligne ${i + 1}`}`}>
              {CHOIX.map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={p.charge === v} data-v={v} onClick={() => maj(p.id, { charge: v })}>{l}</button>
              ))}
            </div>
            <button type="button" className={s.supprimerRang} aria-label={`Retirer la ligne ${i + 1}`} onClick={() => onChange(prestations.filter((x) => x.id !== p.id))}>
              <Pic d={PICTOS.corbeille} taille={15} />
            </button>
          </li>
        ))}
      </ol>
    </Section>
  );
}
