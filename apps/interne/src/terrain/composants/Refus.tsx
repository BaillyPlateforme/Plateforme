import { seDeconnecter } from "../actions";
import { Picto } from "./Picto";
import s from "./terrain.module.css";

/** L'écran d'un compte qui n'ouvre plus l'outil : désactivé par le bureau, ou sans fiche de déménageur. */
export default function Refus({ refus }: { refus: "desactive" | "inconnu" }) {
  return (
    <main className={s.contenu} style={{ paddingTop: "calc(env(safe-area-inset-top) + 40px)" }}>
      <div className={s.vide}>
        <span className={s.videPicto}>
          <Picto nom="cle" taille={26} />
        </span>
        <b>{refus === "desactive" ? "Ce compte est désactivé" : "Ce compte n'ouvre pas l'outil terrain"}</b>
        <p>
          {refus === "desactive"
            ? "Le bureau l'a désactivé. Pour le réactiver, adressez-vous au bureau."
            : "Il n'est inscrit ni comme déménageur ni dans l'équipe du bureau."}
        </p>
        <form action={seDeconnecter} style={{ width: "100%" }}>
          <button type="submit" className={s.boutonSortie}>
            <Picto nom="sortie" /> Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
