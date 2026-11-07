import Link from "next/link";
import { Picto } from "@/terrain/composants/Picto";
import s from "@/terrain/composants/terrain.module.css";

/** Un dossier introuvable, dans l'outil terrain : retour aux chantiers. */
export default function Introuvable() {
  return (
    <main className={s.contenu} style={{ paddingTop: "calc(env(safe-area-inset-top) + 40px)" }}>
      <div className={s.vide}>
        <span className={s.videPicto}>
          <Picto nom="info" taille={26} />
        </span>
        <b>Ce dossier est introuvable</b>
        <p>Il a peut-être été retiré du planning.</p>
        <Link href="/terrain" className={s.boutonContour}>
          <Picto nom="retour" taille={20} />
          Retour aux chantiers
        </Link>
      </div>
    </main>
  );
}
