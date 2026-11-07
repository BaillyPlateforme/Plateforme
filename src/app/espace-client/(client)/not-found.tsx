import Link from "next/link";
import { Logo } from "../_ui/Logo";

/** Un dossier qui n'existe pas — ou qui n'est pas à vous : la même réponse, sans rien révéler. */
export default function Introuvable() {
  return (
    <div className="ecran-nuit">
      <div className="sel-top">
        <Logo />
      </div>
      <div className="page-simple">
        <div>
          <p className="kicker" style={{ color: "var(--accent)" }}>
            Introuvable
          </p>
          <h1>Cette page n&apos;existe pas</h1>
          <p style={{ color: "rgba(255,255,255,.7)" }}>Le dossier demandé n&apos;existe pas, ou n&apos;est pas rattaché à votre compte.</p>
          <Link className="btn btn-primary" href="/espace-client">
            Revenir à mon espace
          </Link>
        </div>
      </div>
    </div>
  );
}
