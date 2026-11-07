import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import { currentUser } from "@/crm/lib/auth";
import { CATALOGUE, lignesCatalogue, raisonDeNePasEnvoyer } from "@/crm/messages/catalogue";
import { listerRelances, reglesRelances, RELANCES } from "@/crm/relances/moteur";
import Kanban, { type RegleVue } from "@/crm/relances/Kanban";
import s from "@/crm/messages/messages.module.css";

export const dynamic = "force-dynamic";

/**
 * Les relances, dossier par dossier, dans un Kanban : à venir, aujourd'hui,
 * en retard, envoyées, désactivées. Filtre par type (?type=…) : à la fusion
 * avec le design « Quantum », ces pilules passent dans le bas du Bandeau.
 */
export default async function Relances({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const [toutes, regles, cartes] = await Promise.all([listerRelances(), reglesRelances(), lignesCatalogue()]);
  const type = RELANCES.some((r) => r.type === sp.type) ? sp.type : null;
  const relances = toutes.filter((r) => !type || r.type === type);
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
        surtitre="Gestion"
        titre="Relances"
        texte={dues ? `${dues} relance${dues > 1 ? "s" : ""} à faire aujourd'hui ou en retard. La tâche de la veille les envoie ; vous pouvez aussi les repousser, les annuler ou les envoyer tout de suite.` : "Aucune relance à faire aujourd'hui. La tâche de la veille envoie chaque relance à sa date."}
        secondaire={{ label: "Courriers et SMS", href: "/modeles" }}
      />
      <nav className={s.filtres} aria-label="Type de relance">
        <div className={s.groupe}>
          <Link className={s.pilule} href="/relances" aria-current={!type ? "page" : undefined}>
            Toutes <i>{toutes.length}</i>
          </Link>
          {RELANCES.map((d) => (
            <Link key={d.type} className={s.pilule} href={`/relances?type=${d.type}`} aria-current={type === d.type ? "page" : undefined}>
              {d.libelle} <i>{toutes.filter((r) => r.type === d.type).length}</i>
            </Link>
          ))}
        </div>
      </nav>
      <Kanban relances={relances} regles={vues} />
    </div>
  );
}
