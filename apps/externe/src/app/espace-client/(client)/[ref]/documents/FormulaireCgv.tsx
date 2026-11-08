"use client";

import { accepterConditionsGenerales } from "@/lib/actions/espace-client";
import { acceptationsSchema, erreursDe, lireAcceptations } from "@/lib/espace-client/schemas";
import { CGV, RGPD, VERSIONS } from "@/lib/espace-client/textes";
import { Champ, ResumeErreurs, useFormulaire } from "../../../_ui/formulaire";
import { Icone } from "../../../_ui/Icone";

export function TexteJuridique({ titre, sections }: { titre: string; sections: readonly { titre: string; texte: string }[] }) {
  return (
    <div className="legal-box" tabIndex={0} aria-label={titre}>
      <h4>{titre}</h4>
      {sections.map((s) => (
        <p key={s.titre}>
          <b>{s.titre}.</b> {s.texte}
        </p>
      ))}
      <p>
        <i>Texte provisoire : la version définitive sera fournie par Bailly Déménagement.</i>
      </p>
    </div>
  );
}

/** Deux lectures, deux cases : l'acceptation est horodatée avec la version du texte lu. */
export function FormulaireCgv({ reference }: { reference: string }) {
  const { etat, erreurs, enCours, onSubmit, onChange, essai } = useFormulaire(accepterConditionsGenerales.bind(null, reference), (fd) => {
    const r = acceptationsSchema.safeParse(lireAcceptations(fd));
    return r.success ? {} : erreursDe(r.error);
  });
  return (
    <form className="card apparait" noValidate onSubmit={onSubmit} onChange={onChange} data-reserve-client>
      <ResumeErreurs erreurs={erreurs} message={etat.message} essai={essai} />
      <TexteJuridique titre={`Conditions générales de vente · ${VERSIONS.cgv}`} sections={CGV} />
      <Champ erreur={erreurs.cgv || undefined} className="mt-s" >
        <label className="check" style={{ marginBottom: 22 }}>
          <input type="checkbox" name="cgv" />
          <span>J&apos;ai lu et j&apos;accepte les conditions générales de vente ({VERSIONS.cgv}).</span>
        </label>
      </Champ>
      <TexteJuridique titre={`Politique de confidentialité · ${VERSIONS.rgpd}`} sections={RGPD} />
      <Champ erreur={erreurs.rgpd || undefined} className="mt-s">
        <label className="check">
          <input type="checkbox" name="rgpd" />
          <span>J&apos;accepte le traitement de mes données personnelles pour la gestion de mon déménagement ({VERSIONS.rgpd}).</span>
        </label>
      </Champ>
      <div className="row-actions end">
        <button className="btn btn-primary" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer mes acceptations"} <Icone nom="arrow" />
        </button>
      </div>
    </form>
  );
}
