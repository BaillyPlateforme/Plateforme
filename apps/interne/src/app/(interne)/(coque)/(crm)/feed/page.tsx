import Link from "next/link";
import { Suspense } from "react";
import Bandeau from "@/ui/Bandeau";
import Filtres, { type Filtre } from "@/ui/Filtres";
import MenuVertical, { AvecMenu } from "@/ui/MenuVertical";
import type { NomIcone } from "@/ui/icones";
import { currentUser } from "@/crm/lib/auth";
import { compterFeed, filtresDe, lireFeed, optionsFeed, paramsDe, PERIODES, type ParamsFeed, type Vue } from "@/crm/feed/donnees";
import { GENRES } from "@/crm/feed/sources";
import Fil from "@/crm/feed/Fil";
import s from "@/crm/feed/feed.module.css";

export const dynamic = "force-dynamic";

/*
 * Le Feed (demande de David, 08/11/2026) : tout ce qui se fait, au fil du
 * temps, du plus récent au plus ancien, jour par jour.
 *
 * Trois vues au menu de gauche, avec leur nombre (les vues à gauche, jamais
 * dans la bande) : Tout, Client (ce que font les clients : demandes,
 * connexions, pièces, signatures, paiements…) et Staff (ce que font
 * l'équipe et l'outil : gestes, envois, suppressions, tâches). Les filtres
 * sont dans la rangée du bas de la bande : période, type d'événement,
 * personne, dossier ou demande, recherche. La bande garde son titre d'une
 * vue à l'autre : changer de vue ne change pas de page.
 *
 * La liste se charge par pages (« Voir plus », ou le défilement), jamais en
 * entier ; le détail d'un événement se lit au clic. Les sources et leurs
 * règles (chaque événement une seule fois) : src/crm/feed/sources.ts.
 */

const VUES: { cle: Vue; libelle: string; icone: NomIcone }[] = [
  { cle: "tout", libelle: "Tout", icone: "fil" },
  { cle: "client", libelle: "Client", icone: "clients" },
  { cle: "staff", libelle: "Staff", icone: "equipe" },
];

/** L'adresse du Feed : les filtres suivent d'une vue à l'autre. */
function lienFeed(p: ParamsFeed, o: Partial<Record<keyof ParamsFeed, string | null>> = {}) {
  const tout = { ...p, ...o };
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(tout)) if (v && !(k === "vue" && v === "tout")) u.set(k, String(v));
  const x = u.toString();
  return `/feed${x ? `?${x}` : ""}`;
}

export default async function Feed({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await currentUser();
  const params = paramsDe(await searchParams);
  const { filtres, objetLibelle } = await filtresDe(params);
  const [page, comptes, options] = await Promise.all([
    lireFeed(filtres, null),
    compterFeed(filtres),
    optionsFeed(params.objet && objetLibelle ? { valeur: params.objet, libelle: objetLibelle } : null),
  ]);

  const menu = (
    <MenuVertical
      titre="Feed"
      groupes={[
        {
          items: VUES.map((v) => ({
            href: lienFeed(params, { vue: v.cle }),
            label: v.libelle,
            icone: v.icone,
            actif: params.vue === v.cle,
            nombre: comptes[v.cle],
          })),
        },
      ]}
    />
  );

  const liste: Filtre[] = [
    { cle: "periode", libelle: "Toute la période", options: PERIODES },
    { cle: "type", libelle: "Tous les types", options: GENRES.map((g) => ({ valeur: g.cle, libelle: g.libelle })) },
    { cle: "par", libelle: "Toute l’équipe", options: options.personnes },
    { cle: "objet", libelle: "Tous les dossiers", options: options.objets },
  ];

  // La recherche garde la vue et les filtres en cours.
  const garder: Record<string, string | null> = { vue: params.vue === "tout" ? null : params.vue, periode: params.periode, type: params.type, par: params.par, objet: params.objet };
  const recherche = (
    <form className={s.recherche} action="/feed" role="search">
      {Object.entries(garder).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Rechercher…" aria-label="Rechercher dans le fil" />
      <button type="submit">Chercher</button>
    </form>
  );

  // Ce que la suite du fil doit renvoyer au serveur : les filtres de l'adresse, tels quels.
  const pour: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v) pour[k] = String(v);
  const filtre = !!(params.periode || params.type || params.par || params.objet || params.q);

  return (
    <div className="view">
      <Bandeau
        surtitre="Feed"
        // Un seul titre pour les trois vues (David : changer de vue ne change pas de page).
        titre="Feed"
        texte="Tout ce qui se fait, au fil du temps : les clients, l’équipe, les envois."
        bas={
          <div className={s.basBandeau}>
            {/* Les filtres lisent l'adresse côté navigateur : une frontière Suspense. */}
            <Suspense>
              <Filtres filtres={liste} garder={["vue", "q"]} />
            </Suspense>
            {recherche}
          </div>
        }
      >
        {params.objet && objetLibelle && !objetLibelle.endsWith("(supprimé)") && (
          <Link href={params.objet.startsWith("d") ? `/dossiers/${params.objet.slice(1)}` : `/dashboard/${params.objet.slice(1)}`} data-ton="contour">
            {params.objet.startsWith("d") ? "Ouvrir le dossier" : "Ouvrir la demande"}
          </Link>
        )}
      </Bandeau>
      <AvecMenu menu={menu}>
        <Fil key={lienFeed(params)} initial={page.evenements} suite={page.suite} params={pour} filtre={filtre} />
      </AvecMenu>
    </div>
  );
}
