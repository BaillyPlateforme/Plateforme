import { LECTURE_SEULE } from "@/lib/espace-client/apercu";
import { nomClient } from "@/lib/espace-client/format";
import { apercuEquipe, clientConnecte } from "@/lib/espace-client/session";
import { GardeApercu } from "./GardeApercu";
import { Icone } from "./Icone";

/**
 * Le bandeau de l'aperçu de l'équipe, collé en haut de chaque page de
 * l'espace tant que l'aperçu dure : on voit l'espace du client tel qu'il le
 * voit, et on ne peut rien y faire. « Quitter l'aperçu » passe par la
 * déconnexion, qui n'efface alors que le cookie de l'aperçu.
 *
 * Hors aperçu, il ne rend rien. Textes provisoires, à valider.
 */
export async function BandeauApercu() {
  const apercu = await apercuEquipe();
  const client = apercu && (await clientConnecte());
  if (!apercu || !client) return null;
  const nom = client.societe ? `${client.societe} (${nomClient(client)})` : nomClient(client);
  // « tel qu'elle le voit » pour une cliente : le texte suit la civilité, sinon il parle du client.
  const voit = client.societe || !client.civilite ? "tel que le client le voit" : client.civilite === "Madame" ? "tel qu'elle le voit" : "tel qu'il le voit";
  return (
    <>
      <div className="apercu-equipe" role="region" aria-label="Aperçu de l'équipe" title={`Aperçu ouvert depuis le CRM par ${apercu.par}`}>
        <div className="apercu-equipe-in">
          <span className="apercu-equipe-badge" title="Aperçu de l'équipe">
            <Icone nom="eye" /> <span>Aperçu de l&apos;équipe</span>
          </span>
          <p>
            <span className="apercu-equipe-long">Vous voyez l&apos;espace de </span>
            <b>{nom}</b>
            <span className="apercu-equipe-long"> {voit}</span> · lecture seule
          </p>
          {/* Un lien simple, pas <Link> : un préchargement ne doit jamais quitter l'aperçu. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn btn-primary btn-sm" href="/espace-client/deconnexion">
            Quitter l&apos;aperçu
          </a>
        </div>
      </div>
      <GardeApercu message={LECTURE_SEULE} />
    </>
  );
}
