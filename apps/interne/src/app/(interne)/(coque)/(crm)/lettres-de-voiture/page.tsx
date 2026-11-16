import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { eur, nomClient, dateFr } from "@/crm/lib/format";
import { lettresDeVoiture, nomsExecutants } from "@/crm/partenaires/donnees";
import ChoixPrestataire from "@/crm/partenaires/ChoixPrestataire";
import { BarreBas, RechercheVerre } from "@/crm/exploitation/ui/Bas";
import u from "@/crm/exploitation/ui/ui.module.css";
import s from "@/crm/partenaires/partenaires.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lettres de voiture" };

/*
 * Toutes les lettres de voiture. Une lettre par rupture de charge ; seule la
 * première porte le montant, pour ne compter le CA qu'une fois. Le
 * prestataire se choisit dans l'annuaire des sous-traitants et partenaires ;
 * un nom saisi en texte libre (l'existant) reste accepté.
 */
const ST: Record<string, [string, string]> = { a_planifier: ["À planifier", "indigo"], planifiee: ["Planifiée", "violet"], en_cours: ["En cours", "ambre"], livree: ["Livrée", "vert"] };

export default async function Lettres({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; vue?: string }> }) {
  const sp = await searchParams;
  const statut = sp.statut && Object.hasOwn(ST, sp.statut) ? sp.statut : undefined;
  const sousTraitees = sp.vue === "sous-traitance";
  const [rows, annuaire] = await Promise.all([lettresDeVoiture({ q: sp.q?.trim() || undefined, statut, sousTraitees }), nomsExecutants()]);
  const lien = (p: Record<string, string | undefined>) => {
    const x = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, ...p })) if (v) x.set(k, v);
    return `/lettres-de-voiture${x.size ? `?${x}` : ""}`;
  };
  const libres = rows.filter((r) => !r.sous_traitant_id).length;

  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation"
        titre="Lettres de voiture"
        texte={libres ? `${rows.length} lettres · ${libres} prestataire${libres > 1 ? "s" : ""} en texte libre, à relier à l’annuaire` : "Une lettre par rupture de charge ; seule la première porte le montant."}
        secondaire={{ label: "Annuaire des partenaires", href: "/partenaires" }}
        bas={
          <BarreBas>
            <Pilules
              label="Statut"
              items={[
                { href: lien({}), label: "Toutes", actif: !statut && !sousTraitees },
                ...Object.entries(ST).map(([k, v]) => ({ href: lien({ statut: k }), label: v[0], actif: statut === k })),
                { href: lien({ vue: "sous-traitance" }), label: "Sous-traitées", actif: sousTraitees },
              ]}
            />
            <RechercheVerre action="/lettres-de-voiture" valeur={sp.q} placeholder="N°, client, trajet, prestataire…" garder={{ statut, vue: sp.vue }} />
          </BarreBas>
        }
      />
      <div className={u.ecran}>
        <section className={`${u.carte} ${u.carteSerree}`}>
          <div className={u.defile}>
            <table className={u.tableau}>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Trajet</th>
                  <th>Dates</th>
                  <th>Prestataire</th>
                  <th>Équipe · véhicule</th>
                  <th className={u.droite}>Sous-traitant</th>
                  <th>Statut</th>
                  <th className={u.droite}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className={u.vide}>
                      Aucune lettre de voiture.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/dossiers/${r.did}`} className={`${u.ref} ${u.nowrap}`}>
                        {r.numero}
                      </Link>
                    </td>
                    <td>
                      <b>{nomClient(r)}</b>
                      <small>{r.ref}</small>
                    </td>
                    <td>{r.trajet}</td>
                    <td className={u.nowrap}>
                      {dateFr(r.date_chargement)}
                      {r.date_livraison && +new Date(r.date_livraison) !== +new Date(r.date_chargement ?? 0) && <small>→ {dateFr(r.date_livraison)}</small>}
                    </td>
                    <td>
                      {!r.sous_traitant_id && (
                        <span className={s.libre}>
                          {r.prestataire}
                          <em>Texte libre</em>
                        </span>
                      )}
                      <span className={s.ligneChoix}>
                        <ChoixPrestataire lettre={r.id} lie={r.sous_traitant_id} annuaire={annuaire} />
                        {r.sous_traitant_id && (
                          <Link href={`/partenaires/${r.sous_traitant_id}`} className={u.lien} title={`Fiche de ${r.st_nom}`}>
                            Fiche
                          </Link>
                        )}
                      </span>
                    </td>
                    <td>
                      {r.equipe ?? "—"}
                      {r.immatriculation && <small>{r.immatriculation}</small>}
                    </td>
                    <td className={u.droite}>{r.prix != null ? eur(r.prix) : "—"}</td>
                    <td>
                      <i className={u.etat} data-ton={ST[r.statut]?.[1]}>
                        {ST[r.statut]?.[0] ?? r.statut}
                      </i>
                    </td>
                    <td className={u.droite}>
                      <b>{eur(r.montant)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
