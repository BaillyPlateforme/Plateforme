import { PastilleEnvironnement } from "@/components/PastilleEnvironnement";
import Image from "next/image";
import Link from "next/link";

/*
 * Le logo de la charte. La micro démo composait « BAILLY DÉMÉNAGEMENT » en
 * texte, en attendant le fichier : c'est désormais le fichier — la version
 * blanche sur photo, la version couleur sur fond clair.
 */
export function Logo({ href = "/espace-client", clair = false, petit = false }: { href?: string; clair?: boolean; petit?: boolean }) {
  return (
    <Link href={href} className={`logo${clair ? " dark" : ""}${petit ? " sm" : ""}`} aria-label="Bailly Déménagement — accueil de l'espace client">
      <Image src={clair ? "/marque/bailly-logo.svg" : "/marque/bailly-logo-blanc.svg"} alt="Bailly Déménagement" width={169} height={54} style={{ width: "auto" }} priority />
      <PastilleEnvironnement />
    </Link>
  );
}
