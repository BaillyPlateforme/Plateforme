import Link from "next/link";
import { currentUser } from "@/crm/lib/auth";
import NouveauPlan from "@/crm/dispatch/composants/NouveauPlan";
import { Picto } from "@/crm/dispatch/composants/Picto";
import s from "@/crm/dispatch/composants/dispatch.module.css";
import { plans } from "@/crm/dispatch/donnees";
import { dateLongue, jauge, m3 } from "@/crm/dispatch/outils";
import { ilYa } from "@/crm/lib/format";
import { compteursConteneurs } from "@/crm/conteneurs/donnees";
import VuesConteneurs from "@/crm/conteneurs/Vues";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dispatch international" };

/*
 * Les plans de dispatch des conteneurs internationaux (§5 du cahier des
 * charges) : un plan par groupage, avec le remplissage de chaque conteneur.
 * Depuis la simplification du 08/11/2026, c'est une vue des Conteneurs, dans
 * leur menu de gauche (« Conteneurs · Dispatch »), plus une entrée de la
 * navigation. Le bandeau n'a pas de filtres : sa rangée basse reste vide.
 */
export default async function Dispatchs() {
  await currentUser();
  const [liste, n] = await Promise.all([plans(), compteursConteneurs()]);
  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation · Dispatch international"
        titre="Conteneurs"
        texte="Un conteneur, plusieurs clients, plusieurs destinations : importez la liste, laissez l'IA proposer qui va où, ajustez au glisser-déposer, puis imprimez les feuilles de tournée."
        action={{ label: "Nouveau plan", href: "#nouveau", icone: "plus" }}
      />

      <AvecMenu menu={<VuesConteneurs vue="dispatch" conteneurs={n.tous} plans={liste.length} />}>

        {liste.length > 0 && (
          <div className={`${s.racine} ${s.plans}`}>
            {liste.map((p) => (
              <Link key={p.id} href={`/conteneurs/dispatch/${p.id}`} className={s.plan}>
                <div className={s.ligneMeta}>
                  <span className={`${s.badge} ${s.violet}`}>
                    <Picto nom="bateau" taille={12} /> {p.sens === "export" ? "Export" : "Import"}
                    {p.port ? ` · ${p.port}` : ""}
                  </span>
                  {p.demo && <span className={s.badge}>Démonstration</span>}
                  {p.aRepartir === 0 && p.nb > 0 && (
                    <span className={`${s.badge} ${s.vert}`}>
                      <Picto nom="coche" taille={12} /> Tout est réparti
                    </span>
                  )}
                </div>
                <div>
                  <h3>{p.nom}</h3>
                  <p>
                    {p.nb} client{p.nb > 1 ? "s" : ""} · {m3(p.volume)}
                    {p.dateReference ? ` · départ le ${dateLongue(p.dateReference)}` : ""} · modifié {ilYa(p.majLe).toLowerCase()}
                  </p>
                </div>
                <div className={s.mini}>
                  {p.colonnes.slice(0, 6).map((c, i) => {
                    const j = jauge(c.volume, c.capacite);
                    return (
                      <div key={i} className={j.etat === "depasse" ? s.depasse : j.etat === "plein" ? s.plein : ""}>
                        <span>
                          {c.verrouillee && <Picto nom="cadenas" taille={11} className="ic-verrou" />} {c.libelle}
                        </span>
                        <span className={s.barre}>
                          <i style={{ width: `${Math.min(100, j.pct ?? 0)}%` }} />
                        </span>
                        <em>{j.pct != null ? `${Math.round(j.pct)} %` : m3(c.volume)}</em>
                      </div>
                    );
                  })}
                  {p.colonnes.length > 6 && <p>et {p.colonnes.length - 6 > 1 ? `${p.colonnes.length - 6} autres colonnes` : "une autre colonne"}</p>}
                  {p.colonnes.length === 0 && <p>Aucune colonne : la proposition de regroupement peut les créer.</p>}
                </div>
                <p style={{ color: p.aRepartir ? "#b45309" : "#15803d", fontWeight: 650 }}>
                  {p.aRepartir ? `${p.aRepartir} client${p.aRepartir > 1 ? "s" : ""} à répartir` : p.nb ? "Tous les clients sont placés" : "Aucun client importé"}
                  {p.verrouillees ? ` · ${p.verrouillees} colonne${p.verrouillees > 1 ? "s" : ""} validée${p.verrouillees > 1 ? "s" : ""}` : ""}
                </p>
              </Link>
            ))}
          </div>
        )}

        <NouveauPlan demo={liste.find((p) => p.demo)?.id ?? null} />
      </AvecMenu>
    </div>
  );
}
