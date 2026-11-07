import { m3, m3Fin, momentVisite, resumeAcces, type ContenuCompteRendu } from "@/lib/visite/regles";
import { Picto } from "@/terrain/composants/Picto";
import { urlPhotoVisite } from "./etat";
import s from "./tablette.module.css";

/*
 * Le compte-rendu, lisible par le client sur la tablette avant qu'il signe :
 * exactement le contenu que l'empreinte scelle et que le PDF met en page.
 * Les vignettes des photos s'y ajoutent, pièce par pièce.
 */
export default function Recapitulatif({ c, photos }: { c: ContenuCompteRendu; photos: Map<string, number[]> }) {
  return (
    <>
      <section className={s.crTete}>
        <div>
          <span className={s.crEtiquette}>Compte-rendu de visite technique</span>
          <h1>{c.dossier.client}</h1>
          <p>
            Dossier {c.dossier.ref} · {c.visite.mode === "visio" ? "en visio" : "sur place"}, {momentVisite(c.visite.le, true)}
            {c.visite.commercial ? ` · ${c.visite.commercial}` : ""}
          </p>
        </div>
        <div className={s.crChiffres}>
          <div>
            <small>Volume</small>
            <b>{m3(c.volume)}</b>
          </div>
          <div>
            <small>Pièces</small>
            <b>{c.pieces.length}</b>
          </div>
          <div>
            <small>Objets</small>
            <b>{c.nb_objets}</b>
          </div>
          <div>
            <small>Photos</small>
            <b>{c.nb_photos}</b>
          </div>
        </div>
      </section>

      {c.trajet.length > 0 && (
        <section className={s.crBloc}>
          <h2>Adresses et accès</h2>
          <ol className={s.crEtapes}>
            {c.trajet.map((e, i) => (
              <li key={i}>
                <span>{i + 1}</span>
                <small>{e.libelle}</small>
                <span>
                  <b>{e.adresse}</b>
                  <em>{resumeAcces(e) || "Accès non précisés"}</em>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className={s.crBloc}>
        <h2>Inventaire pièce par pièce</h2>
        {c.pieces.length === 0 && <p className={s.videLigne}>Aucun objet relevé.</p>}
        {c.pieces.map((p) => (
          <div key={p.cle} className={s.crPiece}>
            <div className={s.crPieceTete}>
              <h3>{p.nom}</h3>
              <b>{m3(p.volume)}</b>
            </div>
            {p.objets.length > 0 && (
              <ul className={s.crObjets}>
                {p.objets.map((o, i) => (
                  <li key={i}>
                    <span>
                      {o.quantite > 1 ? `${o.quantite} × ` : ""}
                      {o.libelle}
                      {o.demontage && <em>DÉMONTAGE</em>}
                      {o.fragile && <em>FRAGILE</em>}
                    </span>
                    <b>{o.quantite > 1 ? `${m3Fin(o.volume_unitaire)} · ` : ""}{m3(o.volume)}</b>
                  </li>
                ))}
              </ul>
            )}
            {p.remarque && <p className={s.crRemarque}>{p.remarque}</p>}
            {(photos.get(p.cle) ?? []).length > 0 && (
              <div className={s.crVignettes}>
                {(photos.get(p.cle) ?? []).map((id) => (
                  // eslint-disable-next-line @next/next/no-img-element -- photo privée, servie par une URL signée d'une minute
                  <img key={id} src={urlPhotoVisite(id)} alt={`Photo : ${p.nom}`} />
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {(c.formule || c.options.length > 0) && (
        <section className={s.crBloc}>
          <h2>Prestations proposées</h2>
          {c.formule && (
            <p className={s.crTexte} style={{ marginBottom: 12 }}>
              Formule envisagée : <b>{c.formule.nom}</b> · {c.formule.sous.toLowerCase()}
            </p>
          )}
          {c.options.length > 0 && (
            <ul className={s.crListe}>
              {c.options.map((o) => (
                <li key={o}>
                  <i>
                    <Picto nom="coche" taille={14} />
                  </i>
                  {o}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {c.remarques && (
        <section className={s.crBloc}>
          <h2>Remarques</h2>
          <p className={s.crTexte}>{c.remarques}</p>
        </section>
      )}
    </>
  );
}
