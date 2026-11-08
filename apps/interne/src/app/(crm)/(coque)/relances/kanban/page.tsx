import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { currentUser } from "@/crm/lib/auth";
import { q1 } from "@/crm/lib/db";
import { jourParis } from "@/crm/envois";
import { listerRelances, RATTRAPAGE_JOURS } from "@/crm/relances/moteur";
import { plus, RELANCES } from "@/crm/relances/regles";
import { enteteDossier } from "@/crm/relances/suivi";
import Kanban, { BoutonExclusion } from "@/crm/relances/Kanban";
import { dossierDuFiltre, lienRelances, MenuRelances } from "@/crm/relances/Section";
import s from "@/crm/relances/relances.module.css";

export const dynamic = "force-dynamic";

/**
 * Les relances, dossier par dossier, dans un Kanban : à venir, aujourd'hui,
 * en retard, envoyées, désactivées. Filtre par type dans le bas du bandeau ;
 * ouvert depuis un dossier (?dossier=), ses seules relances.
 */
export default async function KanbanRelances({ searchParams }: { searchParams: Promise<{ type?: string; dossier?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const dossier = dossierDuFiltre(sp.dossier);
  const aujourdhui = jourParis();
  const [toutes, ouvert, exclu] = await Promise.all([
    listerRelances(aujourdhui),
    enteteDossier(dossier),
    dossier ? q1("select 1 from relances_exclusions where dossier_id=$1 and type='*'", [dossier]) : Promise.resolve(undefined),
  ]);
  const type = RELANCES.some((r) => r.type === sp.type) ? sp.type : null;
  const duDossier = toutes.filter((r) => !dossier || r.dossierId === dossier);
  const relances = duDossier.filter((r) => !type || r.type === type);
  const dues = duDossier.filter((r) => r.colonne === "aujourdhui" || r.colonne === "retard").length;
  return (
    <div className="view">
      <Bandeau
        surtitre={ouvert ? `Commercial · Relances · ${ouvert.ref}${ouvert.client ? ` · ${ouvert.client}` : ""}` : "Commercial · Relances"}
        titre="Kanban des relances"
        texte={dues ? `${dues} relance${dues > 1 ? "s" : ""} à faire aujourd’hui ou en retard` : "Aucune relance à faire aujourd’hui"}
        etiquettes={[exclu ? "Dossier marqué « ne pas relancer »" : null]}
        bas={
          <Pilules
            label="Type de relance"
            items={[
              { href: lienRelances("/relances/kanban", dossier), label: "Toutes", actif: !type, nombre: duDossier.length },
              ...RELANCES.map((d) => ({ href: lienRelances("/relances/kanban", dossier, { type: d.type }), label: d.libelle, actif: type === d.type, nombre: duDossier.filter((r) => r.type === d.type).length })),
            ]}
          />
        }
      >
        {dossier && <Link href={`/dossiers/${dossier}`} data-ton="contour">Fiche du dossier</Link>}
        {dossier && <BoutonExclusion dossierId={dossier} exclu={!!exclu} />}
        {dossier && <Link href="/relances/kanban" data-ton="contour">Toutes les relances</Link>}
        {!dossier && <Link href="/relances/configuration" data-ton="contour">Règles des relances</Link>}
      </Bandeau>
      <AvecMenu menu={<MenuRelances page="kanban" dossier={dossier} aFaire={dues} />}>
        <div className={s.page}>
          <Kanban relances={relances} aujourdhui={aujourdhui} borneRattrapage={plus(aujourdhui, -RATTRAPAGE_JOURS)} />
        </div>
      </AvecMenu>
    </div>
  );
}
