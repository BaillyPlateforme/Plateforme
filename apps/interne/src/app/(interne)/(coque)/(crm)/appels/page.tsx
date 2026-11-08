import Link from "next/link";
import { Suspense } from "react";
import Bandeau from "@/ui/Bandeau";
import Filtres, { type Filtre } from "@/ui/Filtres";
import MenuVertical, { AvecMenu } from "@/ui/MenuVertical";
import { Icone } from "@/ui/icones";
import { currentUser } from "@/crm/lib/auth";
import { appelsFaits, lireAppels } from "@/crm/appels/donnees";
import {
  ATTENTE_PLEINE_HEURES, DEVIS_SANS_REPONSE_JOURS, FAITS_JOURS, ICONE_SOURCE, MONTANT_PLEIN, POIDS, SOURCES, sourceDe, telAffiche, telLien,
  URGENCE, type AppelFait, type SourceAppel,
} from "@/crm/appels/regles";
import ListeAppels from "@/crm/appels/ListeAppels";
import Interrupteur, { LegendeTri } from "@/crm/appels/Interrupteur";
import { Vide } from "@/crm/appels/BoutonAppels";
import s from "@/crm/appels/appels.module.css";

export const dynamic = "force-dynamic";

/*
 * Les appels à passer, en grand (le panneau du bouton « Appels » de la barre
 * du haut mène ici par « Tout voir ») : la même liste, avec de la place.
 * Trois vues au menu de gauche — À appeler, Plus tard (les appels reportés),
 * Faits (les appels notés ces derniers jours) ; dans la bande, le filtre par
 * source et le switch Chronologique | Pertinence. Hors du menu de navigation :
 * le bouton de la barre en est l'entrée.
 *
 * Les sources et leurs règles : src/crm/appels/donnees.ts ; le score :
 * src/crm/appels/regles.ts.
 */

type Vue = "a-faire" | "plus-tard" | "faits";

export default async function Appels({ searchParams }: { searchParams: Promise<{ vue?: string; source?: string }> }) {
  const u = await currentUser();
  const sp = await searchParams;
  const vue: Vue = sp.vue === "plus-tard" || sp.vue === "faits" ? sp.vue : "a-faire";
  const source = sourceDe(sp.source)?.cle ?? null;
  const [{ aFaire, reportes }, faits] = await Promise.all([lireAppels(), appelsFaits()]);
  const garder = <T extends { source: SourceAppel }>(l: T[]) => (source ? l.filter((a) => a.source === source) : l);

  const lien = (v: Vue) => {
    const p = new URLSearchParams();
    if (v !== "a-faire") p.set("vue", v);
    if (source) p.set("source", source);
    const x = p.toString();
    return `/appels${x ? `?${x}` : ""}`;
  };

  const menu = (
    <MenuVertical
      titre="Appels"
      groupes={[
        {
          items: [
            { href: lien("a-faire"), label: "À appeler", icone: "telephone", actif: vue === "a-faire", nombre: garder(aFaire).length },
            { href: lien("plus-tard"), label: "Plus tard", icone: "sablier", actif: vue === "plus-tard", nombre: garder(reportes).length },
            { href: lien("faits"), label: "Faits", icone: "coche", actif: vue === "faits", nombre: garder(faits).length },
          ],
        },
      ]}
    />
  );

  const filtres: Filtre[] = [{ cle: "source", libelle: "Toutes les sources", options: SOURCES.map((x) => ({ valeur: x.cle, libelle: x.libelle })) }];

  const TITRES: Record<Vue, string> = {
    "a-faire": "À appeler maintenant",
    "plus-tard": "Reportés à plus tard",
    faits: `Notés ces ${FAITS_JOURS} derniers jours`,
  };

  return (
    <div className="view">
      <Bandeau
        surtitre="Appels"
        titre="Appels à passer"
        texte="Qui appeler, et pourquoi : rappels demandés, nouvelles demandes, devis sans réponse, visites de demain."
        bas={
          <div className={s.basBandeau}>
            {/* Les filtres lisent l'adresse côté navigateur : une frontière Suspense. */}
            <Suspense>
              <Filtres filtres={filtres} garder={["vue"]} />
            </Suspense>
            {vue === "a-faire" && <Interrupteur utilisateur={u.id} variante="verre" />}
          </div>
        }
      />
      <AvecMenu menu={menu}>
        <div className={s.page}>
          <div className={s.enTeteListe}>
            <h2>{TITRES[vue]}</h2>
            {vue === "a-faire" && <LegendeTri utilisateur={u.id} />}
            {vue === "plus-tard" && <span className={s.legende}>Chacun revient dans la liste à l&apos;heure choisie</span>}
          </div>

          {vue === "faits" ? (
            <ListeFaits faits={garder(faits)} />
          ) : (
            <ListeAppels
              appels={garder(vue === "a-faire" ? aFaire : reportes)}
              utilisateur={u.id}
              variante="page"
              mode={vue === "a-faire" ? "afaire" : "reportes"}
              vide={
                <div className={s.videCarte}>
                  {vue === "a-faire" ? (
                    <Vide texte={source ? "Rien dans cette source pour le moment." : undefined} />
                  ) : (
                    <Vide titre="Aucun appel reporté" texte="« Plus tard », sur un appel, le range ici jusqu'à l'heure choisie." />
                  )}
                </div>
              }
            />
          )}

          {vue === "a-faire" && (
            <details className={s.regles}>
              <summary>D&apos;où viennent ces appels, et comment se calcule la pertinence</summary>
              <ul>
                <li>
                  <b>Rappels demandés</b> : les demandes de rappel encore « à rappeler » ou « en cours » (Demandes › À rappeler).
                  « Fait » les passe à « rappelé ».
                </li>
                <li>
                  <b>Nouvelles demandes</b> : les demandes du site des colonnes « Nouvelle » et « Incomplète » du Kanban de Demandes,
                  avec un téléphone et sans rappel ouvert.
                </li>
                <li>
                  <b>Devis sans réponse</b> : un dossier au statut « devis » dont le dernier envoi date de plus de {DEVIS_SANS_REPONSE_JOURS} jours,
                  sans devis signé ni « ne pas relancer ».
                </li>
                <li>
                  <b>Visites de demain</b> : une visite ou une visio de demain dont le SMS est parti sans réponse (ni 1 ni 2).
                </li>
              </ul>
              <p>
                <b>Pertinence (sur 100)</b> = urgence (visite {URGENCE.visite}, rappel {URGENCE.rappel}, devis {URGENCE.devis}, nouvelle demande{" "}
                {URGENCE.nouvelle}) + potentiel de la demande ({POIDS.potentiel} au plus) + montant du devis ou de l&apos;estimation ({POIDS.montant} au
                plus, plein à {MONTANT_PLEIN.toLocaleString("fr-FR")} €) + attente ({POIDS.attente} au plus, plein à {ATTENTE_PLEINE_HEURES / 24}{" "}
                jours ; d&apos;emblée pour une visite de demain). Survolez un score pour son détail.
              </p>
            </details>
          )}
        </div>
      </AvecMenu>
    </div>
  );
}

function ListeFaits({ faits }: { faits: AppelFait[] }) {
  if (!faits.length)
    return (
      <div className={s.videCarte}>
        <Vide titre="Aucun appel noté" texte={`Les appels notés « Fait » ces ${FAITS_JOURS} derniers jours viendront ici, avec leur note.`} />
      </div>
    );
  return (
    <ol className={s.faits}>
      {faits.map((f) => {
        const tel = telAffiche(f.telephone);
        const href = telLien(f.telephone);
        return (
          <li key={`${f.cle}|${f.quand}`} data-source={f.source}>
            <span className={s.pictogramme} data-source={f.source} aria-hidden>
              <Icone nom={ICONE_SOURCE[f.source]} taille={17} />
            </span>
            <div className={s.faitCorps}>
              <b className={s.client}>{f.client}</b>
              <p className={s.motif}>{f.motif}</p>
              {f.note && <p className={s.note}>« {f.note} »</p>}
            </div>
            <div className={s.faitMeta}>
              <span>
                <Icone nom="coche" taille={13} /> {f.quandLibelle}
              </span>
              <small>
                {f.par ? `par ${f.par}` : ""}
                {tel && href ? (
                  <>
                    {f.par ? " · " : ""}
                    <a href={href}>{tel}</a>
                  </>
                ) : null}
              </small>
            </div>
            {f.lien ? (
              <Link href={f.lien} className={s.ouvrir} aria-label={`Ouvrir : ${f.client}`} title="Ouvrir">
                <Icone nom="fleche" taille={16} />
              </Link>
            ) : (
              <span />
            )}
          </li>
        );
      })}
    </ol>
  );
}
