"use client";

import { useState } from "react";
import u from "@/crm/exploitation/ui/ui.module.css";
import { STATUTS, TAILLES, verifierNumero } from "./regles";

/*
 * Les champs de la fiche d'un conteneur (création et onglet « Fiche ») :
 * identification (sens, type, capacité, numéro, plomb, statut), transport
 * (voyage, navire, compagnie, transitaire, groupeur, dégroupeur, références)
 * et trajet (départ et arrivée : lieu, date, heure). Les intervenants se
 * choisissent dans l'annuaire, ou se tapent librement.
 *
 * Choisir un type de 20 ou 40 pieds propose sa capacité (celle du dispatch),
 * qu'on peut corriger. Le numéro est vérifié en direct (norme ISO 6346).
 */

export type ValeursConteneur = Partial<{
  numero: string; sens: string; taille: string; capacite: number; plomb: string | null; statut: string; ref_interne: string | null;
  voyage: string | null; navire: string | null; compagnie: string | null; transitaire: string | null; groupeur: string | null; degroupeur: string | null;
  ref_groupeur: string | null; ref_compagnie: string | null; ref_transitaire: string | null;
  lieu_depart: string | null; depart_prevu: string | null; depart_heure: string | null; destination: string; arrivee_prevue: string | null; arrivee_heure: string | null;
}>;

export default function ChampsConteneur({ v = {}, annuaire }: { v?: ValeursConteneur; annuaire: { compagnies: string[]; transitaires: string[]; groupeurs: string[] } }) {
  const [sens, setSens] = useState(v.sens ?? "export");
  const [taille, setTaille] = useState(v.taille ?? "40 pieds");
  const [capacite, setCapacite] = useState(String(v.capacite ?? TAILLES.find((t) => t.libelle === (v.taille ?? "40 pieds"))?.capacite ?? ""));
  const [numero, setNumero] = useState(v.numero ?? "");
  const iso = numero.trim() ? verifierNumero(numero) : null;
  const champ = (nom: keyof ValeursConteneur, libelle: string, largeur: string, opts: { liste?: string; placeholder?: string; type?: string; requis?: boolean } = {}) => (
    <div className={`${u.champ} ${largeur}`}>
      <label htmlFor={`tc-${nom}`}>
        {libelle} {opts.requis && <em>*</em>}
      </label>
      <input
        id={`tc-${nom}`}
        type={opts.type ?? "text"}
        name={nom}
        defaultValue={(v[nom] as string | null | undefined) ?? ""}
        list={opts.liste}
        placeholder={opts.placeholder}
        required={opts.requis}
        autoComplete="off"
      />
    </div>
  );

  return (
    <>
      <datalist id="tc-compagnies">{annuaire.compagnies.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="tc-transitaires">{annuaire.transitaires.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="tc-groupeurs">{annuaire.groupeurs.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="tc-tailles">{TAILLES.map((t) => <option key={t.libelle} value={t.libelle} />)}</datalist>

      <div className={u.bloc}>
        <p className={u.blocTitre}>
          <i>1</i>Identification
        </p>
        <div className={u.champs}>
          <div className={`${u.champ} ${u.w4}`}>
            <span className={u.etiquette}>Sens</span>
            <div className={u.segments} role="radiogroup" aria-label="Sens">
              {[
                ["export", "Export"],
                ["import", "Import"],
              ].map(([k, l]) => (
                <label key={k}>
                  <input type="radio" name="sens" value={k} checked={sens === k} onChange={() => setSens(k)} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor="tc-taille">Type</label>
            <input
              id="tc-taille"
              type="text"
              name="taille"
              list="tc-tailles"
              value={taille}
              onChange={(e) => {
                setTaille(e.target.value);
                const t = TAILLES.find((x) => x.libelle === e.target.value);
                if (t) setCapacite(String(t.capacite));
              }}
            />
          </div>
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor="tc-capacite">
              Capacité utile (m³) <em>*</em>
            </label>
            <input id="tc-capacite" type="number" name="capacite" min={1} step="0.1" value={capacite} onChange={(e) => setCapacite(e.target.value)} required />
          </div>
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor="tc-numero">
              Numéro <em>*</em>
            </label>
            <input id="tc-numero" type="text" name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} required placeholder="MSKU 907032-3" autoComplete="off" />
            {iso && (
              <p className={u.aide} style={{ color: iso.valide ? "#0b7f50" : "#a35b00" }}>
                {iso.valide ? "Chiffre de contrôle juste (ISO 6346)." : `Chiffre de contrôle attendu : ${iso.attendu}. Vérifiez la saisie.`}
              </p>
            )}
          </div>
          {champ("plomb", "Plomb", u.w4, { placeholder: "N° de scellé" })}
          <div className={`${u.champ} ${u.w4}`}>
            <label htmlFor="tc-statut">Statut</label>
            <select id="tc-statut" name="statut" defaultValue={v.statut ?? "preparation"}>
              {Object.entries(STATUTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </div>
          {champ("ref_interne", "Référence interne", u.w4, { placeholder: "Code du groupage" })}
        </div>
      </div>

      <div className={u.bloc}>
        <p className={u.blocTitre}>
          <i>2</i>Transport
        </p>
        <div className={u.champs}>
          {champ("navire", "Navire", u.w4)}
          {champ("voyage", "Voyage", u.w4, { placeholder: "N° de voyage" })}
          {champ("compagnie", "Compagnie", u.w4, { liste: "tc-compagnies", placeholder: "Annuaire ou texte libre" })}
          {champ("transitaire", "Transitaire", u.w4, { liste: "tc-transitaires", placeholder: "Annuaire ou texte libre" })}
          {champ("groupeur", "Groupeur", u.w4, { liste: "tc-groupeurs", placeholder: "Annuaire ou texte libre" })}
          {champ("degroupeur", "Dégroupeur", u.w4, { liste: "tc-groupeurs", placeholder: "Annuaire ou texte libre" })}
          {champ("ref_compagnie", "Réf. compagnie (booking, BL)", u.w4)}
          {champ("ref_transitaire", "Réf. transitaire", u.w4)}
          {champ("ref_groupeur", "Réf. groupeur", u.w4)}
        </div>
      </div>

      <div className={u.bloc}>
        <p className={u.blocTitre}>
          <i>3</i>Départ et arrivée
        </p>
        <div className={u.champs}>
          {champ("lieu_depart", sens === "export" ? "Lieu de départ (port, dépôt)" : "Lieu de départ (port d'origine)", u.w6, { placeholder: sens === "export" ? "Le Havre" : "Papeete" })}
          {champ("depart_prevu", "Date de départ", u.w3, { type: "date" })}
          {champ("depart_heure", "Heure", u.w3, { type: "time" })}
          {champ("destination", "Lieu d'arrivée", u.w6, { requis: true, placeholder: sens === "export" ? "Fort-de-France (Martinique)" : "Le Havre" })}
          {champ("arrivee_prevue", "Date d'arrivée", u.w3, { type: "date" })}
          {champ("arrivee_heure", "Heure", u.w3, { type: "time" })}
        </div>
      </div>
    </>
  );
}
