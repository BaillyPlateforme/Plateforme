import type { Metadata } from "next";
import { versExterne } from "@/lib/adresses";
import Cadre, { RetourSite } from "./Cadre";
import FormulaireConnexion from "./FormulaireConnexion";
import s from "./connexion.module.css";

export const metadata: Metadata = { title: "Connexion" };

/*
 * La connexion à l'app interne : un seul compte ouvre le CRM, à la racine, et
 * l'espace équipe sous /dashboard. La page est dans le langage du CRM, dont
 * elle partage la mise en page racine.
 */

export default async function Connexion({ searchParams }: { searchParams: Promise<{ redirect?: string; refus?: string; "mot-de-passe"?: string }> }) {
  const sp = await searchParams;
  const { redirect, refus } = sp;
  // Une redirection interne seulement : jamais vers un autre domaine.
  // « /\\evil.com » passait le premier test, et le navigateur lit « \\ » comme « / » : ni barre
  // oblique inverse, ni « // », ni caractère de contrôle.
  const cible = redirect && /^\/(?![\/\\])[^\\\s\x00-\x1f]*$/.test(redirect) ? redirect : "/";

  return (
    <Cadre>
      <h2>Connexion</h2>
      <p className={s.chapo}>Avec votre adresse e-mail et votre mot de passe Bailly.</p>
      {/* Retour de « Choisir mon mot de passe » quand la session n'a pas pu s'ouvrir d'elle-même. */}
      {sp["mot-de-passe"] === "1" && (
        <div role="status" className={s.succes}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="m8 12.5 2.5 2.5L16 9.5" />
          </svg>
          <span>Votre mot de passe est enregistré. Connectez-vous avec lui.</span>
        </div>
      )}
      <FormulaireConnexion cible={cible} refus={refus === "1"} />
      <div className={s.renvois}>
        <span>
          Vous êtes client ou RH d&apos;une entreprise ? Votre espace est ailleurs :{" "}
          <a href={versExterne("/espace-client/connexion")}>espace client</a>,{" "}
          <a href={versExterne("/rh")}>espace RH</a>. Déménageur ? <a href="/terrain/connexion">Connexion terrain</a>.
        </span>
        <RetourSite />
      </div>
    </Cadre>
  );
}
