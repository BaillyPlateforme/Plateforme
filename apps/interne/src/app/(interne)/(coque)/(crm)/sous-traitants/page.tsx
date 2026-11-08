import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { eur, dateFr, initiales } from "@/crm/lib/format";
import { annuaire, filtresAnnuaire } from "@/crm/partenaires/donnees";
import { CATEGORIES, estCategorie } from "@/crm/partenaires/categories";
import NouveauPartenaire from "@/crm/partenaires/NouveauPartenaire";
import { BarreBas, RechercheVerre } from "@/crm/exploitation/ui/Bas";
import u from "@/crm/exploitation/ui/ui.module.css";
import s from "@/crm/partenaires/partenaires.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sous-traitants et partenaires" };

/*
 * L'annuaire des sous-traitants et partenaires (audit Créagidem, « Sociétés
 * et confrères dans la même base ») : les sociétés avec qui Bailly travaille,
 * leurs contacts, leurs zones et leurs notes. Le prestataire d'une lettre de
 * voiture se choisit ici ; une lettre déjà saisie en texte libre se relie
 * d'elle-même quand son nom entre dans l'annuaire.
 */
export default async function SousTraitants({ searchParams }: { searchParams: Promise<{ q?: string; categorie?: string; zone?: string; inactifs?: string; ok?: string }> }) {
  const sp = await searchParams;
  const categorie = estCategorie(sp.categorie) ? sp.categorie : undefined;
  const [rows, filtres] = await Promise.all([
    annuaire({ q: sp.q?.trim() || undefined, categorie, zone: sp.zone, inactifs: sp.inactifs === "1" }),
    filtresAnnuaire(),
  ]);
  const lien = (p: Record<string, string | undefined>) => {
    const x = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, zone: sp.zone, ...p })) if (v) x.set(k, v);
    const t = x.toString();
    return `/sous-traitants${t ? `?${t}` : ""}`;
  };
  const total = [...filtres.categories.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation · Annuaire"
        titre="Sous-traitants et partenaires"
        texte={
          sp.zone ? (
            <>
              Zone <b>{sp.zone}</b> ·{" "}
              <Link href={lien({ zone: undefined, categorie })} style={{ color: "#fff", textDecoration: "underline" }}>
                toutes les zones
              </Link>
            </>
          ) : (
            "Sociétés, contacts, zones et notes : le prestataire d’une lettre de voiture se choisit ici."
          )
        }
        bas={
          <BarreBas>
            <Pilules
              label="Familles"
              items={[
                { href: lien({ categorie: undefined }), label: "Toutes", actif: !categorie, nombre: total },
                ...Object.entries(CATEGORIES)
                  .filter(([k]) => filtres.categories.get(k as keyof typeof CATEGORIES))
                  .map(([k, v]) => ({ href: lien({ categorie: k }), label: v.pluriel, actif: categorie === k, nombre: filtres.categories.get(k as keyof typeof CATEGORIES) })),
              ]}
            />
            <RechercheVerre action="/sous-traitants" valeur={sp.q} placeholder="Société, contact, ville, zone…" garder={{ categorie, zone: sp.zone }} />
          </BarreBas>
        }
      >
        <NouveauPartenaire />
      </Bandeau>

      <div className={u.ecran}>
        {sp.ok === "supprime" && <p className={u.message}>Fiche supprimée de l&apos;annuaire.</p>}
        {rows.length === 0 ? (
          <div className={`${u.carte} ${u.vide}`}>
            <i>
              <Icone nom="clients" taille={24} />
            </i>
            <b>{sp.q || categorie || sp.zone ? "Aucune société ne correspond." : "L'annuaire est vide."}</b>
            <span>Ajoutez une société avec « Nouvelle société » : ses lettres de voiture s&apos;y relieront.</span>
          </div>
        ) : (
          <div className={s.grille}>
            {rows.map((r) => {
              const cat = CATEGORIES[r.categorie] ?? CATEGORIES.autre;
              return (
                <article key={r.id} className={s.societe} data-inactif={!r.actif || undefined}>
                  <div className={s.haut}>
                    <i className={s.monogramme} data-ton={cat.ton}>
                      {initiales(r.nom) || "?"}
                    </i>
                    <div className={s.nom}>
                      <Link href={`/sous-traitants/${r.id}`} className={s.etendu}>
                        <b>
                          {r.nom}
                          {r.demo && <span className={u.demo}>Démo</span>}
                        </b>
                      </Link>
                      <span className={s.sousNom}>
                        <i className={u.etat} data-ton={cat.ton}>
                          {cat.libelle}
                        </i>
                        <small>{[r.ville, r.pays && r.pays !== "France" ? r.pays : null].filter(Boolean).join(" · ") || "Ville non renseignée"}</small>
                      </span>
                    </div>
                  </div>
                  {r.zones.length > 0 && (
                    <div className={s.zones}>
                      {r.zones.slice(0, 6).map((z) => (
                        <Link key={z} href={lien({ zone: z, categorie })} className={u.puce}>
                          {z}
                        </Link>
                      ))}
                      {r.zones.length > 6 && <span className={u.puce}>+{r.zones.length - 6}</span>}
                    </div>
                  )}
                  <div className={s.contact}>
                    <i>{r.contact ? initiales(r.contact) : "—"}</i>
                    <span>
                      {r.contact ?? "Aucun contact"}
                      <small>{[r.telephone, r.email].filter(Boolean).join(" · ") || "Coordonnées à compléter"}</small>
                    </span>
                  </div>
                  <div className={s.bas}>
                    <span>
                      <b>{r.lettres}</b> lettre{r.lettres > 1 ? "s" : ""}
                    </span>
                    {r.cout > 0 && (
                      <span>
                        <b>{eur(r.cout)}</b> sous-traités
                      </span>
                    )}
                    {r.litiges > 0 && (
                      <span className={s.alerte}>
                        <b className={s.alerte}>{r.litiges}</b> litige{r.litiges > 1 ? "s" : ""}
                      </span>
                    )}
                    <em>{r.derniere ? `Dernière : ${dateFr(r.derniere, { day: "numeric", month: "short", year: "numeric" })}` : r.lettres ? "Sans date" : "Jamais missionnée"}</em>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <p className={u.aide} style={{ textAlign: "center" }}>
          {sp.inactifs === "1" ? (
            <Link className={u.lien} href={lien({ categorie, inactifs: undefined })}>
              Masquer les fiches désactivées
            </Link>
          ) : (
            <Link className={u.lien} href={lien({ categorie, inactifs: "1" })}>
              Voir aussi les fiches désactivées
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
