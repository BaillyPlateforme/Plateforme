import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import { formules } from "@/crm/lib/tarif";
import { m3, nomClient } from "@/crm/lib/format";
import { versInterne } from "@/lib/adresses";
import Bandeau from "@/ui/Bandeau";
import MenuActions from "@/ui/MenuActions";
import { avisDevisDuplique } from "@/crm/duplication/donnees";
import AvisDuplication from "@/crm/duplication/composants/AvisDuplication";
import { FenetreDupliquerDevis } from "@/crm/duplication/composants/DupliquerDevis";
import { Declencheur } from "@/crm/duplication/composants/Declencheur";
import { chargerDevis } from "@/crm/devis/donnees";
import { effectifs } from "@/crm/devis/parametres";
import { nomDevis } from "@/crm/devis/modele";
import EditeurDevis from "@/crm/devis/composants/EditeurDevis";
import { estDossierCimob } from "@/crm/devis/cimob";
import { CLES_ONGLETS, type Onglet } from "@/crm/devis/onglets";

export const dynamic = "force-dynamic";

/*
 * La fenêtre Devis (audit Créagidem, section I) : le bandeau commun, puis
 * l'éditeur — onglets dans le menu vertical, saisie en ligne, récapitulatif,
 * enregistrement d'un geste. Les devis d'avant s'y ouvrent tels quels.
 */

const STATUT: Record<string, string> = { brouillon: "Brouillon", envoye: "Envoyé", signe: "Signé", refuse: "Non retenu" };

export default async function DevisPage({ params, searchParams }: { params: Promise<{ id: string; devisId: string }>; searchParams: Promise<{ onglet?: string; ok?: string; erreur?: string; duplique?: string }> }) {
  await currentUser();
  const { id, devisId } = await params;
  const sp = await searchParams;
  const [c, duplique] = await Promise.all([
    chargerDevis(Number(devisId)),
    // Le devis vient d'être dupliqué (?duplique=<origine>) : son bandeau ramène au devis d'origine.
    sp.duplique && /^\d+$/.test(sp.duplique) ? avisDevisDuplique(Number(devisId), Number(sp.duplique)) : Promise.resolve(null),
  ]);
  if (!c || String(c.dossier.id) !== id) notFound();
  const cimob = await estDossierCimob(c.dossier.id);
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
        etiquettes={[nom, c.etat.chiffrage.mode === "forfait" ? "Forfait" : "Ligne à ligne", c.v.retire_le ? "Retiré" : STATUT[c.v.statut]]}
        secondaire={{ label: "Fiche du dossier", href: `/dossiers/${c.dossier.id}` }}
      >
        <Link href={`/imprimer/${c.dossier.id}?doc=devis&v=${c.v.id}`} target="_blank" data-ton="contour">Aperçu PDF</Link>
        <MenuActions>
          <Declencheur fenetre={`dupliquer-devis-${c.v.id}`} titre="Un brouillon, dans ce dossier ou dans un autre">
            Dupliquer ce devis…
          </Declencheur>
        </MenuActions>
        {/* Hors du menu, qui se démonte après un choix : la fenêtre attend son appel. */}
        <FenetreDupliquerDevis devis={{ id: c.v.id, numero: c.v.numero, dossierId: c.dossier.id, ref: c.dossier.ref, client, volume: Number(c.dossier.volume) || 0 }} />
      </Bandeau>
      {sp.erreur === "cible" && <div className="alert">Le dossier choisi n&apos;existe plus : rien n&apos;a été dupliqué.</div>}
      {sp.erreur === "cimob" && onglet !== "commande" && <div className="alert">Le dossier choisi est celui d&apos;un client CIMOB/DICOM : pas de devis, rien n&apos;a été dupliqué.</div>}
      {duplique && (
        <div style={{ padding: "0 4px" }}>
          <AvisDuplication
            titre={`Devis dupliqué depuis ${duplique.numero}${duplique.memeDossier ? "" : ` (dossier ${duplique.ref})`}`}
            texte={`Brouillon ${c.v.numero}, daté du jour : chiffrage, prestations, conditions et achats prévus repris. Il ne part au client que quand vous l'envoyez.`}
            alerte={
              duplique.volumeDiffere
                ? `Montants à vérifier : le volume diffère (${m3(duplique.volumes[0])} → ${m3(duplique.volumes[1])}), et les prix ne se recalculent pas sur le volume.`
                : null
            }
            lien={duplique.lien}
            libelleLien={`Voir ${duplique.numero}`}
          />
        </div>
      )}
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
        cimob={cimob}
      />
    </div>
  );
}
