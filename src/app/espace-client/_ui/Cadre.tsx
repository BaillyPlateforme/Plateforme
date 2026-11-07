import Link from "next/link";
import type { Espace } from "@/lib/espace-client/espace";
import { estDemo } from "@/lib/espace-client/config";
import { LiensBas } from "./Hero";
import { Icone } from "./Icone";
import { Logo } from "./Logo";

/** La carte du conseiller, en bas de la page de garde. */
export function CarteConseiller({ e }: { e: Espace }) {
  const c = e.conseiller;
  const initiales = `${c.prenom[0] ?? ""}${c.nom[0] ?? ""}`.toUpperCase();
  return (
    <div className="advisor apparait">
      <span className="av">{initiales}</span>
      <div>
        <h4>
          {c.prenom} {c.nom}, votre contact Bailly
        </h4>
        <p>Ligne directe · {c.telephone}</p>
      </div>
      <div className="acts">
        <a className="btn btn-ghost btn-sm" href={`tel:${c.telephone.replace(/\s/g, "")}`}>
          <Icone nom="phone" /> Appeler
        </a>
        <Link className="btn btn-dark btn-sm" href={`/espace-client/${e.dossier.reference}/conseiller`}>
          <Icone nom="mail" /> Écrire
        </Link>
      </div>
    </div>
  );
}

/** Le pied de page de la micro démo : logo, liens à puces, dossier. */
export function PiedDePage({ e }: { e: Espace }) {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="top">
          <Logo href={`/espace-client/${e.dossier.reference}`} />
          <LiensBas e={e} />
        </div>
        <div className="base">
          <span>
            Dossier : {e.dossier.reference} · {e.dossier.ville_depart} → {e.dossier.ville_arrivee}
          </span>
          {estDemo() ? <span className="demo-ribbon">Démonstration · données fictives</span> : <span>Bailly Déménagement</span>}
        </div>
      </div>
    </footer>
  );
}

/** Un titre de chapitre numéroté : « 01 ─── Pièces à fournir ». */
export function TitreChapitre({ n, children, id }: { n: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="rule-title apparait" id={id}>
      <span className="n">{n}</span>
      <h2>{children}</h2>
    </div>
  );
}

/** La preuve d'horodatage, verte, sous un engagement validé. */
export function Preuve({ titre, quand, version, ip, ua }: { titre: string; quand: string; version: string; ip: string; ua: string }) {
  return (
    <div className="proof">
      <strong>
        <Icone nom="check" style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 6 }} />
        {titre}
      </strong>
      <span>
        {quand} · texte {version}
      </span>
      <code>
        IP {ip} · {ua.slice(0, 110)}
      </code>
    </div>
  );
}
