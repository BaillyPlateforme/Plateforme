import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { estPorteur, porteurConnecte } from "@/terrain/lib/acces";
import { dossierTerrain, peutOuvrir, type Etape } from "@/terrain/lib/planning";
import { photosDuDossier } from "@/terrain/lib/photos";
import { DELAI_RETRAIT_MIN } from "@/terrain/regles";
import Capture from "@/terrain/composants/Capture";
import { GENRES, precisions } from "@/terrain/composants/CarteChantier";
import { Picto } from "@/terrain/composants/Picto";
import Refus from "@/terrain/composants/Refus";
import s from "@/terrain/composants/terrain.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chantier" };

/*
 * Un chantier, sur le terrain : où aller, avec qui, quel camion, les
 * consignes du bureau, puis les photos — avant, après, détails — prises et
 * envoyées d'ici, rattachées au dossier.
 */

const JOUR: Record<number, string> = { [-1]: "Hier", 0: "Aujourd'hui", 1: "Demain" };
const ETAPE: Record<string, string> = { depart: "Départ", garde_meuble: "Garde-meuble", arrivee: "Arrivée", autre: "Étape" };
const m3 = (v: number) => `${String(Math.round(v * 10) / 10).replace(".", ",")} m³`;

export default async function ChantierTerrain({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const p = await porteurConnecte();
  if (!p) redirect(`/terrain/connexion?redirect=/terrain/dossier/${id}`);
  if (!estPorteur(p)) return <Refus refus={p.refus} />;

  const barre = (ref?: string) => (
    <div className={s.barre}>
      <Link href="/terrain" className={s.retour}>
        <Picto nom="retour" />
        Chantiers
      </Link>
      {ref && <span className={s.barreRef}>{ref}</span>}
    </div>
  );

  if (!(await peutOuvrir(p, id))) {
    return (
      <>
        {barre()}
        <main className={s.contenu}>
          <div className={s.vide}>
            <span className={s.videPicto}>
              <Picto nom="calendrier" taille={26} />
            </span>
            <b>Ce dossier n&apos;est pas au planning</b>
            <p>L&apos;outil n&apos;ouvre que les chantiers d&apos;hier, d&apos;aujourd&apos;hui et de demain.</p>
          </div>
        </main>
      </>
    );
  }

  const d = await dossierTerrain(id);
  if (!d) notFound();
  const photos = await photosDuDossier(id);

  // La ligne du planning la plus proche d'aujourd'hui dit l'étape du jour : départ pour un chargement, arrivée pour une livraison.
  const lignes = [...d.planning].sort((a, b) => Math.abs(a.decalage) - Math.abs(b.decalage) || b.decalage - a.decalage);
  const duJour = lignes[0];
  const departs = d.etapes.filter((e) => e.genre === "depart");
  const arrivees = d.etapes.filter((e) => e.genre === "arrivee");
  const ici: Etape | undefined = duJour?.genre === "livraison" ? arrivees[arrivees.length - 1] : departs[0];
  const adresse = ici?.adresse ?? null;
  const equipes = [...new Set(d.planning.map((l) => l.equipe).filter(Boolean))];
  const camions = [...new Set(d.planning.map((l) => l.immatriculation).filter(Boolean))];
  const consignes = [...new Set(d.planning.map((l) => l.instructions).filter(Boolean))];

  return (
    <>
      {barre(d.ref)}
      <main className={`${s.contenu} ${s.contenuDock}`}>
        <div className={s.tete}>
          <h1>{d.client}</h1>
          <div className={s.puces}>
            {lignes.length === 0 && <span className={s.genre}>Hors planning</span>}
            {[...d.planning]
              .sort((a, b) => a.decalage - b.decalage)
              .map((l) => (
                <span key={l.cle} className={`${s.genre} ${s[l.genre]}`}>
                  {GENRES[l.genre]} · {JOUR[l.decalage] ?? l.jour}
                </span>
              ))}
          </div>
        </div>

        <section className={s.bloc} aria-label="Adresse du jour">
          <p className={s.surtitre}>{duJour?.genre === "livraison" ? "Livraison" : "Chargement"} · adresse</p>
          <p className={s.adresse}>{adresse ?? "Adresse non renseignée au dossier"}</p>
          {ici && precisions(ici).length > 0 && (
            <div className={s.details}>
              {precisions(ici).map((x) => (
                <span key={x} className={s.detail}>
                  {x}
                </span>
              ))}
            </div>
          )}
          {adresse && (
            <a
              className={s.boutonContour}
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Picto nom="itineraire" taille={20} />
              Itinéraire
            </a>
          )}
          {d.etapes.length > 1 && (
            <ol className={s.etapes} aria-label="Étapes du trajet">
              {d.etapes.map((e) => (
                <li key={e.id} className={`${s.etape} ${e.id === ici?.id ? s.etapeIci : ""}`}>
                  <i />
                  <span>
                    <small>{ETAPE[e.genre] ?? "Étape"}</small>
                    {e.adresse ?? "—"}
                    {precisions(e).length > 0 && <span className={s.lignePale}> · {precisions(e).join(" · ")}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={`${s.bloc} ${s.grilleInfos}`} aria-label="Équipe et camion">
          <div className={s.info}>
            <span className={s.infoPicto}>
              <Picto nom="equipe" />
            </span>
            <span>
              <small>Équipe</small>
              <b>{equipes.length ? equipes.join(" / ") : "Non renseignée"}</b>
            </span>
          </div>
          {camions.length > 0 && (
            <div className={s.info}>
              <span className={s.infoPicto}>
                <Picto nom="camion" />
              </span>
              <span>
                <small>Camion</small>
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  {camions.map((c) => (
                    <span key={c} className={s.plaque}>
                      <span>{c}</span>
                    </span>
                  ))}
                </span>
              </span>
            </div>
          )}
          {d.volume > 0 && (
            <div className={s.info}>
              <span className={s.infoPicto}>
                <Picto nom="carton" />
              </span>
              <span>
                <small>Volume</small>
                <b>{m3(d.volume)}</b>
              </span>
            </div>
          )}
        </section>

        {consignes.length > 0 && (
          <section className={s.consignes} aria-label="Instructions du bureau">
            <p className={s.surtitre}>
              <Picto nom="info" taille={16} />
              Instructions du bureau
            </p>
            {consignes.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </section>
        )}

        <Capture
          dossierId={d.id}
          refDossier={d.ref}
          photosInitiales={photos}
          agentId={p.genre === "agent" ? p.agent.id : null}
          bureau={p.genre === "bureau"}
          auteur={p.nom}
          delaiRetraitMin={DELAI_RETRAIT_MIN}
        />
      </main>
    </>
  );
}
