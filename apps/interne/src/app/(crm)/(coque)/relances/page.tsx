import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { currentUser } from "@/crm/lib/auth";
import { CATALOGUE, lignesCatalogue, raisonDeNePasEnvoyer } from "@/crm/messages/catalogue";
import { listerRelances, reglesRelances, RELANCES } from "@/crm/relances/moteur";
import Kanban, { type RegleVue } from "@/crm/relances/Kanban";

export const dynamic = "force-dynamic";

/**
 * Les relances, dossier par dossier, dans un Kanban : à venir, aujourd'hui,
 * en retard, envoyées, désactivées. Filtre par type (?type=…) : à la fusion
 * avec le design « Quantum », ces pilules passent dans le bas du Bandeau.
 */
export default async function Relances({ searchParams }: { searchParams: Promise<{ type?: string; dossier?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const [toutes, regles, cartes] = await Promise.all([listerRelances(), reglesRelances(), lignesCatalogue()]);
  const type = RELANCES.some((r) => r.type === sp.type) ? sp.type : null;
  // Ouvert depuis un dossier : ses seules relances (on reste sur le dossier).
  const dossier = sp.dossier && /^\d+$/.test(sp.dossier) ? Number(sp.dossier) : null;
  const relances = toutes.filter((r) => (!type || r.type === type) && (!dossier || r.dossierId === dossier));
  const vues: RegleVue[] = RELANCES.map((d) => {
    const g = regles.get(d.type)!;
    const c = cartes.get(d.carte) ?? null;
    const raison = raisonDeNePasEnvoyer(c);
    return {
      type: d.type, libelle: d.libelle, repere: d.repere, carte: d.carte,
      carteTitre: CATALOGUE.find((e) => e.cle === d.carte)?.titre ?? d.carte,
      carteEtat: raison ? (c?.corps.trim() ? "Carte désactivée" : "Texte à valider") : "Carte active",
      actif: g.actif, premier_delai_jours: g.premier_delai_jours, intervalle_jours: g.intervalle_jours, nombre_max: g.nombre_max,
    };
  });
  const dues = toutes.filter((r) => r.colonne === "aujourdhui" || r.colonne === "retard").length;
  return (
    <div className="view">
      <Bandeau
        surtitre="Commercial · Relances"
        titre="Relances"
        texte={dues ? `${dues} relance${dues > 1 ? "s" : ""} à faire aujourd’hui ou en retard` : "Aucune relance à faire aujourd’hui"}
        bas={
          <Pilules
            label="Type de relance"
            items={[
              { href: "/relances", label: "Toutes", actif: !type, nombre: toutes.length },
              ...RELANCES.map((d) => ({ href: `/relances?type=${d.type}`, label: d.libelle, actif: type === d.type, nombre: toutes.filter((r) => r.type === d.type).length })),
            ]}
          />
        }
      >
        {dossier && <Link href={`/dossiers/${dossier}`} data-ton="contour">Fiche du dossier</Link>}
        {dossier && <Link href="/relances" data-ton="contour">Toutes les relances</Link>}
        <Link href="/modeles" data-ton="contour">Courriers et SMS</Link>
      </Bandeau>
      <Kanban relances={relances} regles={vues} />
    </div>
  );
}
