"use client";

import { useEffect, useState } from "react";
import { declarerAvarie } from "@/lib/actions/espace-client";
import { avarieSchema, erreursDe, lireAvarie, TYPES_PHOTOS, verifierPhotos } from "@/lib/espace-client/schemas";
import { PARCOURS_SAV } from "@/lib/espace-client/textes";
import { Champ, ResumeErreurs, useFormulaire } from "../../../_ui/formulaire";
import { Icone } from "../../../_ui/Icone";

/**
 * « Je souhaite déclarer une avarie » : le bouton ouvre le formulaire, qui
 * commence par la seule question qui sépare les deux parcours — des réserves
 * ont-elles été écrites sur la lettre de voiture le jour de la livraison ?
 */
export function FormulaireAvarie({ reference, ouvertParDefaut }: { reference: string; ouvertParDefaut: boolean }) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const [branche, setBranche] = useState<"oui" | "non" | null>(null);
  const [vignettes, setVignettes] = useState<{ url: string; nom: string }[]>([]);
  const { etat, erreurs, enCours, onSubmit, onChange, essai } = useFormulaire(declarerAvarie.bind(null, reference), (fd) => {
    const r = avarieSchema.safeParse(lireAvarie(fd));
    const photos = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    const errPhotos = verifierPhotos(photos, { min: 1, max: 5 });
    return { ...(r.success ? {} : erreursDe(r.error)), ...(errPhotos ? { photos: errPhotos } : {}) };
  });
  useEffect(() => () => vignettes.forEach((v) => URL.revokeObjectURL(v.url)), [vignettes]);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const e = (k: string) => erreurs[k] || undefined;

  if (!ouvert) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOuvert(true)}>
        Je souhaite déclarer une avarie <Icone nom="arrow" />
      </button>
    );
  }

  const parcours = branche === "oui" ? PARCOURS_SAV.avec : branche === "non" ? PARCOURS_SAV.sans : null;

  return (
    <form className="card apparait vu" noValidate onSubmit={onSubmit} onChange={onChange} style={{ color: "var(--ink)", marginTop: 22 }}>
      <ResumeErreurs erreurs={erreurs} message={etat.message} essai={essai} />
      <p style={{ fontWeight: 600 }}>Avez-vous émis des réserves sur la lettre de voiture le jour de la livraison ?</p>
      <Champ erreur={e("reserves_emises")}>
        <div className="branch">
          {(["oui", "non"] as const).map((v) => {
            const p = v === "oui" ? PARCOURS_SAV.avec : PARCOURS_SAV.sans;
            return (
              <label key={v}>
                <input type="radio" name="reserves_emises" value={v} onChange={() => setBranche(v)} />
                <strong>{p.titre}</strong>
                <small>{p.aide}</small>
              </label>
            );
          })}
        </div>
      </Champ>

      {parcours && (
        <>
          <ol className="steps-v" style={{ marginTop: 10 }}>
            {parcours.etapes.map(([t, d]) => (
              <li key={t}>
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ol>
          <p className="note" style={{ marginBottom: 18 }}>
            Procédure provisoire, à confirmer par Bailly (délais et pièces demandées).
          </p>
          <div className="form-grid">
            <Champ id="s-date" label="Date du constat" erreur={e("date_constat")}>
              <input id="s-date" name="date_constat" type="date" max={aujourdhui} className="input" />
            </Champ>
            <Champ id="s-objet" label="Objet endommagé" erreur={e("objets")}>
              <input id="s-objet" name="objets" className="input" placeholder="Ex. : commode en chêne, pied cassé" />
            </Champ>
            <Champ id="s-desc" label="Description du dommage" aide="(20 caractères minimum)" erreur={e("description")} className="full">
              <textarea id="s-desc" name="description" className="textarea" placeholder="Nature du dommage, où, comment vous l'avez constaté." />
            </Champ>
            <Champ label="Photos du dommage" aide="(1 à 5 : vue d'ensemble et gros plan)" erreur={e("photos")} className="full">
              <label className="dropzone">
                <Icone nom="camera" />
                <span>
                  <b>Ajouter des photos</b>
                  <small>JPEG, PNG, HEIC · 10 Mo maximum par photo</small>
                </span>
                <input
                  type="file"
                  name="photos"
                  multiple
                  accept={TYPES_PHOTOS.join(",")}
                  onChange={(ev) => {
                    const fichiers = Array.from(ev.currentTarget.files ?? []);
                    setVignettes(fichiers.map((f) => ({ url: URL.createObjectURL(f), nom: f.name })));
                  }}
                />
              </label>
              {vignettes.length > 0 && (
                <div className="thumbs">
                  {vignettes.map((v) =>
                    /\.(heic|heif)$/i.test(v.nom) ? (
                      <span key={v.url} className="f">
                        {v.nom}
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- aperçu local d'un fichier choisi
                      <img key={v.url} src={v.url} alt={v.nom} />
                    ),
                  )}
                </div>
              )}
            </Champ>
          </div>
          <div className="row-actions end">
            <button className="btn btn-primary" disabled={enCours}>
              {enCours ? "Envoi…" : "Je déclare une avarie"} <Icone nom="arrow" />
            </button>
          </div>
        </>
      )}
    </form>
  );
}
