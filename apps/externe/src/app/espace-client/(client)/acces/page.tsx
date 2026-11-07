import type { Metadata } from "next";
import Link from "next/link";
import { lireJeton } from "@/lib/espace-client/acces";
import { DUREE_LIEN_MIN } from "@/lib/espace-client/config";
import { entrerAvecJeton } from "@/lib/actions/espace-client";
import { Icone } from "../../_ui/Icone";

export const metadata: Metadata = { title: "Connexion sécurisée", referrer: "no-referrer" };

const REFUS: Record<string, [string, string]> = {
  expire: ["Ce lien a expiré", `Pour votre sécurité, un lien n'est valable que ${DUREE_LIEN_MIN} minutes.`],
  utilise: ["Ce lien a déjà servi", "Chaque lien ne fonctionne qu'une seule fois."],
  inconnu: ["Ce lien n'est pas valide", "Il a peut-être été mal copié depuis l'e-mail."],
};

/**
 * L'arrivée par le lien de l'e-mail : le « portail » de la micro démo.
 *
 * Ouvrir cette page ne consomme pas le lien — les messageries qui inspectent
 * les liens avant le client le brûleraient. C'est le bouton qui ouvre la
 * session, par une action serveur.
 */
export default async function Acces({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const jeton = typeof sp.jeton === "string" ? sp.jeton : "";
  const etat = await lireJeton(jeton);

  if (!etat.ok) {
    const [titre, texte] = REFUS[etat.raison];
    return (
      <div className="gate">
        <div className="inner">
          <div className="ok ko">
            <Icone nom="lock" />
          </div>
          <h1>{titre}</h1>
          <p>{texte} Demandez-en un nouveau : il arrive en quelques secondes.</p>
          <Link className="btn btn-primary" href={`/espace-client/connexion?erreur=${etat.raison}`}>
            Recevoir un nouveau lien <Icone nom="arrow" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="gate">
      <form className="inner" action={entrerAvecJeton}>
        <input type="hidden" name="jeton" value={jeton} />
        <div className="ok">
          <Icone nom="check" />
        </div>
        <h1>Bonjour {etat.client.prenom}</h1>
        <p>Lien valide · votre espace client vous attend.</p>
        <button className="btn btn-primary" autoFocus>
          Accéder à mon espace <Icone nom="arrow" />
        </button>
        <p style={{ fontSize: 13.5, opacity: 0.55 }}>Connexion sécurisée, sans mot de passe. Ce lien ne servira qu&apos;une fois.</p>
      </form>
    </div>
  );
}
