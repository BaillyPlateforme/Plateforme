import { BackOffice } from "../_composants/BackOffice";
import { PORTE_EQUIPE } from "../_composants/portes";

export const metadata = { title: "Pièces par destination — Espace client — Bailly" };

export default function Page() {
  return <BackOffice porte={PORTE_EQUIPE} vue="destinations" />;
}
