import type { Espace } from "@/lib/espace-client/espace";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";
import { BoutonChat } from "./BoutonChat";
import { Icone } from "./Icone";
import "./contact.css";

/*
 * Joindre son conseiller, de trois manières, montrées à égalité (David,
 * 08/11/2026 : « bien montrer qu'on peut contacter le conseiller de trois
 * manières : chat, téléphone ou mail »). Le chat ouvre la bulle de la page ;
 * le téléphone et l'e-mail sont des liens directs. Textes à valider par
 * Bailly.
 */
export function ContactConseiller({ e }: { e: Espace }) {
  const c = e.conseiller;
  const ref = e.dossier.reference;
  const initiales = `${c.prenom[0] ?? ""}${c.nom[0] ?? ""}`.toUpperCase();
  const tel = c.telephone?.trim();
  const sujet = encodeURIComponent(`Dossier ${ref}`);
  return (
    <section className="contact-conseiller apparait" aria-labelledby="contact-conseiller-titre">
      <header className="cc-tete">
        <span className="cc-av" aria-hidden>
          {initiales}
        </span>
        <div>
          <p className="kicker">Votre conseiller</p>
          <h3 id="contact-conseiller-titre">
            {c.prenom} {c.nom}
          </h3>
          <p className="cc-sous">Il suit votre dossier {ref} du devis au jour J. Joignez-le comme vous préférez :</p>
        </div>
      </header>
      <ul className="cc-voies">
        <li className="cc-voie" data-voie="chat">
          <span className="cc-ic" aria-hidden>
            <Icone nom="bulle" />
          </span>
          <b>Par le chat</b>
          <p>Écrivez-lui ici, à toute heure : sa réponse arrive dans votre espace, et vous êtes prévenu par e-mail.</p>
          <BoutonChat href={`/espace-client/${ref}/conseiller`} className="btn btn-primary btn-sm cc-cta">
            Ouvrir le chat
          </BoutonChat>
        </li>
        <li className="cc-voie" data-voie="tel">
          <span className="cc-ic" aria-hidden>
            <Icone nom="phone" />
          </span>
          <b>Par téléphone</b>
          <p>
            {tel ? (
              <>
                Sa ligne directe : <a href={`tel:${tel.replace(/\s/g, "")}`}>{tel}</a>
              </>
            ) : (
              "Sa ligne directe n'est pas encore renseignée."
            )}
            <br />
            <small>
              Standard de l&apos;agence : <a href={TEL_AGENCE_LIEN}>{TEL_AGENCE}</a>
            </small>
          </p>
          <a className="btn btn-dark btn-sm cc-cta" href={tel ? `tel:${tel.replace(/\s/g, "")}` : TEL_AGENCE_LIEN}>
            Appeler {tel ? c.prenom : "l'agence"}
          </a>
        </li>
        <li className="cc-voie" data-voie="mail">
          <span className="cc-ic" aria-hidden>
            <Icone nom="mail" />
          </span>
          <b>Par e-mail</b>
          <p>{c.email ? <a href={`mailto:${c.email}?subject=${sujet}`}>{c.email}</a> : "Son adresse e-mail n'est pas encore renseignée : utilisez le chat."}</p>
          {c.email && (
            <a className="btn btn-ghost btn-sm cc-cta" href={`mailto:${c.email}?subject=${sujet}`}>
              Envoyer un e-mail
            </a>
          )}
        </li>
      </ul>
    </section>
  );
}
