import Link from "next/link";
import Bandeau, { Etapes } from "@/ui/Bandeau";
import MenuActions from "@/ui/MenuActions";
import { notFound } from "next/navigation";
import { getDossier } from "@/crm/lib/data";
import { q, type Row } from "@/crm/lib/db";
import { eur, m3, nomClient, STATUTS } from "@/crm/lib/format";
import * as A from "@/crm/actions";
import { litiges as getLitiges } from "@/crm/lib/data2";
import { etatsRdv } from "@/crm/rdv/sms";
import EnregistrerModele from "@/crm/creation/EnregistrerModele";
import { ficheDossier } from "@/crm/fiche/donnees";
import { construireFiche, visiteDuSousTitre } from "@/crm/fiche/sections";
import Fiche from "@/crm/fiche/Fiche";

export const dynamic = "force-dynamic";

/*
 * La fiche d'un dossier, sur le modèle de Créagidem en version moderne
 * (src/crm/fiche) : le bandeau commun en tête — nom, référence, téléphone,
 * trajet, étapes du dossier, Solde, Parcours, Fiche PDF, Créer un modèle, « ⋯ »
 * —, puis la barre de la fiche et ses sections repliables (Déménagements,
 * Garde-meubles, Services, Commun), chacune avec sa barre d'outils et ses
 * onglets.
 */

const STEPS = ["Fiche client", "Visite technique", "Devis", "Commande", "Lettres de voiture", "Facture"];
const STEP_OF: Record<string, number> = { prospect: 0, visite: 1, devis: 2, commande: 3, planifie: 4, termine: 5, perdu: 2 };

export default async function PageDossier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ espace?: string; m?: string; visite?: string; vm?: string; vc?: string; vd?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const d = await getDossier(id);
  if (!d) notFound();
  const [lit, etatsSms, users, data, espace, client] = await Promise.all([
    getLitiges(id),
    etatsRdv(d.rdvs.map((r: Row) => r.id)),
    q("select id,nom,role from utilisateurs order by id"),
    ficheDossier(d),
    // Un espace client ouvert : l'e-mail du client est son identifiant de connexion, il se modifie depuis l'espace.
    q("select 1 from public.ec_dossiers where crm_dossier_id=$1 limit 1", [id]).catch(() => []),
    q<{ telephone2: string | null }>("select telephone2 from clients where id=$1", [d.client_id]),
  ]);
  d.telephone2 = client[0]?.telephone2 ?? null;
  const step = STEP_OF[d.statut];
  // Le solde : ce que le client doit encore. Le plus grand du montant signé et du total facturé, moins les règlements.
  const montantSigne = d.devis.filter((v: Row) => v.statut === "signe").reduce((a: number, v: Row) => a + Number(v.montant ?? 0), 0);
  const facture = d.factures.reduce((a: number, f: Row) => a + Number(f.montant ?? 0), 0);
  const regle = d.paiements.reduce((a: number, x: Row) => a + Number(x.montant ?? 0), 0);
  const solde = Math.max(0, Math.max(montantSigne, facture) - regle);

  const visiteLe = visiteDuSousTitre(data.rdvs);

  const fiche = construireFiche({ d, data, utilisateurs: users, litiges: lit, etatsSms, espaceOuvert: espace.length > 0, sp, solde });

  return (
    <div className="view dossier">
      <Bandeau
        surtitre={`Dossier ${d.ref}`}
        titre={nomClient(d)}
        texte={[d.telephone, `${d.stops[0]?.adresse ?? "—"} → ${d.stops[d.stops.length - 1]?.adresse ?? "—"}`, visiteLe, m3(d.volume)].filter(Boolean).join(" · ")}
        // Le statut seul : sur une ligne, les pastilles ne rétrécissent pas et effaçaient le téléphone et le trajet.
        // Le segment est sur le repère du client, le type, le commercial et « traité par » en tête de la section
        // Déménagements, le véhicule dans la bande des observations.
        etiquettes={[STATUTS[d.statut].label]}
        bas={
          <Etapes
            label="Étapes du dossier"
            items={STEPS.map((l, i) => ({
              label: l,
              etat: d.statut === "perdu" ? "avenir" : i < step || d.statut === "termine" ? "fait" : i === step ? "encours" : "avenir",
            }))}
          />
        }
      >
        {/* Une ancre ordinaire : elle ouvre Commun › Règlements (Fiche.tsx suit le changement d'ancre). */}
        <a href="#commun-reglements" data-ton="contour" title="Ce que le client doit encore : montant signé (ou facturé), moins les règlements reçus">
          Solde {eur(solde)}
        </a>
        <Link href={`/parcours/${id}`} data-ton="contour">Parcours</Link>
        {/* Sans icône : avec un solde à quatre chiffres, les cinq boutons dépassaient les 560 px de la rangée et « ⋯ » passait à la ligne, rogné. */}
        <Link href={`/imprimer/${id}?doc=fiche`} data-ton="contour">Fiche PDF</Link>
        <EnregistrerModele dossier={{ id, ref: d.ref, type: d.type, type_demenagement: d.type_demenagement, volume: d.volume, vehicule: d.vehicule, garde_meuble: d.stops.some((x: Row) => x.genre === "garde_meuble"), observations: d.observations ?? null }} />
        {/* Les gestes secondaires, rangés dans « ⋯ » pour que les boutons tiennent sur deux lignes. */}
        <MenuActions>
          <form action={A.dupliquerDossier.bind(null, id)}><button>Dupliquer le dossier</button></form>
          {d.statut === "perdu"
            ? <form action={A.rouvrir.bind(null, id)}><button>Rouvrir le dossier</button></form>
            : d.statut !== "termine" && <form action={A.marquerPerdu.bind(null, id)}><button data-danger>Marquer perdu</button></form>}
        </MenuActions>
      </Bandeau>

      {d.statut === "perdu" && <div className="alert">Ce dossier est marqué perdu. Il reste consultable et peut être rouvert.</div>}

      <Fiche dossierId={id} {...fiche} />
    </div>
  );
}
