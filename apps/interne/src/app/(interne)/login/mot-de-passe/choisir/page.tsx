import type { Metadata } from "next";
import { LIEN_INVALIDE } from "@/lib/equipe/lien-mot-de-passe";
import { jetonValide, LONGUEUR_MIN } from "@/lib/equipe/regles-mot-de-passe";
import Cadre, { trait } from "../../Cadre";
import ChoixMotDePasse from "./ChoixMotDePasse";
import s from "../../connexion.module.css";

// Le jeton est dans l'adresse : il ne doit partir vers aucun autre site par l'en-tête Referer.
export const metadata: Metadata = { title: "Choisir mon mot de passe", referrer: "no-referrer" };

/*
 * L'arrivée du lien reçu par e-mail. Ouvrir la page ne consomme pas le lien :
 * seul l'envoi du formulaire le vérifie (lib/equipe/lien-mot-de-passe.ts),
 * pour qu'une messagerie qui inspecte les liens ne le brûle pas.
 */
export default async function Choisir({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  return (
    <Cadre>
      <h2>Choisir mon mot de passe</h2>
      {jetonValide(jeton) ? (
        <>
          <p className={s.chapo}>
            Au moins {LONGUEUR_MIN} caractères. Il remplace l&apos;ancien, et les sessions déjà ouvertes avec votre compte se ferment.
          </p>
          <ChoixMotDePasse jeton={jeton} />
        </>
      ) : (
        <>
          <div role="alert" className={s.alerte}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5M12 16.2v.3" />
            </svg>
            <span>{LIEN_INVALIDE}</span>
          </div>
          <a className={s.envoyer} href="/login/mot-de-passe">
            Recevoir un nouveau lien
          </a>
        </>
      )}
      <div className={s.renvois}>
        <a href="/login">
          <svg width="14" height="14" viewBox="0 0 24 24" {...trait} aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Retour à la connexion
        </a>
      </div>
    </Cadre>
  );
}
