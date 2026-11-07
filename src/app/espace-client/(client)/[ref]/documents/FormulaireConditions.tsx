"use client";

import { useEffect, useState } from "react";
import { enregistrerConditions } from "@/lib/actions/espace-client";
import { ESCALIER, MONTE_MEUBLE, PARTICULARITES_RUE, POIDS_LOURD, STATIONNEMENT, libelleEtage } from "@/lib/espace-client/libelles";
import { conditionsLivraisonSchema, erreursDe, lireConditions, TYPES_PHOTOS, verifierPhotos } from "@/lib/espace-client/schemas";
import { TEXTE_CERTIFICATION_LIVRAISON, VERSIONS } from "@/lib/espace-client/textes";
import { Champ, Choix, ResumeErreurs, useFormulaire } from "../../../_ui/formulaire";
import { Icone } from "../../../_ui/Icone";

const options = (o: Record<string, string>) => Object.entries(o) as [string, string][];

/**
 * Le questionnaire des conditions de livraison, tel que la micro démo le
 * présente : étage, ascenseur, escalier, portage, accès poids lourd,
 * stationnement, rue, monte-meuble, photos, et la certification horodatée.
 */
export function FormulaireConditions({ reference, adresse }: { reference: string; adresse: string }) {
  const { etat, erreurs, enCours, onSubmit, onChange, essai } = useFormulaire(enregistrerConditions.bind(null, reference), (fd) => {
    const r = conditionsLivraisonSchema.safeParse(lireConditions(fd));
    const photos = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    const errPhotos = verifierPhotos(photos, { max: 6 });
    return { ...(r.success ? {} : erreursDe(r.error)), ...(errPhotos ? { photos: errPhotos } : {}) };
  });
  const [ascenseur, setAscenseur] = useState<string | null>(null);
  const [vignettes, setVignettes] = useState<{ url: string; nom: string }[]>([]);

  // Les aperçus des photos occupent de la mémoire : on les libère en partant.
  useEffect(() => () => vignettes.forEach((v) => URL.revokeObjectURL(v.url)), [vignettes]);

  const e = (k: string) => erreurs[k] || undefined;

  return (
    <form className="card apparait" noValidate onSubmit={onSubmit} onChange={onChange}>
      <ResumeErreurs erreurs={erreurs} message={etat.message} essai={essai} />
      <div className="form-grid">
        <Champ id="c-adr" label="Adresse de livraison" erreur={e("adresse_livraison")} className="full">
          <input id="c-adr" name="adresse_livraison" className="input" defaultValue={adresse} autoComplete="street-address" />
        </Champ>
        <Champ id="c-etage" label="Étage" erreur={e("etage")}>
          <select id="c-etage" name="etage" className="select" defaultValue="">
            <option value="">Choisir…</option>
            {Array.from({ length: 10 }, (_, n) => (
              <option key={n} value={n}>
                {libelleEtage(n)}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Ascenseur" erreur={e("ascenseur")}>
          <Choix name="ascenseur" options={[["oui", "Oui"], ["non", "Non"]]} onChange={setAscenseur} />
        </Champ>
        {ascenseur === "oui" && (
          <Champ label="Dimensions intérieures de la cabine" aide="(en cm)" className="full">
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {(
                [
                  ["asc_largeur", "Largeur"],
                  ["asc_profondeur", "Profondeur"],
                  ["asc_hauteur", "Hauteur"],
                ] as const
              ).map(([k, l]) => (
                <Champ key={k} erreur={e(k)}>
                  <input className="input" name={k} inputMode="numeric" placeholder={l} aria-label={`${l} de la cabine, en centimètres`} />
                </Champ>
              ))}
            </div>
          </Champ>
        )}
        <Champ label="Escalier" erreur={e("escalier")} className="full">
          <Choix name="escalier" options={options(ESCALIER)} />
        </Champ>
        <Champ id="c-port" label="Distance de portage" aide="(camion → porte, en mètres)" erreur={e("distance_portage_m")}>
          <input id="c-port" name="distance_portage_m" className="input" inputMode="numeric" placeholder="Ex. : 15" />
        </Champ>
        <Champ label="Accès poids lourd (19 t)" erreur={e("acces_poids_lourd")}>
          <Choix name="acces_poids_lourd" options={options(POIDS_LOURD)} />
        </Champ>
        <Champ label="Stationnement" erreur={e("stationnement")} className="full">
          <Choix name="stationnement" options={options(STATIONNEMENT)} />
        </Champ>
        <Champ label="Particularités de la rue" aide="(plusieurs choix possibles)" erreur={e("particularites_rue")} className="full">
          <Choix name="particularites_rue" multiple options={PARTICULARITES_RUE.map((p) => [p, p] as [string, string])} />
        </Champ>
        <Champ label="Monte-meuble nécessaire" erreur={e("monte_meuble")}>
          <Choix name="monte_meuble" options={options(MONTE_MEUBLE)} />
        </Champ>
        <Champ id="c-hor" label="Horaires restreints" aide="(facultatif)" erreur={e("horaires_restreints")}>
          <input id="c-hor" name="horaires_restreints" className="input" placeholder="Ex. : livraisons interdites après 11 h" />
        </Champ>
        <Champ label="Photos de l'accès" aide="(façade, entrée, escalier, ascenseur — 6 au plus)" erreur={e("photos")} className="full">
          <label className="dropzone">
            <Icone nom="upload" />
            <span>
              <b>Ajouter des photos</b>
              <small>JPEG, PNG, HEIC · 10 Mo maximum par photo</small>
            </span>
            <input
              type="file"
              name="photos"
              accept={TYPES_PHOTOS.join(",")}
              multiple
              onChange={(ev) => {
                vignettes.forEach((v) => URL.revokeObjectURL(v.url));
                const fichiers = Array.from(ev.currentTarget.files ?? []);
                setVignettes(fichiers.filter((f) => f.type.startsWith("image/")).map((f) => ({ url: URL.createObjectURL(f), nom: f.name })));
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
        <Champ id="c-com" label="Commentaire" aide="(facultatif)" erreur={e("commentaire")} className="full">
          <textarea id="c-com" name="commentaire" className="textarea" placeholder="Digicode, gardien, objet volumineux à passer par la fenêtre…" />
        </Champ>
        <Champ erreur={e("certification")} className="full">
          <label className="check">
            <input type="checkbox" name="certification" />
            <span>
              {TEXTE_CERTIFICATION_LIVRAISON} <span style={{ color: "var(--muted)" }}>(texte {VERSIONS.conditions_livraison})</span>
            </span>
          </label>
        </Champ>
      </div>
      <div className="row-actions end">
        <button className="btn btn-primary" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Valider mes conditions de livraison"} <Icone nom="arrow" />
        </button>
      </div>
    </form>
  );
}
