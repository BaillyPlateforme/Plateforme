import type { Metadata } from "next";
import Bandeau from "@/ui/Bandeau";
import { currentUser } from "@/crm/lib/auth";
import WorkflowBuilder from "@/crm/parcours/WorkflowBuilder";
import { listAlerts } from "@/lib/alerts";
import { listTemplates } from "@/lib/templates";
import h from "@/crm/parcours/hub.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workflow des demandes" };

/*
 * Le workflow d'une demande du site : à chaque étape (formulaire, mail
 * complet ou incomplet, devis créé, envoyé, accepté, refusé), les actions
 * automatiques — un e-mail ou un SMS au client. Il était sous Demandes
 * (/dashboard/workflow) ; depuis la simplification du 08/11/2026, il s'ouvre
 * du Parcours, dont il règle la première étape.
 */
export default async function Workflow() {
  await currentUser();
  const [rules, templates] = await Promise.all([listAlerts(), listTemplates()]);
  return (
    <div className="view">
      <Bandeau
        surtitre="Parcours · Demandes du site"
        titre="Workflow"
        texte="Le parcours d'une demande, étape par étape."
        secondaire={{ label: "Parcours des dossiers", href: "/parcours" }}
      />
      <div className={`vue-equipe ${h.equipe}`}>
        <WorkflowBuilder rules={rules} templates={templates} />
      </div>
    </div>
  );
}
