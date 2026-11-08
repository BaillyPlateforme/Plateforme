import type { Metadata } from "next";
import { Suspense } from "react";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import Filtres, { type Filtre } from "@/ui/Filtres";
import { AvecMenu } from "@/ui/MenuVertical";
import { currentUser } from "@/crm/lib/auth";
import { araignees, lireDemandes } from "@/crm/demandes/donnees";
import { estOuverte } from "@/crm/demandes/etapes";
import FiltresDemandes from "@/crm/demandes/FiltresDemandes";
import FiltresKanban from "@/crm/demandes/FiltresKanban";
import KanbanDemandes from "@/crm/demandes/KanbanDemandes";
import ListeDemandes from "@/crm/demandes/ListeDemandes";
import MenuDemandes, { estVueDemandes, type VueDemandes } from "@/crm/demandes/MenuDemandes";
import RappelsBoard from "@/crm/demandes/RappelsBoard";
import SuiviLeads from "@/crm/demandes/SuiviLeads";
import TopDemandes from "@/crm/demandes/TopDemandes";
import { filtresDe, lireFeed, optionsFeed, paramsDe, PERIODES } from "@/crm/feed/donnees";
import Fil from "@/crm/feed/Fil";
import { GENRES } from "@/crm/feed/sources";
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
 * le résumé (sa colonne « Demandes »). Un seul bandeau, le même titre pour
 * toutes les vues ; les vues au menu de gauche (MenuDemandes), les filtres
 * dans la rangée du bas.
 *
 *  - Kanban (/demandes) : les étapes détaillées, jusqu'à « Dossier » ;
 *  - Feed (?vue=feed) : tout ce qui arrive aux demandes (src/crm/feed, portée
 *    « demandes ») ;
 *  - Top demandes (?vue=top) : classées par potentiel, avec leur araignée ;
 *  - Analyse : Liste (?vue=liste), À rappeler (?vue=rappels), Statistiques
 *    (?vue=statistiques&analyse=…), Suivi des leads (?vue=leads).
 *
 * La page d'une demande reste /dashboard/<id>. Les anciennes adresses
 * (/dashboard, Parcours › Analyse des demandes, /statistiques/demandes) y
 * mènent.
 */

const TEXTES: Record<VueDemandes, string> = {
  kanban: "Kanban · de la demande reçue au dossier : chaque demande, à son étape",
  feed: "Feed · tout ce qui arrive aux demandes, au fil du temps",
  top: "Top demandes · classées par potentiel, avec leur araignée",
  liste: "Liste · tout ce qui arrive, du formulaire comme des mails",
  rappels: "À rappeler · les clients qui demandent qu'on les rappelle",
  statistiques: "Statistiques · le flux des demandes, du formulaire comme des mails",
  leads: "Suivi des leads · chaque demande du site, du premier contact au chiffre d'affaires",
};

/** Le seuil de « Fort potentiel » (l'ancienne vue Focus) : 70/100. */
const SEUIL = 70;

type Params = Record<string, string | string[] | undefined>;

export default async function Demandes({ searchParams }: { searchParams: Promise<Params> }) {
  await currentUser();
  const sp = await searchParams;
  const un = (k: string) => {
    const x = sp[k];
    return (Array.isArray(x) ? x[0] : x) ?? null;
  };
  const vue: VueDemandes = estVueDemandes(un("vue")) ? (un("vue") as VueDemandes) : "kanban";
  const analyse = vueDuSite(un("analyse"));
  // Les rappels ouverts : la pastille du menu, sur toutes les vues ; jamais bloquant.
  const rappels = await listRappels().catch(() => null);
  const ouverts = rappels?.filter((r) => r.statut === "a_rappeler" || r.statut === "en_cours").length;

  let contenu: React.ReactNode;
  let bas: React.ReactNode = undefined;

  if (vue === "kanban") {
    const demandes = await lireDemandes().catch(() => null);
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
  } else if (vue === "top") {
    const toutes = un("tout") === "1";
    const fort = un("potentiel") === "fort";
    const demandes = await lireDemandes().catch(() => null);
    if (!demandes) contenu = <Indisponible texte="Les demandes ne se lisent pas pour le moment : réessayez dans un instant." />;
    else {
      const retenues = demandes.filter((d) => (toutes || estOuverte(d)) && (!fort || (d.potentiel ?? 0) >= SEUIL));
      const radars = await araignees(retenues, demandes);
      const lignes = retenues
        .map((d) => ({ demande: d, araignee: radars.get(d.id)! }))
        .sort((a, b) => (b.demande.potentiel ?? -1) - (a.demande.potentiel ?? -1) || (b.demande.estimation ?? -1) - (a.demande.estimation ?? -1) || b.demande.recueLe.localeCompare(a.demande.recueLe));
      contenu = <TopDemandes lignes={lignes} filtre={toutes || fort} />;
    }
    const lien = (o: { tout?: boolean; fort?: boolean }) => {
      const p = new URLSearchParams({ vue: "top" });
      if (o.tout ?? toutes) p.set("tout", "1");
      if (o.fort ?? fort) p.set("potentiel", "fort");
      return `/demandes?${p}`;
    };
    bas = (
      <div className={f.basBandeau}>
        <Pilules
          label="Quelles demandes"
          items={[
            { href: lien({ tout: false }), label: "Ouvertes", actif: !toutes },
            { href: lien({ tout: true }), label: "Toutes", actif: toutes },
          ]}
        />
        <Pilules label="Fort potentiel" items={[{ href: lien({ fort: !fort }), label: `Fort potentiel (${SEUIL} et plus)`, actif: fort }]} />
      </div>
    );
  } else if (vue === "feed") {
    // Le Feed, réduit aux demandes : ses sources, ses phrases, son fil.
    const params = paramsDe({ ...sp, portee: "demandes" });
    const { filtres, objetLibelle } = await filtresDe(params);
    const [page, options] = await Promise.all([lireFeed(filtres, null), optionsFeed(params.objet && objetLibelle ? { valeur: params.objet, libelle: objetLibelle } : null)]);
    const liste: Filtre[] = [
      { cle: "periode", libelle: "Toute la période", options: PERIODES },
      { cle: "type", libelle: "Tous les types", options: GENRES.filter((g) => ["demande", "message", "dossier"].includes(g.cle)).map((g) => ({ valeur: g.cle, libelle: g.libelle })) },
      { cle: "par", libelle: "Toute l’équipe", options: options.personnes },
      { cle: "objet", libelle: "Toutes les demandes", options: options.objets.filter((o) => o.valeur.startsWith("r")) },
    ];
    const garder: Record<string, string | null> = { vue: "feed", periode: params.periode, type: params.type, par: params.par, objet: params.objet };
    bas = (
      <div className={f.basBandeau}>
        <Suspense>
          <Filtres filtres={liste} garder={["vue", "q"]} />
        </Suspense>
        <form className={f.recherche} action="/demandes" role="search">
          {Object.entries(garder).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Rechercher…" aria-label="Rechercher dans le fil des demandes" />
          <button type="submit">Chercher</button>
        </form>
      </div>
    );
    const pour: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v && k !== "vue") pour[k] = String(v);
    contenu = <Fil key={JSON.stringify(pour)} initial={page.evenements} suite={page.suite} params={pour} filtre={!!(params.periode || params.type || params.par || params.objet || params.q)} />;
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
    contenu = <div className={`vue-equipe ${h.equipe}`}>{leads ? <SuiviLeads leads={leads} /> : <Indisponible texte="Le suivi des leads ne se lit pas pour le moment : réessayez dans un instant." />}</div>;
  }

  return (
    <div className="view">
      {/* Un seul titre pour toutes les vues (David : changer de vue ne change pas de page). */}
      <Bandeau surtitre="Dossiers" titre="Demandes" texte={TEXTES[vue]} bas={bas} />
      <AvecMenu menu={<MenuDemandes vue={vue} analyse={analyse} nombres={{ rappels: ouverts }} />}>{contenu}</AvecMenu>
    </div>
  );
}

function Indisponible({ texte }: { texte: string }) {
  return <div className="card empty">{texte}</div>;
}
