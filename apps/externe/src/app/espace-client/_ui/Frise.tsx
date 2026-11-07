import Link from "next/link";
import type { CSSProperties } from "react";
import type { Espace } from "@/lib/espace-client/espace";
import { dateLongue, joursRestants, pluriel } from "@/lib/espace-client/format";
import { avancement, prochaineEtape, texteProchaineEtape, type Etape } from "@/lib/espace-client/progression";
import { Icone } from "./Icone";

const d = (n: number) => ({ "--d": n }) as CSSProperties;

const ICONE_ETAPE: Record<Etape["cle"], string> = {
  devis: "devis",
  conditions: "home",
  valeurs: "shield",
  cgv: "documents",
  pays: "documents",
  cartons: "cartons",
  solde: "factures",
  realise: "check",
};

/**
 * La frise de la micro démo : compte à rebours, jauge, étapes, et la carte
 * « Prochaine étape ». Tout se lit dans la frise calculée (progression.ts) —
 * rien n'est écrit en dur ici.
 */
export function Frise({ e }: { e: Espace }) {
  const { dossier, frise } = e;
  const base = `/espace-client/${dossier.reference}`;
  const { faites, total, pourcent } = avancement(frise);
  const termine = dossier.statut === "termine";
  const j = joursRestants(dossier.periode_debut);
  const suivante = prochaineEtape(frise);

  // La classe de chaque étape, comme dans la micro démo : faite, la prochaine, à faire, ou plus tard.
  const etat = (x: Etape) => {
    if (x.statut === "fait") return "done";
    if (x === suivante) return "next";
    return x.statut === "en_attente" ? "later" : "todo";
  };

  return (
    <section className="section progress-band" id="progression">
      <div className="wrap">
        <div className="progress-top apparait">
          <div>
            <p className="kicker">Où en êtes-vous ?</p>
            <h2 className="h-section">
              Votre déménagement,
              <br />
              étape par étape
            </h2>
            <p className="lede">
              {termine
                ? "Ce dossier est clôturé. Retrouvez vos documents, vos factures et le suivi SAV."
                : `${pluriel(faites, "étape")} sur ${total} terminée${faites > 1 ? "s" : ""}. Chaque étape se met à jour automatiquement à partir de votre dossier.`}
            </p>
          </div>
          <div className="countdown">
            {termine ? (
              <>
                <span className="num">
                  <Icone nom="check" style={{ width: ".7em", height: ".7em", color: "var(--ok)" }} />
                </span>
                <small>Déménagement réalisé le {dateLongue(dossier.termine_le ?? dossier.periode_fin)}</small>
              </>
            ) : j > 0 ? (
              <>
                <span className="num">
                  <sup>J−</sup>
                  {j}
                </span>
                <small>avant le grand jour</small>
              </>
            ) : (
              <>
                <span className="num">
                  <sup>J</sup>
                </span>
                <small>{j === 0 ? "c'est le grand jour" : "déménagement en cours"}</small>
              </>
            )}
          </div>
        </div>

        <div className="meter apparait" style={d(1)}>
          <i style={{ width: `${pourcent}%` }} />
        </div>
        <div className="meter-legend apparait" style={d(1)}>
          <span>
            <b>{pourcent} %</b> de votre dossier complété
          </span>
          <span>
            {dossier.volume_m3} m³ · {dossier.logement ?? `formule ${dossier.formule}`}
          </span>
        </div>

        <ol className="frise" style={{ "--n": frise.length } as CSSProperties}>
          {frise.map((x, n) => {
            const classe = etat(x);
            const href = x.cible ? `${base}/${x.cible}` : null;
            return (
              <li key={x.cle} className={`step ${classe} apparait`} style={d(n)}>
                {href && x.statut !== "fait" && <Link className="hit" href={href} aria-label={x.titre} />}
                <span className="node">{x.statut === "fait" ? <Icone nom="check" /> : n + 1}</span>
                <div className="t">{x.titre}</div>
                <div className="s">
                  {x.statut === "fait" || !href ? x.detail : <Link href={href}>{x.detail} →</Link>}
                </div>
                {x.bloquante && x.statut !== "fait" && <div className="flag-etape">Obligatoire</div>}
                {x.optionnelle && x.statut !== "fait" && <div className="flag-etape doux">Facultatif</div>}
              </li>
            );
          })}
        </ol>

        {suivante ? (
          <div className="next-card apparait">
            <span className="ico">
              <Icone nom={ICONE_ETAPE[suivante.cle]} />
            </span>
            <div>
              <div className="k">{suivante.bloquante ? "Prochaine étape · obligatoire" : "Prochaine étape"}</div>
              <h3>{texteProchaineEtape(suivante, e)[0]}</h3>
              <p>{texteProchaineEtape(suivante, e)[1]}</p>
            </div>
            {suivante.cible && (
              <Link className="btn btn-primary" href={`${base}/${suivante.cible}`}>
                C&apos;est parti <Icone nom="arrow" />
              </Link>
            )}
          </div>
        ) : (
          <div className="next-card all-done apparait">
            <span className="ico">
              <Icone nom="check" />
            </span>
            <div>
              <div className="k">{termine ? "Dossier clôturé" : "Tout est prêt"}</div>
              <h3>{termine ? "Merci de votre confiance" : "Il ne reste plus qu'à déménager"}</h3>
              <p>
                {termine
                  ? "Un souci constaté après la livraison ? Le SAV est accessible depuis cet espace."
                  : "Votre conseiller reste joignable jusqu'au jour J pour la moindre question."}
              </p>
            </div>
            {termine && (
              <Link className="btn btn-primary" href={`${base}/sav`}>
                Accéder au SAV <Icone nom="arrow" />
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
