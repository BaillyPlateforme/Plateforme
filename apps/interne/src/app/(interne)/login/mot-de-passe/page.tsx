import type { Metadata } from "next";
import { DUREE_LIEN_MIN } from "@/lib/equipe/regles-mot-de-passe";
import { reglageEnvois } from "@/lib/envois";
import { getUserAffichage } from "@/lib/supabase/auth";
import Cadre, { trait } from "../Cadre";
import DemandeLien from "./DemandeLien";
import s from "../connexion.module.css";

export const metadata: Metadata = { title: "Mot de passe" };

/*
 * « Mot de passe oublié ? » et « Changer mon mot de passe » : la même page.
 * On y demande un lien à usage unique, qui part à l'adresse de la fiche de
 * l'équipe (lib/equipe/lien-mot-de-passe.ts). Ouverte sans session.
 */
export default async function MotDePasse() {
  // Connecté (« Changer mon mot de passe », depuis le menu du compte) : l'adresse est déjà remplie.
  const u = await getUserAffichage().catch(() => null);
  const envoisCoupes = reglageEnvois().mode === "desactive";
  return (
    <Cadre>
      <h2>{u ? "Changer mon mot de passe" : "Mot de passe oublié"}</h2>
      <p className={s.chapo}>
        Saisissez votre adresse e-mail Bailly : vous recevez un lien pour choisir votre mot de passe. Il est valable {DUREE_LIEN_MIN === 60 ? "une heure" : `${DUREE_LIEN_MIN} minutes`} et ne sert qu&apos;une fois.
      </p>
      {envoisCoupes && (
        <p className={s.note}>
          Version de test : aucun e-mail ne part d&apos;ici. Demandez votre lien à un administrateur, qui le fabrique depuis l&apos;écran L&apos;équipe.
        </p>
      )}
      <DemandeLien email={u?.email ?? ""} />
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
