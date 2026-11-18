"use client";

import { useState } from "react";
import ChampAdresse from "@/ui/ChampAdresse";
import { Valider } from "@/crm/fiche/Fiche";
import {
  DEPARTEMENTS_OM, DESTINATIONS_REPLI, GENRES_VEHICULE, GROUPES_OM, MOTORISATIONS, VEHICULE_VIDE, VEHICULES_MAX,
  departementDepuisCodePostal, saisieVolume, volumeEnSaisie, type AdresseRepli, type RepliSaisi, type VehiculeSaisi,
} from "./commun";
import { BoutonEstimer, NoteEstimation } from "./Estimation";
import f from "@/crm/fiche/fiche.module.css";
import c from "./cimob.module.css";

/*
 * La fenêtre « Repli et véhicules » de la fiche d'un dossier CIMOB/DICOM :
 * ce que la création a saisi (Céline, 17/11/2026), à relire et modifier — le
 * repli (Oui / Non, droits, période, destination, lieu ou adresse de son
 * choix) et le transport des véhicules (Oui / Non, puis chaque véhicule, son
 * volume et l'estimation de l'IA). Envoyée en JSON à majCimob
 * (cimob/actions.ts), qui relit et borne tout.
 */

function Champ({ l = 6, titre, aide, children }: { l?: 2 | 3 | 4 | 6 | 8 | 12; titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className={f.champ} data-l={l}>
      <span>
        {titre}
        {aide && <small> · {aide}</small>}
      </span>
      {children}
    </label>
  );
}

function ListeDepartements({ valeur, onChoisir }: { valeur: string; onChoisir: (code: string) => void }) {
  return (
    <select value={valeur} onChange={(e) => onChoisir(e.target.value)}>
      <option value="">Aucun</option>
      {GROUPES_OM.map((g) => (
        <optgroup key={g.libelle} label={g.libelle}>
          {g.codes.map((code) => (
            <option key={code} value={code}>
              {code} · {DEPARTEMENTS_OM[code]}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function FenetreCimob({
  action, repli: repliInitial, vehicule: vehiculeInitial, vehicules: vehiculesInitiaux,
}: {
  action: (f: FormData) => Promise<void>;
  repli: RepliSaisi;
  vehicule: boolean;
  vehicules: VehiculeSaisi[];
}) {
  const [repli, setRepli] = useState(repliInitial);
  const [avecVehicules, setAvecVehicules] = useState(vehiculeInitial);
  const [vehicules, setVehicules] = useState<VehiculeSaisi[]>(vehiculesInitiaux.length ? vehiculesInitiaux : [VEHICULE_VIDE]);
  const r = repli;
  const a = r.adresse;
  const majRepli = (champs: Partial<RepliSaisi>, adresse?: Partial<AdresseRepli>) => setRepli((x) => ({ ...x, ...champs, adresse: { ...x.adresse, ...adresse } }));
  const majVehicule = (i: number, champs: Partial<VehiculeSaisi>) => {
    const efface = ("genre" in champs || "marque" in champs || "modele" in champs) && !("estimation" in champs);
    setVehicules((l) => l.map((x, j) => (j === i ? { ...x, ...(efface ? { estimation: null } : {}), ...champs } : x)));
  };

  return (
    <form action={action}>
      <input type="hidden" name="repli" value={JSON.stringify(repli)} />
      <input type="hidden" name="vehicule" value={avecVehicules ? "on" : ""} />
      <input type="hidden" name="vehicules" value={JSON.stringify(avecVehicules ? vehicules : [])} />
      <div className={f.grille}>
        <p className={f.intertitre}>Repli</p>
        <p className={f.aide} style={{ gridColumn: "span 12" }}>
          Ramener le mobilier du logement de métropole en garde-meubles ou à une adresse de son choix.
        </p>
        <Champ l={3} titre="Repli">
          <select value={r.repli ? "oui" : "non"} onChange={(e) => majRepli({ repli: e.target.value === "oui" })}>
            <option value="non">Non</option>
            <option value="oui">Oui</option>
          </select>
        </Champ>
        {r.repli && (
          <>
            <Champ l={3} titre="Volume (droits)" aide="m³">
              <input type="text" inputMode="decimal" value={r.volume_droits} onChange={(e) => majRepli({ volume_droits: saisieVolume(e.target.value) })} placeholder="30" />
            </Champ>
            <Champ l={6} titre="Période">
              <input type="text" value={r.periode} onChange={(e) => majRepli({ periode: e.target.value.slice(0, 120) })} placeholder="Juin 2027" />
            </Champ>
            <Champ l={4} titre="Destination">
              <select value={r.destination} onChange={(e) => majRepli({ destination: e.target.value as RepliSaisi["destination"] })}>
                <option value="">À préciser</option>
                {Object.entries(DESTINATIONS_REPLI).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Champ>
            {r.destination === "garde_meuble" && (
              <Champ l={8} titre="Lieu">
                <input type="text" value={r.lieu} onChange={(e) => majRepli({ lieu: e.target.value.slice(0, 200) })} placeholder="Garde-meubles Bailly, ville…" />
              </Champ>
            )}
            {r.destination === "adresse" && (
              <>
                <Champ l={8} titre="Adresse">
                  <ChampAdresse
                    value={a.adresse}
                    onChange={(x) => majRepli({}, { adresse: x, code_postal: "", ville: "", pays: "" })}
                    onChoisir={(sg) => {
                      const om = !a.departement_om ? departementDepuisCodePostal(sg.codePostal) : null;
                      majRepli({}, { code_postal: sg.codePostal, ville: sg.ville, pays: "France", ...(om ? { departement_om: om } : {}) });
                    }}
                    placeholder="Numéro et rue, ou ville"
                  />
                </Champ>
                <Champ l={4} titre="Département d’outre-mer">
                  <ListeDepartements valeur={a.departement_om} onChoisir={(x) => majRepli({}, { departement_om: x })} />
                </Champ>
                <Champ l={4} titre="Étage">
                  <input type="text" value={a.etage} onChange={(e) => majRepli({}, { etage: e.target.value.slice(0, 40) })} placeholder="RDC, 3…" />
                </Champ>
                <Champ l={4} titre="Ascenseur">
                  <select value={a.ascenseur ? "oui" : "non"} onChange={(e) => majRepli({}, { ascenseur: e.target.value === "oui" })}>
                    <option value="non">Non</option>
                    <option value="oui">Oui</option>
                  </select>
                </Champ>
                <Champ l={4} titre="Taille de l’ascenseur" aide="personnes">
                  <input type="text" value={a.ascenseur_taille} disabled={!a.ascenseur} onChange={(e) => majRepli({}, { ascenseur_taille: e.target.value.slice(0, 40) })} />
                </Champ>
              </>
            )}
          </>
        )}

        <p className={f.intertitre}>Transport de véhicules</p>
        <Champ l={3} titre="Transport de véhicules">
          <select value={avecVehicules ? "oui" : "non"} onChange={(e) => setAvecVehicules(e.target.value === "oui")}>
            <option value="non">Non</option>
            <option value="oui">Oui</option>
          </select>
        </Champ>
      </div>
      {avecVehicules && (
        <div style={{ marginTop: 14 }}>
          {vehicules.map((x, i) => (
            <fieldset key={i} className={f.etape}>
              <legend>
                <i>{i + 1}</i>
                Véhicule {i + 1}
                {vehicules.length > 1 && (
                  <button type="button" onClick={() => setVehicules((l) => l.filter((_, j) => j !== i))}>
                    Retirer
                  </button>
                )}
              </legend>
              <div className={f.grille}>
                <Champ l={3} titre="Véhicule">
                  <select value={x.genre} onChange={(e) => majVehicule(i, { genre: e.target.value as VehiculeSaisi["genre"] })}>
                    <option value="">—</option>
                    {Object.entries(GENRES_VEHICULE).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Champ>
                {x.genre === "autre" && (
                  <>
                    <Champ l={6} titre="Lequel">
                      <input type="text" value={x.description} onChange={(e) => majVehicule(i, { description: e.target.value.slice(0, 300) })} placeholder="Remorque, quad, bateau…" />
                    </Champ>
                    <Champ l={3} titre="Volume" aide="m³">
                      <input type="text" inputMode="decimal" value={x.volume} onChange={(e) => majVehicule(i, { volume: saisieVolume(e.target.value) })} />
                    </Champ>
                  </>
                )}
                {(x.genre === "moto" || x.genre === "voiture") && (
                  <>
                    <Champ l={3} titre="Motorisation">
                      <select value={x.motorisation} onChange={(e) => majVehicule(i, { motorisation: e.target.value })}>
                        <option value="">—</option>
                        {Object.entries(MOTORISATIONS).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </Champ>
                    <Champ l={3} titre="Marque">
                      <input type="text" value={x.marque} onChange={(e) => majVehicule(i, { marque: e.target.value.slice(0, 40) })} />
                    </Champ>
                    <Champ l={3} titre="Modèle">
                      <input type="text" value={x.modele} onChange={(e) => majVehicule(i, { modele: e.target.value.slice(0, 60) })} />
                    </Champ>
                    <div className={f.champ} data-l={12}>
                      <span>
                        Volume du véhicule <small> · m³</small>
                      </span>
                      <span className={c.ligneVolume}>
                        <input type="text" inputMode="decimal" value={x.volume} onChange={(e) => majVehicule(i, { volume: saisieVolume(e.target.value) })} aria-label={`Volume du véhicule ${i + 1}`} style={{ maxWidth: 160 }} />
                        <BoutonEstimer vehicule={x} className={c.estimerFiche} onEstime={(e) => majVehicule(i, { volume: volumeEnSaisie(e.volume), estimation: e })} />
                      </span>
                      <NoteEstimation estimation={x.estimation} volume={x.volume} />
                    </div>
                  </>
                )}
              </div>
            </fieldset>
          ))}
          {vehicules.length < VEHICULES_MAX && (
            <button type="button" className={`${f.valider} ${f.valider_doux}`} onClick={() => setVehicules((l) => [...l, VEHICULE_VIDE])}>
              + Ajouter un véhicule
            </button>
          )}
        </div>
      )}
      <div className={f.pied}>
        <p>Les droits du dossier se modifient dans la fenêtre « Fiche ». Seuls les droits sont communiqués au client.</p>
        <Valider>Enregistrer</Valider>
      </div>
    </form>
  );
}
