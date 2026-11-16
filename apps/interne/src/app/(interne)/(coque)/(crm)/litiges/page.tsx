import Bandeau, { Pilules } from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { compteursLitiges, dossiersPourLitige, litiges, originesConnues, VUES_LITIGES, type VueLitiges } from "@/crm/litiges/donnees";
import { NouveauLitige, TableLitiges } from "@/crm/litiges/Litiges";
import { nomsAnnuaire } from "@/crm/partenaires/donnees";
import { BarreBas, RechercheVerre } from "@/crm/exploitation/ui/Bas";
import u from "@/crm/exploitation/ui/ui.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Litiges" };

/*
 * Tous les litiges (Créagidem : Num, Origine, État, Date, Libellé), tous
 * dossiers confondus, filtrés par état et cherchables. Un litige se modifie
 * dans sa fenêtre ; il reste visible sur la fiche de son dossier.
 */
export default async function Litiges({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string }> }) {
  const sp = await searchParams;
  const vue: VueLitiges = sp.vue && Object.hasOwn(VUES_LITIGES, sp.vue) ? (sp.vue as VueLitiges) : "cours";
  const [lignes, n, origines, sousTraitants, dossiers] = await Promise.all([
    litiges({ vue, q: sp.q?.trim() || undefined }),
    compteursLitiges(),
    originesConnues(),
    nomsAnnuaire(),
    dossiersPourLitige(),
  ]);
  const listes = { origines, sousTraitants: sousTraitants.map((s) => ({ id: s.id, nom: s.nom })) };
  const lien = (v: VueLitiges) => {
    const x = new URLSearchParams();
    if (v !== "cours") x.set("vue", v);
    if (sp.q) x.set("q", sp.q);
    return `/litiges${x.size ? `?${x}` : ""}`;
  };

  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation"
        titre="Litiges"
        texte="Tous les litiges des dossiers : origine, montant, état ; chacun reste sur la fiche de son dossier."
        bas={
          <BarreBas>
            <Pilules label="État" items={(Object.keys(VUES_LITIGES) as VueLitiges[]).map((v) => ({ href: lien(v), label: VUES_LITIGES[v], actif: vue === v, nombre: n[v] }))} />
            <RechercheVerre action="/litiges" valeur={sp.q} placeholder="Libellé, client, dossier, origine…" garder={{ vue: vue === "cours" ? undefined : vue }} />
          </BarreBas>
        }
      >
        <NouveauLitige listes={listes} dossiers={dossiers} />
      </Bandeau>
      <div className={u.ecran}>
        <section className={`${u.carte} ${u.carteSerree}`}>
          {lignes.length === 0 ? (
            <div className={u.vide}>
              <i>
                <Icone nom="litige" taille={24} />
              </i>
              <b>{sp.q ? "Aucun litige ne correspond." : vue === "cours" ? "Aucun litige en cours." : "Aucun litige."}</b>
            </div>
          ) : (
            <TableLitiges lignes={lignes} listes={listes} />
          )}
        </section>
      </div>
    </div>
  );
}
