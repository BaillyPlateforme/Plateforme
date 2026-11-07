import { BackOffice } from "./_composants/BackOffice";
import { PORTE_EQUIPE } from "./_composants/portes";

export const metadata = { title: "Espace client — Bailly" };

/** Le module 2 de la plateforme, vu de l'équipe : les espaces des clients. */
export default function Page() {
  return <BackOffice porte={PORTE_EQUIPE} vue="dossiers" />;
}
