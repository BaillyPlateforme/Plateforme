import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import MenuActions from "@/ui/MenuActions";
import { notFound } from "next/navigation";
import { soldeDossier } from "@/crm/facturation/donnees";
import { getDossier } from "@/crm/lib/data";
import { q, q1, type Row } from "@/crm/lib/db";
import { avisDossierDuplique } from "@/crm/duplication/donnees";
import AvisDuplication from "@/crm/duplication/composants/AvisDuplication";
import FenetreDupliquerDossier from "@/crm/duplication/composants/DupliquerDossier";
import { Declencheur } from "@/crm/duplication/composants/Declencheur";
import { eur, m3, nomClient, STATUTS } from "@/crm/lib/format";
import * as A from "@/crm/actions";
import { litiges as getLitiges } from "@/crm/lib/data2";
import { etatsRdv } from "@/crm/rdv/sms";
import EnregistrerModele from "@/crm/creation/EnregistrerModele";
import { kilometresDuDossier, kmEnBref, portsDuTrajet } from "@/crm/creation/kilometres";
import { ficheDossier } from "@/crm/fiche/donnees";
import { entreprisesPro } from "@/crm/clients/entreprises";
import { construireFiche, maintenant, visiteDuSousTitre } from "@/crm/fiche/sections";
import Fiche from "@/crm/fiche/Fiche";
import { parcoursDossier } from "@/crm/parcours/donnees";
import { etapeDossier } from "@/crm/kanban/etapes";
import LigneParcours from "@/crm/parcours/LigneParcours";
import FilClient from "@/crm/discussion/FilClient";
import { estSuperAdmin } from "@/lib/droits";
import { espaceDuDossier } from "@/crm/lib/espace";
import { telLisible } from "@/crm/clients/telephones";
import LienStreetView from "@/ui/LienStreetView";
import { cimobDuDossier } from "@/crm/cimob/donnees";

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

export default async function PageDossier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ espace?: string; m?: string; visite?: string; vm?: string; vc?: string; vd?: string; duplique?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const d = await getDossier(id);
  if (!d) notFound();
  const [lit, etatsSms, users, data, espace, client, parcours, superAdmin, entreprises, sien, devisActifs, duplique] = await Promise.all([
    getLitiges(id),
    etatsRdv(d.rdvs.map((r: Row) => r.id)),
    q("select id,nom,role from utilisateurs order by id"),
    ficheDossier(d),
    // Un espace client ouvert : l'e-mail du client est son identifiant de connexion, il se modifie depuis l'espace.
    q<{ id: string }>("select id from public.ec_dossiers where crm_dossier_id=$1 order by created_at desc limit 1", [id]).catch(() => []),
    q<{ telephone2: string | null; espace_pro_id: string | null; telephone_libelle: string | null; telephone2_libelle: string | null; telephones_autres: unknown; matricule: string | null; situation_famille: string | null }>(
      "select telephone2, espace_pro_id, telephone_libelle, telephone2_libelle, telephones_autres, matricule, situation_famille from clients where id=$1",
      [d.client_id],
    ),
    // Le parcours n'empêche jamais la fiche de s'ouvrir : sans lui, la fiche reste entière.
    parcoursDossier(id).catch((e) => {
      console.error("Dossier : lecture du parcours impossible", e instanceof Error ? e.message : e);
      return null;
    }),
    // « Modifier son espace » n'apparaît qu'aux super admins ; la route le revérifie de toute façon.
    estSuperAdmin().catch(() => false),
    // Les entreprises (espaces pro) de la fenêtre « Fiche » : sans elles, la fenêtre s'ouvre sans le champ.
    entreprisesPro().catch(() => []),
    // Un client, un espace : l'espace que son client a déjà, quand ce dossier n'y est pas encore.
    espaceDuDossier(id),
    // « Dupliquer à l'identique » propose de reprendre ses devis : ceux qui sont encore dans la proposition.
    q1<{ n: number }>("select count(*)::int as n from devis where dossier_id=$1 and retire_le is null", [id]),
    // Le dossier vient d'être dupliqué (?duplique=<origine>) : son bandeau dit d'où il vient et ce qui a été repris.
    sp.duplique && /^\d+$/.test(sp.duplique) ? avisDossierDuplique(id, Number(sp.duplique)) : Promise.resolve(null),
  ]);
  const aAjouter = !!sien && !sien.dedans;
  d.telephone2 = client[0]?.telephone2 ?? null;
  d.espace_pro_id = client[0]?.espace_pro_id ?? null;
  // Les téléphones et ce que chacun désigne (retours de Céline, 16/11/2026) : la fenêtre « Fiche », les contacts.
  d.telephone_libelle = client[0]?.telephone_libelle ?? null;
  d.telephone2_libelle = client[0]?.telephone2_libelle ?? null;
  d.telephones_autres = client[0]?.telephones_autres ?? [];
  // CIMOB/DICOM (Céline, 17/11/2026) : matricule, situation de famille, repli et véhicules.
  d.matricule = client[0]?.matricule ?? null;
  d.situation_famille = client[0]?.situation_famille ?? null;
  const cimob = d.type === "militaire" ? await cimobDuDossier(id) : null;
  // Le solde : ce que le client doit encore, calculé par la facturation (vue crm.dossiers_soldes).
  const solde = Math.max(0, (await soldeDossier(id)).reste);

  const instant = maintenant();
  const visiteLe = visiteDuSousTitre(data.rdvs, instant);
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date());
  const vuLe = parcours?.espace?.derniereConnexion
    ? `vu par le client le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(parcours.espace.derniereConnexion))}`
    : "jamais consulté par le client";

  const fiche = construireFiche({ d, data, utilisateurs: users, litiges: lit, etatsSms, espaceOuvert: espace.length > 0, aAjouter, entreprises, sp, solde, maintenant: instant, cimob });

  return (
    <div className="view dossier">
      <Bandeau
        surtitre={`Dossier ${d.ref}`}
        titre={nomClient(d)}
        titreHref={`/clients/${d.client_id}`}
        // Le téléphone par paires ; à côté de chaque adresse, Street View (Céline, 16/11/2026) ; les droits d'un CIMOB/DICOM
        // avant le volume réel, que seule l'équipe voit.
        texte={
          <>
            {/* CIMOB/DICOM (Céline, 17/11/2026 : « deux volumes… visibles facilement ») : les droits et le réel en tête de
                ligne, avant que le trajet ne la fasse tronquer ; le détail est dans les cases sous la barre de la fiche. */}
            {d.type === "militaire" ? `Droits ${d.volume_droits != null ? m3(Number(d.volume_droits)) : "à saisir"} · réel ${m3(d.volume)} · ` : null}
            {d.telephone ? `${telLisible(d.telephone)} · ` : null}
            {d.stops[0]?.adresse ?? "—"}
            <LienStreetView adresse={d.stops[0]?.adresse} ton="bandeau" court />
            {" → "}
            {d.stops[d.stops.length - 1]?.adresse ?? "—"}
            {d.stops.length > 1 && <LienStreetView adresse={d.stops[d.stops.length - 1]?.adresse} ton="bandeau" court />}
            {/* Les km : par la mer (Céline, 18/11/2026), la route et la mer côte à côte, jamais additionnées. */}
            {[periodeDuSousTitre(d), visiteLe, d.type === "militaire" ? null : d.volume_droits != null ? `Droits ${m3(Number(d.volume_droits))}` : null, d.type === "militaire" ? null : d.volume_droits != null ? `réel ${m3(d.volume)}` : m3(d.volume), ...kmEnBref(kilometresDuDossier(d), portsDuTrajet(d.stops))]
              .filter(Boolean)
              .map((x) => ` · ${x}`)}
          </>
        }
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
        ) : aAjouter ? (
          <a href="#commun-espace" data-ton="contour" title={`Son espace client existe (${sien!.references.length} dossier${sien!.references.length > 1 ? "s" : ""}) : ce dossier n'y est pas encore`}>Ajouter à son espace</a>
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
          {/* Dupliquer : à l'identique (même client, une fenêtre dit ce qui suit) ou pour un nouveau client (l'écran de création, prérempli). */}
          <Declencheur fenetre="dupliquer-dossier" titre="Un nouveau dossier pour le même client : trajet, inventaire, options, services">
            Dupliquer à l’identique…
          </Declencheur>
          <Link href={`/dossiers/nouveau?depuis=${id}`} prefetch={false} title="L'écran de création, prérempli : vous choisissez ce qui est repris">
            Dupliquer pour un nouveau client…
          </Link>
          {d.statut === "perdu"
            ? <form action={A.rouvrir.bind(null, id)}><button>Rouvrir le dossier</button></form>
            : d.statut !== "termine" && <form action={A.marquerPerdu.bind(null, id)}><button data-danger>Marquer perdu</button></form>}
        </MenuActions>
        {/* Hors du menu, qui se démonte après un choix : la fenêtre attend son appel. */}
        <FenetreDupliquerDossier
          dossier={{ id, ref: d.ref, client: nomClient(d), clientId: d.client_id, etapes: d.stops.length, objets: d.inv.length, services: data.services.filter((x) => x.statut !== "annule").length, devis: devisActifs?.n ?? 0 }}
        />
      </Bandeau>

      {parcours && (
        <LigneParcours
          prochaine={parcours.prochaine}
          // La colonne du Tableau où il se trouve : le même nom, la même couleur (src/crm/kanban/etapes.ts) ; un clic l'y montre.
          colonne={{ label: etapeDossier(d.statut).label, teinte: etapeDossier(d.statut).teinte, href: `/parcours?${new URLSearchParams({ q: d.ref })}` }}
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

      {duplique && (
        <AvisDuplication
          titre={`Dossier dupliqué depuis ${duplique.ref}`}
          texte={majuscule(duplique.libelle.replace(/^Dossier dupliqué depuis \S+ /, ""))}
          alerte={
            duplique.libelle.includes("à l'identique")
              ? "Les devis repris sont des brouillons, pas envoyés. La période est celle d'origine : ajustez-la, puis posez les dates de ce déménagement."
              : "Vérifiez ce qui a été repris : l'adresse et les accès d'un autre foyer ne suivent que si vous les avez cochés."
          }
          lien={duplique.lien}
          libelleLien={`Voir ${duplique.ref}`}
        />
      )}

      {d.statut === "perdu" && <div className="alert">Ce dossier est marqué perdu. Il reste consultable et peut être rouvert.</div>}

      {/* La discussion avec le client, quand il a un espace : repliée, ouverte d'elle-même s'il a écrit sans réponse. */}
      {espace[0] && <FilClient dossierId={espace[0].id} client={nomClient(d)} liens={[{ href: `/clients/${d.client_id}`, libelle: "Fiche client" }]} />}

      <Fiche dossierId={id} {...fiche} />
    </div>
  );
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** La période dans le sous-titre (la date n'y figurait pas, David 08/11/2026) : la date de chargement, sinon le souhait du client, sinon le mois prévu. */
function periodeDuSousTitre(d: Record<string, unknown>): string | null {
  const jour = (v: unknown) => new Date(`${(v instanceof Date ? v.toISOString() : String(v)).slice(0, 10)}T12:00:00`);
  const periode = typeof d.periode === "string" ? d.periode.trim() : "";
  if (d.date_chargement) return `Chargement le ${jour(d.date_chargement).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  if (periode) return periode;
  if (d.mois_ca) return jour(d.mois_ca).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return null;
}
