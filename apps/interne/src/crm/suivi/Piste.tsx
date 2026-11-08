import { Icone } from "@/ui/icones";
import { etapesPiste, type SuiviEnvoi } from "./etapes";
import s from "./piste.module.css";

/**
 * La piste d'un e-mail : Envoyé (ou Journalisé) → Délivré → Ouvert →
 * Cliqué → Sur le portail. Chaque étape dit son détail au survol (title) et
 * aux lecteurs d'écran. Sans état : elle s'affiche aussi bien dans une page
 * du serveur que dans un écran du navigateur.
 */
export default function Piste({ suivi, compacte = false, sansDepart = false }: { suivi: SuiviEnvoi; compacte?: boolean; sansDepart?: boolean }) {
  const etapes = etapesPiste(suivi).filter((e) => !(sansDepart && e.cle === "depart"));
  if (!etapes.length) return null;
  return (
    <ol className={`${s.piste} ${compacte ? s.compacte : ""}`} aria-label="Suivi de l'e-mail">
      {etapes.map((e, i) => (
        <li key={`${e.cle}-${i}`}>
          <span className={s.etape} data-etat={e.etat} data-cle={e.cle} title={e.titre}>
            <Icone nom={e.icone} taille={compacte ? 12 : 13} />
            {e.libelle}
            <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              {" "}: {e.titre}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Le suivi d'un devis en une ligne : « ouvert 3× · consulté sur le portail le 9 nov. ». */
export function ResumeSuivi({ texte, chaud = false, titre }: { texte: string; chaud?: boolean; titre?: string }) {
  if (!texte) return null;
  return (
    <small className={s.resume} title={titre}>
      {chaud ? <b>{texte}</b> : texte}
    </small>
  );
}
