import Link from "next/link";
import { eur, m3 } from "@/crm/lib/format";
import { etapeDe, NOM_ETAPE, type DemandeVue } from "./etapes";
import Radar from "./Radar";
import { AXES, basePrestige, type Araignee } from "./araignee";
import s from "./demandes.module.css";

/*
 * Demandes › Top demandes : les demandes classées par potentiel, chacune
 * avec son araignée (six axes, araignee.ts) et ses chiffres, et un lien vers
 * elle. Sous le classement, la règle de chaque axe et la source du prestige.
 * Pas de tuiles de chiffres au-dessus : la place va aux demandes.
 */

export default function TopDemandes({ lignes, filtre }: { lignes: { demande: DemandeVue; araignee: Araignee }[]; filtre: boolean }) {
  return (
    <>
      {lignes.length === 0 ? (
        <p className={s.videTop}>{filtre ? "Aucune demande pour ces filtres." : "Aucune demande ouverte."}</p>
      ) : (
        <ol className={s.top}>
          {lignes.map(({ demande: d, araignee: a }, i) => {
            const etape = etapeDe(d);
            const v = a.valeurs;
            return (
              <li key={d.id} className={s.ligne}>
                <span className={s.rang} aria-label={`Rang ${i + 1}`}>
                  {i + 1}
                </span>
                <div className={s.radar}>
                  <Radar araignee={a} taille={128} />
                </div>
                <div className={s.infos}>
                  <div className={s.nom}>
                    <Link href={d.dossier ? `/dossiers/${d.dossier.id}` : `/dashboard/${d.id}`}>{d.client}</Link>
                    <span className={s.etape} data-etape={etape}>
                      {etape === "dossier" && d.dossier ? `Dossier ${d.dossier.ref}` : NOM_ETAPE[etape]}
                    </span>
                  </div>
                  <p className={s.trajet}>
                    {[d.depart ?? "?", d.arrivee ?? "?"].join(" → ")} · {d.parcoursLabel}
                  </p>
                  <dl className={s.chiffres}>
                    <Chiffre titre="Potentiel" valeur={v.potentiel != null ? `${v.potentiel}` : null} unite="/100" />
                    <Chiffre titre="Facilité" valeur={v.facilite != null ? `${v.facilite}` : null} unite={d.difficulte != null ? `difficulté ${d.difficulte}` : undefined} />
                    <Chiffre titre="Prestige" valeur={v.prestige != null ? `${v.prestige}` : null} unite="/100" />
                    <Chiffre titre="Volume" valeur={d.volume != null && d.volume > 0 ? m3(d.volume) : null} />
                    <Chiffre titre="Estimation" valeur={d.estimation != null ? eur(d.estimation) : null} />
                    <Chiffre titre="Complétude" valeur={`${v.completude}`} unite="%" />
                  </dl>
                  <p className={s.base} title={basePrestige(a.prestige)}>
                    {a.prestige ? (
                      <>
                        <b>{a.prestige.score != null ? `Prestige ${a.prestige.score}/100` : "Prestige non noté"}</b> · {basePrestige(a.prestige).split(" · ").slice(1).join(" · ")} · {a.prestige.ou}
                      </>
                    ) : (
                      basePrestige(null)
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className={s.regles} aria-label="Les six axes de l'araignée">
        <h3>Les six axes, de 0 (centre) à 100 (bord) : plus loin du centre, mieux c&apos;est</h3>
        <dl>
          {AXES.map((x) => (
            <div key={x.cle} style={{ display: "contents" }}>
              <dt>{x.label}</dt>
              <dd>{x.regle}</dd>
            </div>
          ))}
        </dl>
        <p>
          Source du prestige : « Statistiques DVF », data.gouv.fr (Etalab, Licence Ouverte 2.0), prix médian au m² des maisons et appartements vendus en 2021–2025, par commune
          (arrondissement à Paris, Lyon et Marseille). Un axe sans valeur reste au centre, marqué d&apos;un rond ambre.
        </p>
      </section>
    </>
  );
}

function Chiffre({ titre, valeur, unite }: { titre: string; valeur: string | null; unite?: string }) {
  return (
    <div>
      <dt>{titre}</dt>
      {valeur == null ? (
        <dd data-vide="">—</dd>
      ) : (
        <dd>
          {valeur}
          {unite && <small>{unite}</small>}
        </dd>
      )}
    </div>
  );
}
