"use client";

import { ecrireAuConseiller } from "@/lib/actions/espace-client";
import { erreursDe, messageSchema } from "@/lib/espace-client/schemas";
import { Champ, ResumeErreurs, useFormulaire } from "../../../_ui/formulaire";
import { Icone } from "../../../_ui/Icone";

export function FormulaireMessage({ reference, prenom }: { reference: string; prenom: string }) {
  const { etat, erreurs, enCours, onSubmit, effacer, essai } = useFormulaire(ecrireAuConseiller.bind(null, reference), (fd) => {
    const r = messageSchema.safeParse({ message: fd.get("message") });
    return r.success ? {} : erreursDe(r.error);
  });
  return (
    <form className="card apparait" noValidate onSubmit={onSubmit} onChange={() => effacer("message")} data-reserve-client>
      <ResumeErreurs erreurs={erreurs} message={etat.message} essai={essai} />
      <Champ id="msg" label="Votre message" erreur={erreurs.message || undefined}>
        <textarea id="msg" name="message" className="textarea" rows={6} placeholder="Une question sur votre dossier ?" />
      </Champ>
      <button className="btn btn-primary btn-block mt-m" disabled={enCours}>
        {enCours ? "Envoi…" : `Envoyer à ${prenom}`} <Icone nom="arrow" />
      </button>
    </form>
  );
}
