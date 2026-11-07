import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Bandeau, { Etapes } from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { currentUser } from "@/crm/lib/auth";
import { eur, m3, nomClient, TYPES } from "@/crm/lib/format";
import { ville } from "@/crm/kanban/regles";
import { parcoursDossier } from "@/crm/parcours/donnees";
import { groupesDu, resume } from "@/crm/parcours/etapes";
import Frise from "@/crm/parcours/Frise";
import DefileEtapes from "@/crm/parcours/DefileEtapes";
import { CarteArgent, CarteClient, CarteDocuments, CarteEquipe, CarteEtapes, CarteTrajet } from "@/crm/parcours/Cartes";
import s from "@/crm/parcours/parcours.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Parcours d'un dossier" };

/*
 * Le parcours d'un dossier, « tout visible en un » : dans la bande, le client,
 * ses caractéristiques et les étapes de la demande à l'avis ; dessous, à
 * gauche les treize étapes une à une puis la frise de tout ce qui s'est passé
 * (site, CRM, devis, argent, exploitation, espace client), à droite les
 * cartes du dossier. Lecture seule : on agit depuis la fiche, le planning,
 * l'espace client.
 */
export default async function ParcoursDossier({ params }: { params: Promise<{ id: string }> }) {
  await currentUser();
  const id = Number((await params).id);
  const p = await parcoursDossier(id);
  if (!p) notFound();
  const d = p.d;
  const depart = p.stops.find((x) => x.genre === "depart")?.adresse;
  const arrivee = [...p.stops].reverse().find((x) => x.genre === "arrivee")?.adresse;
  const trajet = depart || arrivee ? `${ville(depart) ?? "?"} → ${ville(arrivee) ?? "?"}` : null;
  const r = resume(p.etapes);
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date());

  return (
    <div className="view">
      <Bandeau
        surtitre={`Parcours · Dossier ${d.ref}`}
        titre={nomClient(d) || "Sans nom"}
        texte={
          d.statut === "perdu" ? (
            <>
              Dossier <b>perdu</b>
            </>
          ) : p.etapes.some((e) => e.etat === "encours") ? (
            <>
              En cours : <b>{r.etape}</b>
            </>
          ) : (
            <b>Parcours complet</b>
          )
        }
        etiquettes={[
          d.ref,
          TYPES[d.type] ?? d.type,
          trajet,
          d.volume > 0 && m3(d.volume),
          d.commercial ? `Commercial · ${d.commercial}` : "Sans commercial",
          p.signe && `Signé · ${eur(p.signe.montant)}`,
        ]}
        bas={
          <DefileEtapes>
            <Etapes label="Parcours du dossier, de la demande à l'avis" items={groupesDu(p.etapes)} />
          </DefileEtapes>
        }
      >
        <Link href={`/dossiers/${id}`} data-ton="plein">
          <Icone nom="dossierClient" taille={17} />
          Fiche du dossier
        </Link>
        <Link href="/kanban" data-ton="contour">
          Kanban
        </Link>
        <Link href="/parcours" data-ton="contour">
          Autre dossier
        </Link>
      </Bandeau>

      <div className={s.grille}>
        <div className={s.principal}>
          <CarteEtapes etapes={p.etapes} />
          <Frise evenements={p.evenements} aujourdhui={aujourdhui} />
        </div>
        <aside className={s.cote} aria-label="Caractéristiques du dossier">
          <CarteClient p={p} />
          <CarteTrajet p={p} />
          <CarteEquipe p={p} />
          <CarteArgent p={p} />
          <CarteDocuments p={p} />
        </aside>
      </div>
    </div>
  );
}
