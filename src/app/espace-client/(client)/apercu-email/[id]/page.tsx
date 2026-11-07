import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adressePublique, estDemo } from "@/lib/espace-client/config";
import { lireDonnees } from "@/lib/espace-client/depot";
import { rendreEmail } from "@/lib/espace-client/emails";
import { dateHeure } from "@/lib/espace-client/format";
import { estProfilDemo } from "@/lib/espace-client/seed";
import { Icone } from "../../../_ui/Icone";

export const metadata: Metadata = { title: "E-mail reçu (démonstration)", referrer: "no-referrer" };

/**
 * La boîte de réception de la démonstration : l'e-mail tel que le client le
 * reçoit, dans le décor de la micro démo (index.html). Hors démonstration,
 * cette page n'existe pas : un vrai e-mail ne se consulte que dans la boîte
 * de son destinataire.
 */
export default async function ApercuEmail({ params }: { params: Promise<{ id: string }> }) {
  if (!estDemo()) notFound();
  const { id } = await params;
  // Seuls les e-mails des profils fictifs se lisent ici : pas ceux d'un client créé par l'équipe.
  const n = (await lireDonnees()).notifications.find((x) => x.id === id && x.canal === "email" && estProfilDemo(x.destinataire));
  if (!n) notFound();
  const { sujet, html } = rendreEmail(n.modele, n.payload, await adressePublique());
  // Les liens de l'e-mail s'ouvrent dans la fenêtre principale, comme depuis une messagerie.
  const document = html.replace("<head>", '<head><base target="_top">');
  const lien = typeof n.payload.lien === "string" ? n.payload.lien : null;

  return (
    <div className="stage">
      <div className="stage-head">
        <div>
          <p className="kicker">Démonstration · boîte de réception</p>
          <h1>L&apos;e-mail reçu par le client</h1>
        </div>
        {lien ? (
          <a className="skip" href={lien}>
            Suivre le lien de l&apos;e-mail <Icone nom="arrow" />
          </a>
        ) : (
          <Link className="skip" href="/espace-client">
            Aller à l&apos;espace client <Icone nom="arrow" />
          </Link>
        )}
      </div>

      <div className="client-mail">
        <aside className="inbox" aria-hidden="true">
          <div className="inbox-top">
            <i />
            <i />
            <i />
          </div>
          <h2>Boîte de réception</h2>
          <div className="mail-item sel">
            <b>
              Bailly Déménagement <span>{dateHeure(n.sent_at).split(" à ")[1]}</span>
            </b>
            <p>{sujet}</p>
          </div>
          <div className="mail-item">
            <b>
              Agence immobilière <span>Hier</span>
            </b>
            <p>État des lieux d&apos;entrée</p>
          </div>
          <div className="mail-item">
            <b>
              Fournisseur d&apos;énergie <span>Mar.</span>
            </b>
            <p>Votre demande de mise en service</p>
          </div>
          <div className="mail-item">
            <b>
              La Poste <span>Lun.</span>
            </b>
            <p>Confirmation de votre réexpédition du courrier</p>
          </div>
        </aside>

        <div className="reader">
          <div className="reader-head">
            <h3>{sujet}</h3>
            <div className="from">
              <span className="av">B</span>
              <div>
                <b>Bailly Déménagement</b>
                <small>À : {n.destinataire}</small>
              </div>
              <time>{dateHeure(n.sent_at)}</time>
            </div>
            <span className="no-attach">
              <Icone nom="check" />
              Aucune pièce jointe
            </span>
          </div>
          <div className="mail-canvas">
            <iframe title="Contenu de l'e-mail" srcDoc={document} sandbox="allow-top-navigation-by-user-activation allow-popups" />
          </div>
        </div>
      </div>

      <div className="annot">
        <div>
          <b>Pas de pièce jointe</b>Un message court et lisible, sur le modèle de l&apos;e-mail de devis de voyage.
        </div>
        <div>
          <b>Lien magique</b>Connexion sans mot de passe, à usage unique et valable quinze minutes.
        </div>
        <div>
          <b>Rien n&apos;est parti</b>En démonstration, les e-mails sont journalisés, pas envoyés : l&apos;équipe les retrouve dans le journal.
        </div>
      </div>
    </div>
  );
}
