import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { nomClient, periode } from "@/lib/espace-client/format";
import { TEL_AGENCE } from "@/lib/messaging";
import { A_GARDER_AVEC_VOUS, CHECK_LIST, TEXTES_HUB } from "@/lib/espace-client/tutos-contenu";
import { Icone } from "../../../../_ui/Icone";
import { Logo } from "../../../../_ui/Logo";
import { chargerTutos } from "../charger";
import { Imprimer } from "./Imprimer";
import "../tutos.css";

export const metadata: Metadata = { title: "Check-list du déménagement" };

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * La check-list du déménagement, à imprimer : en tête, ce qui reste à faire
 * dans l'espace du client (la frise du dossier, déjà cochée quand c'est
 * fait) ; puis le calendrier des conseils de Bailly et les gestes des
 * tutoriels (tutos-contenu.ts, CHECK_LIST). À l'écran, une feuille posée sur
 * la page ; à l'impression, la feuille seule (tutos.css, @media print).
 */
export default async function CheckList({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ imprimer?: string }> }) {
  const { ref } = await params;
  const { imprimer } = await searchParams;
  const { e, tutos } = await chargerTutos(ref);
  const base = `/espace-client/${e.dossier.reference}`;
  const numero = new Map(tutos.map((t) => [t.slug, t.numero]));
  // Dans l'espace : les étapes de la frise que le client fait lui-même (pas la visite, ni le jour J).
  const espace = e.frise.filter((x) => !["visite", "realise", "prise_en_charge"].includes(x.cle));

  return (
    <main className="tx cl-page">
      <div className="cl-barre">
        <div className="wrap cl-barre-in">
          <Logo href={base} petit />
          <Link className="chip-glass" href={`${base}/tutos`}>
            <Icone nom="back" /> <span className="lbl">Mes tutos</span>
          </Link>
          <Imprimer auto={imprimer === "1"} />
        </div>
      </div>

      <article className="cl-feuille" aria-labelledby="cl-titre">
        <header className="cl-tete">
          <div>
            <p className="kicker">Bailly Déménagement · {e.dossier.reference}</p>
            <h1 id="cl-titre">{TEXTES_HUB.checkListTitre}</h1>
            <p className="cl-qui">
              {nomClient(e.client)} · {e.dossier.ville_depart} → {e.dossier.ville_arrivee} · {periode(e.dossier.periode_debut, e.dossier.periode_fin)}
            </p>
          </div>
          <Image className="cl-logo" src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={169} height={54} />
        </header>

        <section className="cl-bloc cl-espace">
          <h2>
            <span>{TEXTES_HUB.checkListEspace}</span>
            <small>état au {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}</small>
          </h2>
          <ul>
            {espace.map((x) => (
              <li key={x.cle} className={x.statut === "fait" ? "fait" : ""}>
                <span className="cl-case" aria-hidden>
                  {x.statut === "fait" && <Icone nom="check" />}
                </span>
                <span>
                  {x.titre}
                  {x.optionnelle && <em> · facultatif</em>}
                  <small>{x.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="cl-colonnes">
          {CHECK_LIST.map((g) => (
            <section key={g.titre} className="cl-bloc">
              <h2>
                <span>{g.titre}</span>
              </h2>
              <ul>
                {g.lignes.map((l) => (
                  <li key={l.texte}>
                    <span className="cl-case" aria-hidden />
                    <span>
                      {l.texte}
                      {l.tuto && numero.has(l.tuto) && <small className="cl-renvoi">Tuto {String(numero.get(l.tuto)).padStart(2, "0")}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="cl-garder">
          <b>{A_GARDER_AVEC_VOUS.titre}</b>
          <span>{capitale(A_GARDER_AVEC_VOUS.texte)}</span>
        </aside>

        <footer className="cl-pied">
          <span>
            Votre conseiller : {e.conseiller.prenom} {e.conseiller.nom} · {e.conseiller.telephone || TEL_AGENCE}
          </span>
          <span>{TEXTES_HUB.checkListPied}</span>
        </footer>
      </article>
    </main>
  );
}
