import { BackOffice } from "../../_composants/BackOffice";
import { PORTE_EQUIPE } from "../../_composants/portes";

export const metadata = { title: "Dossier — Espace client — Bailly" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BackOffice porte={PORTE_EQUIPE} vue="dossier" id={id} />;
}
