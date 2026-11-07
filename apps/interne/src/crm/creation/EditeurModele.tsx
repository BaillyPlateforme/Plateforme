"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { enregistrerModele, type Issue } from "./actions";
import { SEGMENTS, TYPES_DEMENAGEMENT, type Champs } from "./commun";
import { Picto } from "./Picto";
import s from "./modeles.module.css";

/*
 * L'éditeur d'un modèle de dossier, dans une fenêtre : le créer de zéro, le
 * modifier, ou l'enregistrer depuis une fiche dossier. Un modèle ne porte
 * jamais l'identité ni les coordonnées d'un client : seulement un segment, un
 * type de déménagement, un volume indicatif, des options et des observations
 * types.
 */

export interface Brouillon {
  id: number | null;
  nom: string;
  description: string | null;
  champs: Champs;
}

export default function EditeurModele({
  ouvert, brouillon, sourceDossier, observationsDossier, onFermer, onEnregistre, confirmer = false,
}: {
  ouvert: boolean;
  brouillon: Brouillon;
  /** Le dossier d'origine, quand on enregistre depuis une fiche. */
  sourceDossier?: { id: number; ref: string } | null;
  /** Ses observations : proposées, jamais recopiées d'office (elles décrivent souvent le client). */
  observationsDossier?: string | null;
  onFermer: () => void;
  onEnregistre?: (r: Extract<Issue, { ok: true }>) => void;
  /** Après l'enregistrement, montrer une confirmation au lieu de fermer. */
  confirmer?: boolean;
}) {
  const fenetre = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState(brouillon.champs.type ?? "");
  const [tdm, setTdm] = useState(brouillon.champs.type_demenagement ?? "");
  const [gm, setGm] = useState(!!brouillon.champs.garde_meuble);
  const [vehicule, setVehicule] = useState(!!brouillon.champs.vehicule);
  const [observations, setObservations] = useState(brouillon.champs.observations ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<Extract<Issue, { ok: true }> | null>(null);

  useEffect(() => {
    const d = fenetre.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);

  const envoyer = async (f: FormData) => {
    const r = await enregistrerModele(brouillon.id, sourceDossier?.id ?? null, f);
    if (!r.ok) return setErreur(r.erreur);
    setErreur(null);
    onEnregistre?.(r);
    if (confirmer) setFait(r);
    else onFermer();
  };

  const puces = (options: [string, string][], valeur: string, choisir: (k: string) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className={s.puces}>
      {[["", "Aucun"] as [string, string], ...options].map(([k, l]) => (
        <button key={k || "aucun"} type="button" role="radio" aria-checked={valeur === k} onClick={() => choisir(k)}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <dialog ref={fenetre} className={s.fenetre} onClose={onFermer} aria-labelledby="titre-modele">
      {fait ? (
        <div className={s.fait}>
          <span className={s.faitIcone}><Picto nom="coche" taille={26} /></span>
          <h2>Modèle « {fait.nom} » enregistré</h2>
          <p>Il apparaît désormais dans « Partir de… », à la création d&apos;un dossier.</p>
          <div className={s.faitActions}>
            <Link href={`/dossiers/nouveau?modele=${fait.id}`} className={s.principal}>Créer un dossier avec ce modèle</Link>
            <Link href="/dossiers/modeles" className={s.secondaire}>Voir les modèles</Link>
            <button type="button" className={s.discret} onClick={onFermer}>Fermer</button>
          </div>
        </div>
      ) : (
        <form action={envoyer} className={s.editeur}>
          <header className={s.editeurTete}>
            <span className={s.editeurIcone}><Picto nom="modele" /></span>
            <div>
              <h2 id="titre-modele">{brouillon.id ? "Modifier le modèle" : sourceDossier ? "Enregistrer comme modèle" : "Nouveau modèle"}</h2>
              <p>
                {sourceDossier ? `À partir du dossier ${sourceDossier.ref}. ` : ""}
                Un modèle ne contient jamais l&apos;identité ni les coordonnées d&apos;un client.
              </p>
            </div>
            <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer"><Picto nom="fermer" /></button>
          </header>

          <div className={s.editeurCorps}>
            <label className={s.champ}>
              <span>Nom du modèle</span>
              <input name="nom" defaultValue={brouillon.nom} required maxLength={80} autoFocus autoComplete="off" />
            </label>
            <label className={s.champ}>
              <span>Description <em>facultatif</em></span>
              <input name="description" defaultValue={brouillon.description ?? ""} maxLength={240} autoComplete="off" placeholder="Quand s'en servir, en une phrase" />
            </label>
            <div className={s.champ}>
              <span>Segment</span>
              {puces(SEGMENTS, type, setType, "Segment")}
            </div>
            <div className={s.champ}>
              <span>Type de déménagement</span>
              {puces(TYPES_DEMENAGEMENT, tdm, setTdm, "Type de déménagement")}
            </div>
            <div className={s.deux}>
              <label className={s.champ}>
                <span>Volume indicatif <em>facultatif</em></span>
                <span className={s.suffixe}>
                  <input name="volume" inputMode="decimal" autoComplete="off" defaultValue={brouillon.champs.volume ? String(brouillon.champs.volume).replace(".", ",") : ""} />
                  <em>m³</em>
                </span>
              </label>
              <div className={s.champ}>
                <span>Options</span>
                <span className={s.bascules}>
                  <button type="button" aria-pressed={gm} onClick={() => setGm(!gm)}>
                    <i aria-hidden>{gm && <Picto nom="coche" />}</i>Garde-meuble
                  </button>
                  <button type="button" aria-pressed={vehicule} onClick={() => setVehicule(!vehicule)}>
                    <i aria-hidden>{vehicule && <Picto nom="coche" />}</i>Véhicule
                  </button>
                </span>
              </div>
            </div>
            <label className={s.champ}>
              <span>
                Observations types <em>facultatif</em>
                {observationsDossier && observations !== observationsDossier && (
                  <button type="button" className={s.copier} onClick={() => setObservations(observationsDossier)}>
                    Reprendre celles du dossier
                  </button>
                )}
              </span>
              <textarea name="observations" rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Ce qui vaut pour tous les dossiers de ce genre" />
              {observationsDossier && observations === observationsDossier && (
                <small className={s.avertir}>Retirez ce qui ne concerne que ce client (codes, étages, noms…).</small>
              )}
            </label>
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="type_demenagement" value={tdm} />
            {gm && <input type="hidden" name="garde_meuble" value="on" />}
            {vehicule && <input type="hidden" name="vehicule" value="on" />}
          </div>

          <footer className={s.editeurPied}>
            {erreur && <b className={s.erreur}>{erreur}</b>}
            <button type="button" className={s.discret} onClick={onFermer}>Annuler</button>
            <Enregistrer />
          </footer>
        </form>
      )}
    </dialog>
  );
}

function Enregistrer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={s.principal} disabled={pending}>
      {pending ? "Enregistrement…" : "Enregistrer le modèle"}
    </button>
  );
}
