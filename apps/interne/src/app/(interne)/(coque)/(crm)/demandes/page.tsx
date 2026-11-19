import type { Metadata } from "next";
import { Suspense } from "react";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { currentUser } from "@/crm/lib/auth";
import { activitesDe, dernieresActivites } from "@/crm/demandes/activites";
import { araignees, lireDemandes } from "@/crm/demandes/donnees";
import { estOuverte, etapeDe } from "@/crm/demandes/etapes";
import { aDecider } from "@/crm/kanban/etapes";
import FiltresDemandes from "@/crm/demandes/FiltresDemandes";
import FiltresKanban from "@/crm/demandes/FiltresKanban";
import KanbanDemandes from "@/crm/demandes/KanbanDemandes";
import ListeDemandes from "@/crm/demandes/ListeDemandes";
import ListeDetail from "@/crm/demandes/ListeDetail";
import type { LigneDemande } from "@/crm/demandes/liste-commun";
import MenuDemandes, { estVueDemandes, TITRES_DEMANDES, type VueDemandes } from "@/crm/demandes/MenuDemandes";
import RappelsBoard from "@/crm/demandes/RappelsBoard";
import SuiviLeads from "@/crm/demandes/SuiviLeads";
import { jourParis, libelleJour } from "@/crm/feed/donnees";
import { dossiersDesDemandes } from "@/crm/parcours/demandes";
import StatistiquesDuSite from "@/crm/statistiques/demandes/StatistiquesDuSite";
import { vueDuSite } from "@/crm/statistiques/demandes/vues";
import { listRappels } from "@/lib/rappels";
import { listRequests } from "@/lib/requests";
import { listLeads } from "@/lib/suivi";
import f from "@/crm/feed/feed.module.css";
import h from "@/crm/parcours/hub.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demandes" };

/*
 * Demandes (demande de David, 08/11/2026) : les demandes du site, de près —
 * un zoom sur le début du parcours, dont le Tableau du Parcours ne garde que
 * le résumé (sa colonne « Demandes »). Les vues sont dans la sous-barre du
 * haut depuis le 19/11/2026 (ui/navigation.ts), chacune avec son titre ; les
 * filtres dans la rangée du bas ; les huit analyses des Statistiques au menu
 * de gauche (MenuDemandes).
 *
 *  - Kanban (/demandes) : les étapes détaillées, jusqu'à « Dossier » ;
 *  - Feed (?vue=feed) et Top demandes (?vue=top) : la même liste et le même
 *    panneau de la demande choisie (ListeDetail), dans l'ordre de réception
 *    (par jour) ou du potentiel (la n° 1 en vedette) ;
 *  - Analyse : Liste (?vue=liste), À rappeler (?vue=rappels), Statistiques
 *    (?vue=statistiques&analyse=…), Suivi des leads (?vue=leads).
 *
 * La page d'une demande reste /dashboard/<id>. Les anciennes adresses
 * (/dashboard, Parcours › Analyse des demandes, /statistiques/demandes) y
 * mènent.
 */

const TEXTES: Record<VueDemandes, string> = {
  kanban: "Kanban · de la demande reçue au dossier : chaque demande, à son étape",
  feed: "Feed · les demandes dans l'ordre où elles arrivent, la dernière activité de chacune",
  top: "Top demandes · les plus prometteuses d'abord, la meilleure en tête",
  liste: "Liste · tout ce qui arrive, du formulaire comme des mails",
  rappels: "À rappeler · les clients qui demandent qu'on les rappelle",
  statistiques: "Statistiques · le flux des demandes, du formulaire comme des mails",
  leads: "Suivi des leads · chaque demande du site, du premier contact au chiffre d'affaires",
};

/** Le seuil de « Fort potentiel » (l'ancienne vue Focus) : 70/100. */
const SEUIL = 70;

type Params = Record<string, string | string[] | undefined>;

const dateLongue = (jour: string) => new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function Demandes({ searchParams }: { searchParams: Promise<Params> }) {
  await currentUser();
  const sp = await searchParams;
  const un = (k: string) => {
    const x = sp[k];
    return (Array.isArray(x) ? x[0] : x) ?? null;
  };
  const vue: VueDemandes = estVueDemandes(un("vue")) ? (un("vue") as VueDemandes) : "kanban";
  const analyse = vueDuSite(un("analyse"));
  // Les rappels : lus pour la vue « À rappeler » seulement ; jamais bloquant.
  const rappels = vue === "rappels" ? await listRappels().catch(() => null) : null;

  let contenu: React.ReactNode;
  let bas: React.ReactNode = undefined;
  let texte = TEXTES[vue];

  if (vue === "kanban") {
    const demandes = await lireDemandes().catch(() => null);
    // Le compte de la colonne « Demandes » du Parcours : la même lecture, la même règle (aDecider).
    if (demandes) {
      const n = demandes.filter(aDecider).length;
      texte = `Kanban · ${n} demande${n > 1 ? "s" : ""} à accepter ou refuser, de la demande reçue au dossier`;
    }
    contenu = demandes ? (
      <Suspense>
        <KanbanDemandes demandes={demandes} />
      </Suspense>
    ) : (
      <Indisponible texte="Les demandes ne se lisent pas pour le moment : réessayez dans un instant." />
    );
    bas = (
      <Suspense>
        <FiltresKanban />
      </Suspense>
    );
  } else if (vue === "top" || vue === "feed") {
    // Top demandes et Feed : la même liste, le même panneau ; l'ordre change. Top montre d'abord les ouvertes, le Feed tout.
    const tri = vue === "top" ? "potentiel" : "historique";
    const portee = un("portee") === "ouvertes" || un("portee") === "toutes" ? un("portee") : un("tout") === "1" ? "toutes" : vue === "top" ? "ouvertes" : "toutes";
    const fort = un("potentiel") === "fort";
    const demandes = await lireDemandes().catch(() => null);
    if (!demandes) contenu = <Indisponible texte="Les demandes ne se lisent pas pour le moment : réessayez dans un instant." />;
    else {
      const retenues = demandes.filter((d) => (portee === "toutes" || estOuverte(d)) && (!fort || (d.potentiel ?? 0) >= SEUIL));
      const [radars, dernieres] = await Promise.all([araignees(retenues, demandes), tri === "historique" ? dernieresActivites(retenues).catch(() => ({})) : Promise.resolve({})]);
      const aujourdhui = jourParis();
      const lignes: LigneDemande[] = retenues
        .map((d) => {
          const jour = jourParis(new Date(d.recueLe));
          const libelle = libelleJour(jour, aujourdhui);
          return {
            demande: d,
            araignee: radars.get(d.id)!,
            etape: etapeDe(d),
            derniere: (dernieres as Record<string, LigneDemande["derniere"]>)[d.id] ?? null,
            jour: tri === "historique" ? { cle: jour, libelle, sous: libelle === "Aujourd’hui" || libelle === "Hier" ? dateLongue(jour) : null } : null,
          };
        })
        .sort((a, b) =>
          tri === "historique"
            ? b.demande.recueLe.localeCompare(a.demande.recueLe)
            : (b.demande.potentiel ?? -1) - (a.demande.potentiel ?? -1) || (b.demande.estimation ?? -1) - (a.demande.estimation ?? -1) || b.demande.recueLe.localeCompare(a.demande.recueLe),
        );
      const demandee = un("sel");
      const selection = lignes.find((l) => l.demande.id === demandee)?.demande.id ?? lignes[0]?.demande.id ?? null;
      const activites = selection ? await activitesDe(selection, 5).catch(() => null) : null;
      contenu = (
        <ListeDetail
          lignes={lignes}
          tri={tri}
          selection={selection}
          activitesInitiales={selection && activites ? { [selection]: activites } : {}}
          vide={fort || portee === "ouvertes" ? "Aucune demande pour ces filtres." : "Aucune demande."}
        />
      );
    }
    const lien = (o: { portee?: string; fort?: boolean }) => {
      const p = new URLSearchParams({ vue });
      p.set("portee", o.portee ?? portee!);
      if (o.fort ?? fort) p.set("potentiel", "fort");
      return `/demandes?${p}`;
    };
    bas = (
      <div className={f.basBandeau}>
        <Pilules
          label="Quelles demandes"
          items={[
            { href: lien({ portee: "ouvertes" }), label: "Ouvertes", actif: portee === "ouvertes" },
            { href: lien({ portee: "toutes" }), label: "Toutes", actif: portee === "toutes" },
          ]}
        />
        <Pilules label="Fort potentiel" items={[{ href: lien({ fort: !fort }), label: `Fort potentiel (${SEUIL} et plus)`, actif: fort }]} />
      </div>
    );
  } else if (vue === "liste") {
    const [requests, dossiers] = await Promise.all([listRequests().catch(() => null), dossiersDesDemandes().catch(() => ({}))]);
    contenu = (
      <div className={`vue-equipe ${h.equipe}`}>
        {requests ? <ListeDemandes requests={requests} dossiers={dossiers} /> : <Indisponible texte="Les demandes ne se lisent pas pour le moment : réessayez dans un instant." />}
      </div>
    );
    bas = (
      <Suspense>
        <FiltresDemandes />
      </Suspense>
    );
  } else if (vue === "rappels") {
    contenu = <div className={`vue-equipe ${h.equipe}`}>{rappels ? <RappelsBoard rappels={rappels} /> : <Indisponible texte="Les rappels ne se lisent pas pour le moment : réessayez dans un instant." />}</div>;
  } else if (vue === "statistiques") {
    contenu = (
      <div className={`vue-equipe ${h.equipe}`}>
        <StatistiquesDuSite vue={analyse} />
      </div>
    );
  } else {
    const leads = await listLeads().catch(() => null);
    contenu = <div className={`vue-equipe ${h.equipe}`}>{leads ? <SuiviLeads leads={leads} aujourdhui={jourParis()} /> : <Indisponible texte="Le suivi des leads ne se lit pas pour le moment : réessayez dans un instant." />}</div>;
  }

  return (
    <div className="view">
      {/* Les vues sont dans la sous-barre du haut depuis le 19/11/2026 ; seules les analyses des Statistiques gardent un menu à gauche. */}
      <Bandeau surtitre="Demandes" titre={TITRES_DEMANDES[vue]} texte={texte} bas={bas} />
      {vue === "statistiques" ? <AvecMenu menu={<MenuDemandes analyse={analyse} />}>{contenu}</AvecMenu> : contenu}
    </div>
  );
}

function Indisponible({ texte }: { texte: string }) {
  return <div className="card empty">{texte}</div>;
}
