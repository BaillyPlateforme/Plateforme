import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import MenuActions from "@/ui/MenuActions";
import { notFound } from "next/navigation";
import { soldeDossier } from "@/crm/facturation/donnees";
import { getDossier } from "@/crm/lib/data";
import { q, type Row } from "@/crm/lib/db";
import { eur, m3, nomClient, STATUTS } from "@/crm/lib/format";
import * as A from "@/crm/actions";
import { litiges as getLitiges } from "@/crm/lib/data2";
import { etatsRdv } from "@/crm/rdv/sms";
import EnregistrerModele from "@/crm/creation/EnregistrerModele";
import { ficheDossier } from "@/crm/fiche/donnees";
import { construireFiche, maintenant, visiteDuSousTitre } from "@/crm/fiche/sections";
import Fiche from "@/crm/fiche/Fiche";
import { parcoursDossier } from "@/crm/parcours/donnees";
import LigneParcours from "@/crm/parcours/LigneParcours";
import { estSuperAdmin } from "@/lib/droits";

export const dynamic = "force-dynamic";

/*
 * La page d'un dossier, une seule (simplification du 08/11/2026, choix de
 * David) : le bandeau commun en tête — nom, référence, téléphone, trajet,
 * statut, Solde, Voir son espace, Créer un modèle, « ⋯ » —, puis, à cheval sur
 * la bande, son parcours de A à Z (src/crm/parcours/LigneParcours : les
 * étapes de la demande à l'avis, quelques faits, la chronologie), et dessous
 * la fiche façon Créagidem (src/crm/fiche) : sa barre et ses sections
 * repliables (Déménagements, Garde-meubles, Services, Commun).
 *
 * L'ancienne page du parcours (/parcours/<id>) y mène. Les étapes ne sont
 * plus répétées dans la bande, ni le statut ailleurs que dans sa pastille.
 */

export default async function PageDossier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ espace?: string; m?: string; visite?: string; vm?: string; vc?: string; vd?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const d = await getDossier(id);
  if (!d) notFound();
  const [lit, etatsSms, users, data, espace, client, parcours, superAdmin] = await Promise.all([
    getLitiges(id),
    etatsRdv(d.rdvs.map((r: Row) => r.id)),
    q("select id,nom,role from utilisateurs order by id"),
    ficheDossier(d),
    // Un espace client ouvert : l'e-mail du client est son identifiant de connexion, il se modifie depuis l'espace.
    q<{ id: string }>("select id from public.ec_dossiers where crm_dossier_id=$1 order by created_at desc limit 1", [id]).catch(() => []),
    q<{ telephone2: string | null }>("select telephone2 from clients where id=$1", [d.client_id]),
    // Le parcours n'empêche jamais la fiche de s'ouvrir : sans lui, la fiche reste entière.
    parcoursDossier(id).catch((e) => {
      console.error("Dossier : lecture du parcours impossible", e instanceof Error ? e.message : e);
      return null;
    }),
    // « Modifier son espace » n'apparaît qu'aux super admins ; la route le revérifie de toute façon.
    estSuperAdmin().catch(() => false),
  ]);
  d.telephone2 = client[0]?.telephone2 ?? null;
  // Le solde : ce que le client doit encore, calculé par la facturation (vue crm.dossiers_soldes).
  const solde = Math.max(0, (await soldeDossier(id)).reste);

  const instant = maintenant();
  const visiteLe = visiteDuSousTitre(data.rdvs, instant);
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date());
  const vuLe = parcours?.espace?.derniereConnexion
    ? `vu par le client le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(parcours.espace.derniereConnexion))}`
    : "jamais consulté par le client";

  const fiche = construireFiche({ d, data, utilisateurs: users, litiges: lit, etatsSms, espaceOuvert: espace.length > 0, sp, solde, maintenant: instant });

  return (
    <div className="view dossier">
      <Bandeau
        surtitre={`Dossier ${d.ref}`}
        titre={nomClient(d)}
        texte={[d.telephone, `${d.stops[0]?.adresse ?? "—"} → ${d.stops[d.stops.length - 1]?.adresse ?? "—"}`, visiteLe, m3(d.volume)].filter(Boolean).join(" · ")}
        // Le statut seul : sur une ligne, les pastilles ne rétrécissent pas et effaçaient le téléphone et le trajet.
        // Le segment est sur le repère du client, le type, le commercial et « traité par » en tête de la section
        // Déménagements, le véhicule dans la bande des observations. Les étapes : le parcours, juste dessous.
        etiquettes={[STATUTS[d.statut].label]}
      >
        {/* Une ancre ordinaire : elle ouvre Déménagements › Facturation (Fiche.tsx suit le changement d'ancre). */}
        <a href="#facturation" data-ton="contour" title="Ce que le client doit encore : montant signé (ou facturé), moins les règlements reçus">
          Solde {eur(solde)}
        </a>
        {/* L'espace du client tel qu'il le voit, en lecture seule, dans un nouvel onglet (route /espace-client-apercu :
            elle note l'ouverture au fil d'activité). Un <a> et non un <Link> : jamais de préchargement. Le suivi de
            l'espace par l'équipe est dans « ⋯ ». Sans espace, l'onglet de la fiche qui l'ouvre. */}
        {espace[0] ? (
          <a href={`/espace-client-apercu/${espace[0].id}`} target="_blank" rel="noopener" data-ton="contour" title={`L'espace client tel que le client le voit, en lecture seule (nouvel onglet) · ${vuLe}`}>
            Voir son espace
          </a>
        ) : (
          <a href="#commun-espace" data-ton="contour" title="Ce dossier n'a pas encore d'espace client : l'onglet de la fiche permet de l'ouvrir">Ouvrir l’espace client</a>
        )}
        <EnregistrerModele dossier={{ id, ref: d.ref, type: d.type, type_demenagement: d.type_demenagement, volume: d.volume, vehicule: d.vehicule, garde_meuble: d.stops.some((x: Row) => x.genre === "garde_meuble"), observations: d.observations ?? null }} />
        {/* Les gestes secondaires, rangés dans « ⋯ » pour que les boutons tiennent sur deux lignes. */}
        <MenuActions>
          {espace[0] && superAdmin && (
            // L'espace en édition, au nom du client (super admin) : un <a>, jamais de préchargement.
            <a href={`/espace-client-apercu/${espace[0].id}?mode=edition`} target="_blank" rel="noopener" title="Modifier l'espace au nom du client : chaque geste est noté à votre nom (nouvel onglet)">
              Modifier son espace
            </a>
          )}
          {espace[0] && <Link href={`/dashboard/espace-client/dossiers/${espace[0].id}`}>Suivi de l’espace (équipe)</Link>}
          <Link href={`/imprimer/${id}?doc=fiche`}>Fiche PDF</Link>
          <form action={A.dupliquerDossier.bind(null, id)}><button>Dupliquer le dossier</button></form>
          {d.statut === "perdu"
            ? <form action={A.rouvrir.bind(null, id)}><button>Rouvrir le dossier</button></form>
            : d.statut !== "termine" && <form action={A.marquerPerdu.bind(null, id)}><button data-danger>Marquer perdu</button></form>}
        </MenuActions>
      </Bandeau>

      {parcours && (
        <LigneParcours
          etapes={parcours.etapes}
          perdu={d.statut === "perdu"}
          evenements={parcours.evenements}
          aujourdhui={aujourdhui}
          faits={{
            signe: parcours.signe,
            paye: parcours.argent.encaisse,
            facture: parcours.argent.facture,
            prochainRdv: parcours.prochainRdv ? { debut: parcours.prochainRdv.debut, commercial: parcours.prochainRdv.commercial } : null,
            demande: parcours.demande,
          }}
        />
      )}

      {d.statut === "perdu" && <div className="alert">Ce dossier est marqué perdu. Il reste consultable et peut être rouvert.</div>}

      <Fiche dossierId={id} {...fiche} />
    </div>
  );
}
