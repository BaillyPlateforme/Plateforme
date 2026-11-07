"use client";

import { useState } from "react";
import { soumettreDeclaration } from "@/lib/actions/espace-client";
import { euros } from "@/lib/espace-client/format";
import { CATEGORIES_OBJETS, declarationValeursSchema, erreursDe, lireDeclaration, SEUIL_OBJET_DETAILLE } from "@/lib/espace-client/schemas";
import { TEXTE_CERTIFICATION_VALEURS } from "@/lib/espace-client/textes";
import { Champ, ResumeErreurs, useFormulaire } from "../../../_ui/formulaire";
import { Icone } from "../../../_ui/Icone";

type Ligne = { cle: number; categorie: string; designation: string; quantite: string; valeur_unitaire: string };
const nombre = (v: string) => Number(String(v).replace(/\s/g, "").replace(",", "."));

/**
 * La déclaration de valeurs de la micro démo : une ligne par bien, le total
 * qui se calcule seul, les erreurs sous chaque case. Les lignes partent en
 * JSON, et le serveur les revalide avec le même schéma.
 */
export function FormulaireDeclaration({ reference, nom, lieu }: { reference: string; nom: string; lieu: string }) {
  const { etat, erreurs, enCours, onSubmit, onChange, effacer, essai } = useFormulaire(soumettreDeclaration.bind(null, reference), (fd) => {
    const r = declarationValeursSchema.safeParse(lireDeclaration(fd));
    return r.success ? {} : erreursDe(r.error);
  });
  const [compteur, setCompteur] = useState(3);
  const [lignes, setLignes] = useState<Ligne[]>([
    { cle: 0, categorie: "Mobilier", designation: "", quantite: "1", valeur_unitaire: "" },
    { cle: 1, categorie: "Électroménager", designation: "", quantite: "1", valeur_unitaire: "" },
    { cle: 2, categorie: "", designation: "", quantite: "1", valeur_unitaire: "" },
  ]);
  const total = lignes.reduce((n, l) => n + (Number(l.quantite) || 0) * (nombre(l.valeur_unitaire) || 0), 0);
  const nbObjets = lignes.reduce((n, l) => n + (Number(l.quantite) && nombre(l.valeur_unitaire) ? Number(l.quantite) : 0), 0);
  const maj = (i: number, k: keyof Ligne, v: string) => {
    setLignes(lignes.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
    effacer(`objets.${i}.${k}`);
  };
  const json = JSON.stringify(lignes.map(({ categorie, designation, quantite, valeur_unitaire }) => ({ categorie, designation, quantite, valeur_unitaire: String(valeur_unitaire).replace(/\s/g, "").replace(",", ".") })));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const e = (k: string) => erreurs[k] || undefined;

  return (
    <form className="card apparait" noValidate onSubmit={onSubmit} onChange={onChange}>
      <input type="hidden" name="objets" value={json} />
      <ResumeErreurs erreurs={erreurs} message={etat.message} essai={essai} />
      <div className="form-grid" style={{ marginBottom: 26 }}>
        <Champ id="v-nom" label="Nom du déclarant" erreur={e("declarant_nom")}>
          <input id="v-nom" name="declarant_nom" className="input" defaultValue={nom} />
        </Champ>
        <Champ id="v-qualite" label="En qualité de" erreur={e("declarant_qualite")}>
          <input id="v-qualite" name="declarant_qualite" className="input" defaultValue="Propriétaire des biens" />
        </Champ>
        <Champ id="v-lieu" label="Fait à" erreur={e("lieu")}>
          <input id="v-lieu" name="lieu" className="input" defaultValue={lieu} />
        </Champ>
        <Champ id="v-date" label="Le" erreur={e("date")}>
          <input id="v-date" name="date" type="date" className="input" defaultValue={aujourdhui} />
        </Champ>
      </div>

      {e("objets") && <p className="err-inline">{e("objets")}</p>}
      <div className="vrows">
        {lignes.map((l, i) => {
          const k = (c: string) => e(`objets.${i}.${c}`);
          return (
            <div className="vrow" key={l.cle}>
              <Champ id={`cat-${l.cle}`} label="Catégorie" erreur={k("categorie")}>
                <select id={`cat-${l.cle}`} className="select" value={l.categorie} onChange={(ev) => maj(i, "categorie", ev.target.value)}>
                  <option value="">Choisir…</option>
                  {CATEGORIES_OBJETS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Champ>
              <Champ id={`des-${l.cle}`} label="Désignation" erreur={k("designation")} className="desc">
                <input id={`des-${l.cle}`} className="input" value={l.designation} onChange={(ev) => maj(i, "designation", ev.target.value)} placeholder="Ex. : canapé 3 places" />
              </Champ>
              <Champ id={`qte-${l.cle}`} label="Qté" erreur={k("quantite")}>
                <input id={`qte-${l.cle}`} className="input" inputMode="numeric" value={l.quantite} onChange={(ev) => maj(i, "quantite", ev.target.value)} placeholder="1" />
              </Champ>
              <Champ id={`val-${l.cle}`} label="Valeur (€)" erreur={k("valeur_unitaire")}>
                <input id={`val-${l.cle}`} className="input" inputMode="decimal" value={l.valeur_unitaire} onChange={(ev) => maj(i, "valeur_unitaire", ev.target.value)} placeholder="0" />
              </Champ>
              <button type="button" className="rm" aria-label={`Supprimer la ligne ${i + 1}`} onClick={() => lignes.length > 1 && setLignes(lignes.filter((_, j) => j !== i))}>
                <Icone nom="trash" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 14 }}
        onClick={() => {
          setLignes([...lignes, { cle: compteur, categorie: "", designation: "", quantite: "1", valeur_unitaire: "" }]);
          setCompteur(compteur + 1);
        }}
      >
        <Icone nom="plus" /> Ajouter un objet
      </button>
      <p className="note mt-s">Valeur de remplacement, pas le prix d&apos;achat. Au-delà de {euros(SEUIL_OBJET_DETAILLE)}, un objet se déclare seul.</p>
      <div className="vtotal">
        <div>
          <small>Valeur totale déclarée</small>
          <div className="num">{euros(total)}</div>
        </div>
        <small>
          {nbObjets} objet{nbObjets > 1 ? "s" : ""} déclaré{nbObjets > 1 ? "s" : ""}
        </small>
      </div>
      <Champ erreur={e("certification")} className="mt-m">
        <label className="check">
          <input type="checkbox" name="certification" />
          <span>{TEXTE_CERTIFICATION_VALEURS}</span>
        </label>
      </Champ>
      <div className="row-actions">
        <span className="note">Contrôlée ici, puis à nouveau à la réception, avec les mêmes règles.</span>
        <button className="btn btn-primary" disabled={enCours}>
          {enCours ? "Envoi…" : "Envoyer ma déclaration"} <Icone nom="arrow" />
        </button>
      </div>
    </form>
  );
}
