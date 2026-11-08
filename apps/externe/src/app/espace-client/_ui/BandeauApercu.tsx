import { LECTURE_SEULE, RESERVE_AU_CLIENT } from "@/lib/espace-client/apercu";
import { nomClient } from "@/lib/espace-client/format";
import { apercuEquipe, clientConnecte } from "@/lib/espace-client/session";
import { GardeApercu } from "./GardeApercu";
import { Icone } from "./Icone";

/**
 * Le bandeau de l'aperçu de l'équipe, collé en haut de chaque page de
 * l'espace tant que l'aperçu dure :
 *   - en lecture (jaune) : on voit l'espace du client tel qu'il le voit, et
 *     on ne peut rien y faire ;
 *   - en édition (ambre, super admin) : on modifie l'espace au nom du
 *     client ; seuls les gestes qui n'appartiennent qu'à lui restent fermés.
 * « Quitter » passe par la déconnexion, qui n'efface alors que le cookie de
 * l'aperçu. Le mode affiché est le mode effectif : une édition dont l'auteur
 * a perdu le droit s'affiche en lecture (session.ts).
 *
 * Hors aperçu, il ne rend rien. Textes provisoires, à valider.
 */
export async function BandeauApercu() {
  const apercu = await apercuEquipe();
  const client = apercu && (await clientConnecte());
  if (!apercu || !client) return null;
  const nom = client.societe ? `${client.societe} (${nomClient(client)})` : nomClient(client);
  const edition = apercu.mode === "edition";
  // « tel qu'elle le voit » pour une cliente : le texte suit la civilité, sinon il parle du client.
  const voit = client.societe || !client.civilite ? "tel que le client le voit" : client.civilite === "Madame" ? "tel qu'elle le voit" : "tel qu'il le voit";
  const titre = edition ? "Édition par l'équipe" : "Aperçu de l'équipe";
  return (
    <>
      <div
        className={`apercu-equipe${edition ? " edition" : ""}`}
        role="region"
        aria-label={titre}
        data-mode={apercu.mode}
        title={`${edition ? "Édition" : "Aperçu"} ouvert depuis le CRM par ${apercu.par}`}
      >
        <div className="apercu-equipe-in">
          <span className="apercu-equipe-badge" title={titre}>
            <Icone nom={edition ? "crayon" : "eye"} /> <span>{titre}</span>
          </span>
          {edition ? (
            <p>
              <span className="apercu-equipe-long">Vous modifiez l&apos;espace de </span>
              <b>{nom}</b>
              <span className="apercu-equipe-long"> en son nom</span> · chaque geste est noté à votre nom
            </p>
          ) : (
            <p>
              <span className="apercu-equipe-long">Vous voyez l&apos;espace de </span>
              <b>{nom}</b>
              <span className="apercu-equipe-long"> {voit}</span> · lecture seule
            </p>
          )}
          {/* Un lien simple, pas <Link> : un préchargement ne doit jamais quitter l'aperçu. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn btn-primary btn-sm" href="/espace-client/deconnexion">
            {edition ? "Quitter l'édition" : "Quitter l'aperçu"}
          </a>
        </div>
      </div>
      <GardeApercu mode={apercu.mode} message={edition ? RESERVE_AU_CLIENT : LECTURE_SEULE} />
    </>
  );
}
