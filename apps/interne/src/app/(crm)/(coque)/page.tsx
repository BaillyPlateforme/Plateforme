import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import { currentUser } from "@/crm/lib/auth";
import { Ic } from "@/crm/lib/icons";

const TILES: [string, string, string, string, string, boolean][] = [
  ["pen", "Nouveau dossier", "Fiche client en 30 s", "/dossiers/nouveau", "a", true],
  ["cal", "Planifier une visite", "Physique ou visio", "/planning/nouveau", "b", true],
  ["doc", "Créer un devis", "3 formules en un clic", "/visites", "c", true],
  ["truck", "Lettre de voiture", "Par rupture de charge", "/commandes", "d", true],
  ["ship", "Suivre un conteneur", "Photos & plombs", "/bientot/conteneurs", "e", false],
  ["mic", "Visite à la voix", "Inventaire dicté", "/bientot/visite-vocale", "f", false],
];

export default async function Accueil() {
  const u = await currentUser();
  return (
    <div className="view accueil">
      <Bandeau
        surtitre={new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}
        titre={`Bonjour ${u.nom.split(" ")[0]}`}
        texte="Créez un dossier, planifiez une visite ou générez un devis : tout est relié, sans ressaisie."
      />
      <div className="tiles chevauche">
        {TILES.map(([i, t, s, h, c, on]) => (
          <Link key={t} href={h} className={on ? "tile" : "tile bientot"}>
            <i className={`ti ${c}`}><Ic n={i} /></i><b>{t}</b><small>{on ? s : `${s} · bientôt`}</small>
          </Link>
        ))}
      </div>
      <form action="/dossiers" className="ask">
        <i><Ic n="search" /></i>
        <input name="q" placeholder="Retrouvez un dossier : nom du client, société, référence BD-2026-…" />
        <button className="send" aria-label="Rechercher"><Ic n="right" /></button>
      </form>
    </div>
  );
}
