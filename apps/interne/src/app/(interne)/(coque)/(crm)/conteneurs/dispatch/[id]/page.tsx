import { notFound } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import Planche from "@/crm/dispatch/composants/Planche";
import { conteneursCrm, dossiersRattachables, plan as lirePlan } from "@/crm/dispatch/donnees";
import { etatIa } from "@/crm/dispatch/ia";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await lirePlan(Number((await params).id));
  return { title: p ? `Dispatch · ${p.nom}` : "Dispatch" };
}

/** Le planning d'un plan de dispatch : Kanban, récapitulatif, historique. */
export default async function PlanDispatch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ importe?: string }> }) {
  await currentUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [plan, conteneurs, dossiers] = await Promise.all([lirePlan(Number(id)), conteneursCrm(), dossiersRattachables()]);
  if (!plan) notFound();
  const importe = Number(sp.importe);
  return (
    <div className="view">
      <Planche plan={plan} conteneurs={conteneurs} dossiers={dossiers} ia={etatIa()} importe={Number.isFinite(importe) && importe > 0 ? importe : null} />
    </div>
  );
}
