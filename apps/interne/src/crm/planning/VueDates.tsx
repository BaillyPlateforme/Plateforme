import { listRequests } from "@/lib/requests";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import MenuPlanning from "./Vues";
import DatesSouhaitees, { type Ev } from "./DatesSouhaitees";

/*
 * La vue « Dates souhaitées » du planning commercial (/planning?vue=dates) :
 * les demandes du site qui donnent une date de déménagement, sur un calendrier
 * au mois. Les données sont lues ici, côté serveur (l'ancienne page les
 * chargeait dans le navigateur).
 */
export default async function VueDates() {
  const demandes = await listRequests().catch(() => []);
  const events: Ev[] = demandes
    .filter((r) => r.date_souhaitee)
    .map((r) => ({
      id: r.id,
      date: r.date_souhaitee as string,
      client: r.client_nom ?? "—",
      trajet: `${r.depart_ville ?? "?"} → ${r.arrivee_ville ?? "?"}`,
      volume: r.volume_m3,
    }));

  return (
    <div className="view">
      <Bandeau
        surtitre="Dossiers · Planning"
        titre="Planning"
        texte="Dates souhaitées · les dates de déménagement demandées sur le site, au mois"
      />
      <AvecMenu menu={<MenuPlanning actif="dates" />}>
        <div className="vue-equipe">
          <DatesSouhaitees events={events} />
        </div>
      </AvecMenu>
    </div>
  );
}
