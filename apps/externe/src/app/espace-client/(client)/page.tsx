import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { dateLongue, joursRestants, periodeCompacte } from "@/lib/espace-client/format";
import { dossiersDuClient } from "@/lib/espace-client/lectures";
import { photoDe } from "@/lib/espace-client/photos";
import { clientConnecte, lireDonneesClient } from "@/lib/espace-client/session";
import { Icone } from "../_ui/Icone";
import { Logo } from "../_ui/Logo";

export const metadata: Metadata = { title: "Mes dossiers" };

/**
 * L'entrée de l'espace : sans session, la connexion ; avec un seul dossier,
 * sa page de garde ; avec plusieurs, le sélecteur de la micro démo — un
 * client qui déménage deux fois a deux dossiers.
 */
export default async function MesDossiers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await clientConnecte();
  if (!client) redirect("/espace-client/connexion");
  const sp = await searchParams;
  const dossiers = dossiersDuClient(await lireDonneesClient(), client.id);
  const ok = typeof sp.ok === "string" ? `?ok=${sp.ok}` : "";
  if (dossiers.length === 1 && !sp.choisir) redirect(`/espace-client/${dossiers[0].reference}${ok}`);

  return (
    <div className="ecran-nuit">
      <div className="sel-top">
        <Logo href="/espace-client?choisir=1" />
        {/* Un lien simple, pas <Link> : un préchargement ne doit jamais déconnecter. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="chip-glass" href="/espace-client/deconnexion">
          <Icone nom="logout" />
          <span className="lbl">Déconnexion</span>
        </a>
      </div>
      <div className="sel-head">
        <p className="kicker rise">Mes dossiers</p>
        <h1 className="display rise" style={{ "--i": 1 } as CSSProperties}>
          Bonjour {client.prenom}
        </h1>
        <p className="rise" style={{ "--i": 2 } as CSSProperties}>
          {dossiers.length > 1
            ? `Vous avez déménagé ${dossiers.length} fois avec Bailly. Quel dossier souhaitez-vous ouvrir ?`
            : dossiers.length === 1
              ? "Votre dossier vous attend."
              : "Votre dossier est en cours de création : votre conseiller vous prévient dès qu'il est prêt."}
        </p>
      </div>
      <div className="folders" style={{ "--n": Math.min(Math.max(dossiers.length, 1), 3) } as CSSProperties}>
        {dossiers.map((d, n) => {
          const fini = d.statut === "termine";
          const photo = photoDe(d.photo);
          const j = joursRestants(d.periode_debut);
          return (
            <Link
              key={d.id}
              className={`folder rise${fini ? " old" : ""}`}
              href={`/espace-client/${d.reference}`}
              style={{ "--i": 3 + n, "--img": `url('${photo.chemin}')`, "--pos": photo.position } as CSSProperties}
            >
              <div className="top">
                <span className="ref">Dossier {d.reference}</span>
                <span className={`gbadge${fini ? "" : " live"}`}>{fini ? "Terminé" : "En cours"}</span>
              </div>
              <div>
                <h2>
                  <span>{d.ville_depart} →</span>
                  {d.ville_arrivee}
                </h2>
                <div className="meta">
                  <p>
                    {fini ? `Réalisé le ${dateLongue(d.termine_le ?? d.periode_fin)}` : periodeCompacte(d.periode_debut, d.periode_fin).replace(/^du/, "Du")}
                    <br />
                    {d.volume_m3} m³{d.logement ? ` · ${d.logement}` : ""}
                  </p>
                  {!fini && j > 0 && (
                    <span className="j">
                      <sup>J−</sup>
                      {j}
                    </span>
                  )}
                </div>
                <span className="open">
                  Ouvrir ce dossier <Icone nom="arrow" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="sel-foot">Bailly Déménagement · espace client</p>
    </div>
  );
}
