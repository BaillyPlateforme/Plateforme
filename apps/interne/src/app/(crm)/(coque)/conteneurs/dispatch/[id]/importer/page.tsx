import { notFound } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import Importeur from "@/crm/dispatch/composants/Importeur";
import { dossiersRattachables, plan as lirePlan } from "@/crm/dispatch/donnees";
import { cleDoublon } from "@/crm/dispatch/saisie";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importer des clients" };

/** L'import des clients d'un plan : fichier CSV ou Excel, ou saisie à la main. */
export default async function ImporterClients({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ manuel?: string }> }) {
  await currentUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [plan, dossiers] = await Promise.all([lirePlan(Number(id)), dossiersRattachables()]);
  if (!plan) notFound();
  return (
    <div className="view">
      <Bandeau
        surtitre={`Dispatch international · ${plan.nom}`}
        titre="Importer des clients"
        texte={
          <>
            Chaque ligne porte au minimum le nom du client, sa destination (ville, pays), son volume et ses remarques. Les clients importés arrivent dans « À répartir » ; le plan en
            compte déjà <b>{plan.lignes.length}</b>.
          </>
        }
        secondaire={{ label: "Retour au planning", href: `/conteneurs/dispatch/${plan.id}` }}
      />
      <Importeur
        planId={plan.id}
        planNom={plan.nom}
        capaciteMax={Math.max(plan.capacite20, plan.capacite40)}
        refs={dossiers.map((d) => [d.ref.toUpperCase(), d.nom] as [string, string])}
        existants={plan.lignes.map(cleDoublon)}
        manuel={sp.manuel === "1"}
      />
    </div>
  );
}
