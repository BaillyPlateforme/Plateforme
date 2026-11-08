import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import { formules } from "@/crm/lib/tarif";
import { m3, nomClient } from "@/crm/lib/format";
import { versInterne } from "@/lib/adresses";
import Bandeau from "@/ui/Bandeau";
import { chargerDevis } from "@/crm/devis/donnees";
import { effectifs } from "@/crm/devis/parametres";
import { nomDevis } from "@/crm/devis/modele";
import EditeurDevis, { CLES_ONGLETS, type Onglet } from "@/crm/devis/composants/EditeurDevis";

export const dynamic = "force-dynamic";

/*
 * La fenêtre Devis (audit Créagidem, section I) : le bandeau commun, puis
 * l'éditeur — onglets dans le menu vertical, saisie en ligne, récapitulatif,
 * enregistrement d'un geste. Les devis d'avant s'y ouvrent tels quels.
 */

const STATUT: Record<string, string> = { brouillon: "Brouillon", envoye: "Envoyé", signe: "Signé", refuse: "Non retenu" };

export default async function DevisPage({ params, searchParams }: { params: Promise<{ id: string; devisId: string }>; searchParams: Promise<{ onglet?: string; ok?: string; erreur?: string }> }) {
  await currentUser();
  const { id, devisId } = await params;
  const sp = await searchParams;
  const c = await chargerDevis(Number(devisId));
  if (!c || String(c.dossier.id) !== id) notFound();
  const onglet: Onglet = CLES_ONGLETS.includes(sp.onglet as Onglet) ? (sp.onglet as Onglet) : "chiffrage";
  const eff = effectifs(c.parametres);
  const client = nomClient(c.dossier.client);
  const depart = c.etat.etapes.find((e) => e.genre === "depart"), arrivee = [...c.etat.etapes].reverse().find((e) => e.genre === "arrivee");
  const trajet = [depart?.ville || depart?.adresse, arrivee?.ville || arrivee?.adresse].filter(Boolean).join(" → ");
  const nom = nomDevis({ formule: c.etat.contrat.formule, titre: c.etat.contrat.titre, categorie_specifique: c.etat.contrat.categorieSpecifique, categorie_libelle: c.etat.contrat.categorieLibelle });

  return (
    <div className="view">
      <Bandeau
        surtitre={`Dossier ${c.dossier.ref} · ${client}`}
        titre={`Devis ${c.v.numero}`}
        texte={[trajet, m3(c.dossier.volume)].filter(Boolean).join(" · ")}
        etiquettes={[nom, c.etat.chiffrage.mode === "forfait" ? "Forfait" : "5 postes", c.v.retire_le ? "Retiré" : STATUT[c.v.statut]]}
        secondaire={{ label: "Fiche du dossier", href: `/dossiers/${c.dossier.id}` }}
      >
        <Link href={`/imprimer/${c.dossier.id}?doc=devis&v=${c.v.id}`} target="_blank" data-ton="contour">Aperçu PDF</Link>
      </Bandeau>
      <EditeurDevis
        devis={c.v}
        dossier={{ id: c.dossier.id, ref: c.dossier.ref, volume: c.dossier.volume, client, email: c.dossier.client.email ?? null }}
        initial={c.etat}
        onglet={onglet}
        defauts={{ tva: eff.tva, tvaAssurance: eff.tvaAssurance, arrhesPct: eff.arrhesPct, validiteJours: eff.validiteJours }}
        utilisateurs={c.utilisateurs}
        autres={c.autres as never}
        historique={c.historique}
        suggestions={c.suggestions}
        lienSignature={c.v.token ? versInterne(`/signature/${c.v.token}`) : null}
        postesTarif={formules(20)[0].lignes.map((l) => l.libelle)}
        retour={{ ok: sp.ok, erreur: sp.erreur }}
      />
    </div>
  );
}
