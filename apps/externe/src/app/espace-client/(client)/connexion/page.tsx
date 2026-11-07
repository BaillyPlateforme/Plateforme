import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DUREE_LIEN_MIN, estDemo } from "@/lib/espace-client/config";
import { PROFILS_DEMO } from "@/lib/espace-client/seed";
import { clientConnecte } from "@/lib/espace-client/session";
import { entrerDemo, voirEmailDemo } from "@/lib/actions/espace-client";
import { Icone } from "../../_ui/Icone";
import { Logo } from "../../_ui/Logo";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata: Metadata = { title: "Connexion" };

const ERREURS: Record<string, string> = {
  expire: `Ce lien a expiré. Pour votre sécurité, il n'est valable que ${DUREE_LIEN_MIN} minutes : demandez-en un nouveau.`,
  utilise: "Ce lien a déjà servi. Chaque lien ne fonctionne qu'une fois : demandez-en un nouveau.",
  inconnu: "Ce lien n'est pas valide. Demandez-en un nouveau ci-dessous.",
};

type Params = Record<string, string | string[] | undefined>;
const lu = (sp: Params, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);

/**
 * La connexion sans mot de passe : on saisit son adresse, on reçoit un lien.
 * La page répond la même chose que l'adresse soit connue ou non.
 */
export default async function Connexion({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  if (!lu(sp, "envoye") && (await clientConnecte())) redirect("/espace-client");
  const envoye = lu(sp, "envoye");
  const email = lu(sp, "email") ?? "";
  const apercu = lu(sp, "apercu");
  const erreur = lu(sp, "erreur");
  const demo = estDemo();

  return (
    <div className="connexion">
      <div className="connexion-photo">
        <div className="hero-media">
          <Image src="/espace-client/paris-interieur.jpg" alt="" fill priority sizes="(max-width: 1080px) 100vw, 55vw" />
        </div>
        <Logo />
        <div>
          <h1 className="display rise">
            Mon espace
            <br />
            client
          </h1>
          <p className="rise" style={{ "--i": 1 } as React.CSSProperties}>
            Votre devis, vos documents et chaque étape de votre déménagement, au même endroit.
          </p>
        </div>
      </div>

      <div className="connexion-form">
        <div>
          {envoye ? (
            <>
              <span className="envoye-ico">
                <Icone nom="mail" />
              </span>
              <p className="kicker">Vérifiez votre boîte mail</p>
              <h2>C&apos;est envoyé.</h2>
              <p className="lede">
                Si <b style={{ color: "var(--ink)" }}>{email}</b> correspond à un dossier Bailly, vous allez recevoir un e-mail avec un lien « Accéder à mon espace client ».
              </p>
              <ul className="info-list mt-l">
                <li>
                  <span className="ic"><Icone nom="clock" /></span>
                  <span><b>Valable {DUREE_LIEN_MIN} minutes</b>Passé ce délai, demandez-en un nouveau.</span>
                </li>
                <li>
                  <span className="ic"><Icone nom="lock" /></span>
                  <span><b>Une seule utilisation</b>Le lien vous connecte directement : pas de mot de passe.</span>
                </li>
                <li>
                  <span className="ic"><Icone nom="mail" /></span>
                  <span><b>Rien reçu ?</b>Pensez à regarder dans les courriers indésirables.</span>
                </li>
              </ul>
              {demo && apercu && (
                <Link className="btn btn-dark btn-block mt-l" href={`/espace-client/apercu-email/${apercu}`}>
                  <Icone nom="eye" /> Ouvrir l&apos;e-mail reçu (démonstration)
                </Link>
              )}
              <Link className="link-arrow mt-m" href="/espace-client/connexion">
                Utiliser une autre adresse <Icone nom="arrow" />
              </Link>
            </>
          ) : (
            <>
              <p className="kicker">Connexion</p>
              <h2>Bonjour !</h2>
              <p className="lede">Saisissez l&apos;adresse e-mail que vous avez donnée à votre conseiller Bailly : nous vous envoyons un lien de connexion.</p>
              {lu(sp, "au-revoir") && <p className="flash ok">Vous êtes déconnecté. À bientôt !</p>}
              {lu(sp, "reinitialise") && <p className="flash info">La démonstration est revenue à son état de départ.</p>}
              {erreur && ERREURS[erreur] && (
                <p className="flash ko" role="alert">
                  {ERREURS[erreur]}
                </p>
              )}
              <FormulaireConnexion />

              {demo && (
                <div className="card mt-l" style={{ padding: 22 }}>
                  <p className="kicker" style={{ marginBottom: 6 }}>Démonstration</p>
                  <p className="note">Données fictives. Chaque profil illustre une règle du brief ; « E-mail » montre le message reçu, « Entrer » ouvre directement l&apos;espace.</p>
                  <div className="stack mt-m" style={{ gap: 8 }}>
                    {PROFILS_DEMO.map((p) => (
                      <div key={p.lettre} className="demo-opt" style={{ cursor: "default" }}>
                        <span className="l">{p.lettre}</span>
                        <span>
                          <strong>{p.titre}</strong>
                          <small>{p.detail}</small>
                        </span>
                        <span style={{ display: "flex", gap: 6 }}>
                          <form action={voirEmailDemo}>
                            <input type="hidden" name="email" value={p.email} />
                            <input type="hidden" name="reference" value={p.reference} />
                            <button className="btn btn-ghost btn-sm" style={{ minHeight: 34, padding: "0 12px" }} aria-label={`Voir l'e-mail d'accès du profil ${p.lettre}`}>
                              E-mail
                            </button>
                          </form>
                          <form action={entrerDemo}>
                            <input type="hidden" name="email" value={p.email} />
                            <input type="hidden" name="reference" value={p.reference} />
                            <button className="btn btn-dark btn-sm" style={{ minHeight: 34, padding: "0 12px" }} aria-label={`Entrer comme le profil ${p.lettre}`}>
                              Entrer
                            </button>
                          </form>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
