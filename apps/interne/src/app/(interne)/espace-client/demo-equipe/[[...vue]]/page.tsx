import { notFound } from "next/navigation";
import { BackOffice, type Vue } from "@/app/(interne)/(coque)/dashboard/espace-client/_composants/BackOffice";
import { PORTE_DEMO } from "@/app/(interne)/(coque)/dashboard/espace-client/_composants/portes";

const VUES: Record<string, Vue> = { nouveau: "nouveau", cartons: "cartons", sav: "sav", destinations: "destinations", journal: "journal", reglages: "reglages" };

/** Les mêmes adresses que /dashboard/espace-client, sous /espace-client/demo-equipe. */
export default async function DemoEquipe({ params }: { params: Promise<{ vue?: string[] }> }) {
  const { vue = [] } = await params;
  if (vue.length === 0) return <BackOffice porte={PORTE_DEMO} vue="dossiers" />;
  if (vue[0] === "dossiers" && vue[1]) return <BackOffice porte={PORTE_DEMO} vue="dossier" id={vue[1]} />;
  const v = VUES[vue[0]];
  if (!v || vue.length > 1) notFound();
  return <BackOffice porte={PORTE_DEMO} vue={v} />;
}
