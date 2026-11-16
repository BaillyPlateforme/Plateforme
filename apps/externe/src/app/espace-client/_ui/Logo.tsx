import { PastilleEnvironnement } from "@/components/PastilleEnvironnement";
import Image from "next/image";
import Link from "next/link";

/*
 * Le logo de la charte. La micro démo composait « BAILLY DÉMÉNAGEMENT » en
 * texte, en attendant le fichier : c'est désormais le fichier — la version
 * blanche sur photo, la version couleur sur fond clair.
 */
export function Logo({ href = "/espace-client", clair = false, petit = false }: { href?: string; clair?: boolean; petit?: boolean }) {
  // Le nom du lien vient du logo lui-même, pas d'un aria-label : celui-ci masquait le texte visible du
  // lien (la pastille « DEV » ou « LOCAL ») au lieu de le contenir (WCAG 2.5.3).
  return (
    <Link href={href} className={`logo${clair ? " dark" : ""}${petit ? " sm" : ""}`}>
      <Image src={clair ? "/marque/bailly-logo.svg" : "/marque/bailly-logo-blanc.svg"} alt="Bailly Déménagement — accueil de l'espace client" width={169} height={54} style={{ width: "auto" }} priority />
      <PastilleEnvironnement />
    </Link>
  );
}
