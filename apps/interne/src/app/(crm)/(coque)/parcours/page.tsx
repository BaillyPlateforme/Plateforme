import type { Metadata } from "next";
import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { currentUser } from "@/crm/lib/auth";
import { eur, m3, STATUTS, TYPES } from "@/crm/lib/format";
import { ville } from "@/crm/kanban/regles";
import { resumesParcours } from "@/crm/parcours/donnees";
import { resume } from "@/crm/parcours/etapes";
import s from "@/crm/parcours/parcours.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Parcours des dossiers" };

const VUES: Record<string, string> = { "": "Dossiers en cours", termines: "Dossiers terminés", perdus: "Dossiers perdus", tous: "Tous les dossiers" };

/*
 * Choisir un dossier pour suivre son parcours : une recherche, puis les
 * dossiers les plus récemment modifiés, chacun avec sa progression en
 * miniature (les treize étapes, de la demande à l'avis).
 */
export default async function Parcours({ searchParams }: { searchParams: Promise<{ q?: string; vue?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const vue = sp.vue && VUES[sp.vue] ? sp.vue : "";
  const liste = await resumesParcours({ q, vue });

  return (
    <div className="view">
      <Bandeau
        surtitre="Commercial · Suivi des dossiers"
        titre="Parcours des dossiers"
        texte="De la demande à la facture : choisissez un dossier pour voir tout son parcours sur une page."
        bas={
          <div className={s.basListe}>
            <form action="/parcours" className={s.cherche} role="search">
              <Icone nom="recherche" taille={16} />
              <input type="search" name="q" defaultValue={q} placeholder="Client, référence, ville…" aria-label="Rechercher un dossier" />
            </form>
            <Pilules
              label="Dossiers à afficher"
              items={[
                { href: "/parcours", label: "En cours", actif: !q && !vue },
                { href: "/parcours?vue=termines", label: "Terminés", actif: !q && vue === "termines" },
                { href: "/parcours?vue=perdus", label: "Perdus", actif: !q && vue === "perdus" },
                { href: "/parcours?vue=tous", label: "Tous", actif: !q && vue === "tous" },
              ]}
            />
          </div>
        }
      >
        <Link href="/kanban" data-ton="contour">
          Kanban
        </Link>
        <Link href="/dossiers" data-ton="contour">
          Liste des dossiers
        </Link>
      </Bandeau>

      <div className={s.listeTete}>
        <h2>{q ? `Résultats pour « ${q} »` : VUES[vue]}</h2>
        <span>
          {liste.length === 36 ? "Les 36 plus récents" : `${liste.length} dossier${liste.length > 1 ? "s" : ""}`}
          {!q && " · du plus récemment modifié au plus ancien"}
        </span>
      </div>

      {liste.length === 0 ? (
        <div className={s.listeVide}>
          <Icone nom="parcours" taille={26} />
          <b>Aucun dossier{q ? ` pour « ${q} »` : ""}</b>
          <span>Essayez un nom de client, une référence (BD-2026-…) ou une ville.</span>
        </div>
      ) : (
        <ul className={s.liste}>
          {liste.map((x) => {
            const r = resume(x.etapes);
            const st = STATUTS[x.statut];
            return (
              <li key={x.id}>
                <Link href={`/parcours/${x.id}`} className={s.dossier}>
                  <div className={s.dossierHaut}>
                    <span className={s.avatarMoyen} data-vide={!x.commercial || undefined} title={x.commercial ? `Commercial : ${x.commercial}` : "Aucun commercial"}>
                      {x.initiales ?? "—"}
                    </span>
                    <span className={s.dossierNom}>
                      <b>{x.client}</b>
                      <small>
                        {x.ref} · {TYPES[x.segment] ?? x.segment}
                      </small>
                    </span>
                    <span className={s.statut} data-statut={x.statut}>
                      {st?.label ?? x.statut}
                    </span>
                  </div>
                  <p className={s.dossierTrajet}>
                    {ville(x.depart) ?? "Départ ?"} <Icone nom="fleche" taille={13} /> {ville(x.arrivee) ?? "Arrivée ?"}
                    {x.volume > 0 && <span> · {m3(x.volume)}</span>}
                  </p>
                  <div className={s.miniature} aria-hidden>
                    {x.etapes.map((e) => (
                      <i key={e.cle} data-etat={e.etat} title={e.label} />
                    ))}
                  </div>
                  <div className={s.dossierBas}>
                    <span>
                      {x.statut === "perdu" ? "Perdu" : x.etapes.some((e) => e.etat === "encours") ? <>En cours : <b>{r.etape}</b></> : <b>Parcours complet</b>}
                    </span>
                    <span className={s.dossierMontant}>{x.montant != null ? eur(x.montant) : ""}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
