import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { AvecMenu } from "@/ui/MenuVertical";
import { eur, dateFr, ilYa, initiales } from "@/crm/lib/format";
import { annuaire, filtresAnnuaire } from "@/crm/partenaires/donnees";
import { CATEGORIES, estCategorie } from "@/crm/partenaires/categories";
import MenuPartenaires, { type VuePartenaires as Vue } from "@/crm/partenaires/MenuPartenaires";
import NouveauPartenaire from "@/crm/partenaires/NouveauPartenaire";
import { BarreBas, RechercheVerre } from "@/crm/exploitation/ui/Bas";
import { equipesConnues, listerAgents, type AgentListe } from "@/terrain/lib/agents";
import GestionDemenageurs from "@/terrain/composants/GestionDemenageurs";
import u from "@/crm/exploitation/ui/ui.module.css";
import s from "@/crm/partenaires/partenaires.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partenaires" };

/*
 * L'annuaire unique de l'exploitation (simplification du 08/11/2026) : les
 * comptes des déménageurs pour l'outil terrain (anciennement /demenageurs)
 * et les sociétés avec qui Bailly travaille — sous-traitants, agences,
 * partenaires, transitaires… (anciennement /sous-traitants, audit Créagidem).
 * Une seule page, ses vues dans le menu de gauche (décision de David du
 * 08/11/2026) : « Tous », les déménageurs (gestion des comptes et des mots de
 * passe), puis une vue par famille de sociétés. La recherche reste dans la
 * rangée basse du bandeau. La fiche d'une société vit sous /partenaires/<id>.
 */
type Params = { vue?: string; q?: string; zone?: string; inactifs?: string; ok?: string };

const nomAgent = (a: { prenom: string; nom: string | null }) => [a.prenom, a.nom].filter(Boolean).join(" ");
const sansAccent = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default async function Partenaires({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const vue: Vue = sp.vue === "demenageurs" ? "demenageurs" : estCategorie(sp.vue) ? sp.vue : "tous";
  const recherche = sp.q?.trim() || undefined;
  const inactifs = sp.inactifs === "1";
  const avecSocietes = vue !== "demenageurs";
  // Les déménageurs n'ont pas de zone : un filtre de zone ne garde que les sociétés.
  const avecAgents = vue === "demenageurs" || (vue === "tous" && !sp.zone);

  const [rows, filtres, tousAgents, equipes] = await Promise.all([
    avecSocietes ? annuaire({ q: recherche, categorie: vue === "tous" ? undefined : vue, zone: sp.zone, inactifs }) : Promise.resolve([]),
    filtresAnnuaire(),
    avecAgents ? listerAgents() : Promise.resolve([] as AgentListe[]),
    vue === "demenageurs" ? equipesConnues() : Promise.resolve([] as string[]),
  ]);
  const agents = recherche
    ? tousAgents.filter((a) => sansAccent(`${a.prenom} ${a.nom ?? ""} ${a.identifiant} ${a.equipe ?? ""}`).includes(sansAccent(recherche)))
    : tousAgents;

  const lien = (p: Params) => {
    const x = new URLSearchParams();
    for (const [k, v] of Object.entries({ vue: vue === "tous" ? undefined : vue, q: sp.q, zone: sp.zone, inactifs: sp.inactifs, ...p })) if (v) x.set(k, v);
    return `/partenaires${x.size ? `?${x}` : ""}`;
  };
  // Changer de vue garde la recherche, pas la zone ni les fiches désactivées (propres aux sociétés).
  const versVue = (v: Vue) => lien({ vue: v === "tous" ? undefined : v, zone: undefined, inactifs: undefined });

  const texte =
    sp.zone && avecSocietes ? (
      <>
        Zone <b>{sp.zone}</b> ·{" "}
        <Link href={lien({ zone: undefined })} style={{ color: "#fff", textDecoration: "underline" }}>
          toutes les zones
        </Link>
      </>
    ) : vue === "demenageurs" ? (
      "Un compte par déménageur, intérimaires compris, pour l'outil terrain : les chantiers du jour lus au planning, et les photos avant, après et de détail rattachées au dossier."
    ) : vue === "tous" ? (
      "Les comptes des déménageurs pour l'outil terrain, et les sociétés avec qui Bailly travaille : contacts, zones, notes."
    ) : (
      "Sociétés, contacts, zones et notes : le prestataire d’une lettre de voiture se choisit ici."
    );

  const visibles = vue === "tous" ? agents.filter((a) => a.actif || inactifs) : [];
  const vide = vue !== "demenageurs" && rows.length === 0 && visibles.length === 0;

  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation"
        titre="Partenaires"
        texte={texte}
        action={vue === "demenageurs" ? { label: "Ouvrir l'outil terrain", href: "/terrain", icone: "fleche" } : undefined}
        bas={
          <BarreBas>
            <RechercheVerre
              action="/partenaires"
              valeur={sp.q}
              placeholder={vue === "demenageurs" ? "Nom, identifiant, équipe…" : "Société, contact, ville, zone…"}
              garder={{ vue: vue === "tous" ? undefined : vue, zone: sp.zone, inactifs: sp.inactifs }}
            />
          </BarreBas>
        }
      >
        {vue !== "demenageurs" && <NouveauPartenaire />}
      </Bandeau>

      <AvecMenu menu={<MenuPartenaires actif={vue} filtres={filtres} href={versVue} />}>
        {vue === "demenageurs" ? (
          <GestionDemenageurs agents={agents} equipes={equipes} />
        ) : (
          <div className={u.ecran}>
            {sp.ok === "supprime" && <p className={u.message}>Fiche supprimée de l&apos;annuaire.</p>}
            {vide && (
              <div className={`${u.carte} ${u.vide}`}>
                <i>
                  <Icone nom="partenaires" taille={24} />
                </i>
                <b>{recherche || sp.zone || vue !== "tous" ? "Personne ne correspond." : "L'annuaire est vide."}</b>
                <span>Ajoutez une société avec « Nouvelle société » : ses lettres de voiture s&apos;y relieront.</span>
              </div>
            )}

            {visibles.length > 0 && (
              <section className={s.groupe}>
                <h2 className={s.groupeTitre}>
                  Déménageurs <small>{visibles.length}</small>
                  <Link href={versVue("demenageurs")} className={s.groupeLien}>
                    Gérer les comptes
                    <Icone nom="fleche" taille={14} />
                  </Link>
                </h2>
                <div className={s.grille}>
                  {visibles.map((a) => (
                    <CarteDemenageur key={a.id} a={a} href={versVue("demenageurs")} />
                  ))}
                </div>
              </section>
            )}

            {rows.length > 0 && (
              <section className={s.groupe}>
                {vue === "tous" && (
                  <h2 className={s.groupeTitre}>
                    Sociétés <small>{rows.length}</small>
                  </h2>
                )}
                <div className={s.grille}>
                  {rows.map((r) => (
                    <CarteSociete key={r.id} r={r} zone={(z) => lien({ zone: z })} />
                  ))}
                </div>
              </section>
            )}

            <p className={u.aide} style={{ textAlign: "center" }}>
              <Link className={u.lien} href={lien({ inactifs: inactifs ? undefined : "1" })}>
                {inactifs ? "Masquer les fiches désactivées" : "Voir aussi les fiches désactivées"}
              </Link>
            </p>
          </div>
        )}
      </AvecMenu>
    </div>
  );
}

type LigneSociete = Awaited<ReturnType<typeof annuaire>>[number];

/** Une société de l'annuaire : famille, zones, contact principal, lettres de voiture et litiges. */
function CarteSociete({ r, zone }: { r: LigneSociete; zone: (z: string) => string }) {
  const cat = CATEGORIES[r.categorie] ?? CATEGORIES.autre;
  return (
    <article className={s.societe} data-inactif={!r.actif || undefined}>
      <div className={s.haut}>
        <i className={s.monogramme} data-ton={cat.ton}>
          {initiales(r.nom) || "?"}
        </i>
        <div className={s.nom}>
          <Link href={`/partenaires/${r.id}`} className={s.etendu}>
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
            <Link key={z} href={zone(z)} className={u.puce}>
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
}

/** Un déménageur dans l'annuaire : son équipe, son identifiant, ses photos ; la gestion du compte est dans la vue « Déménageurs ». */
function CarteDemenageur({ a, href }: { a: AgentListe; href: string }) {
  const nom = nomAgent(a);
  return (
    <article className={s.societe} data-inactif={!a.actif || undefined}>
      <div className={s.haut}>
        <i className={s.monogramme} data-ton="ambre">
          {initiales(nom) || "?"}
        </i>
        <div className={s.nom}>
          <Link href={href} className={s.etendu}>
            <b>
              {nom}
              {a.demo && <span className={u.demo}>Démo</span>}
            </b>
          </Link>
          <span className={s.sousNom}>
            <i className={u.etat} data-ton="ambre">
              Déménageur
            </i>
            {a.interimaire && (
              <i className={u.etat} data-ton="gris">
                Intérimaire
              </i>
            )}
            {!a.actif && (
              <i className={u.etat} data-ton="rose">
                Désactivé
              </i>
            )}
            <small>{a.equipe ?? "Sans équipe"}</small>
          </span>
        </div>
      </div>
      <div className={s.contact}>
        <i>
          <Icone nom="badge" taille={14} />
        </i>
        <span>
          {a.identifiant}
          <small>{a.mdpProvisoire ? "Mot de passe provisoire" : "Identifiant de l'outil terrain"}</small>
        </span>
      </div>
      <div className={s.bas}>
        <span>
          <b>{a.photos7j}</b> photo{a.photos7j > 1 ? "s" : ""} sur 7 j
        </span>
        <em>{a.derniereConnexion ? `Connexion : ${ilYa(a.derniereConnexion).toLowerCase()}` : "Jamais connecté"}</em>
      </div>
    </article>
  );
}
