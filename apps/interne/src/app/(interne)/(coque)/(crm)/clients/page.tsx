import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Bandeau from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import MenuVertical, { AvecMenu } from "@/ui/MenuVertical";
import { currentUser } from "@/crm/lib/auth";
import { TYPES, initiales } from "@/crm/lib/format";
import { Avatar, Pastille } from "@/crm/kanban/Carte";
import { commerciauxKanban } from "@/crm/kanban/donnees";
import { etapeDossier } from "@/crm/kanban/etapes";
import { lignesClients } from "@/crm/clients/donnees";
import FiltresClients from "@/crm/clients/FiltresClients";
import {
  PAR_PAGE,
  TEINTE_TYPE,
  VUES,
  correspond,
  dansVue,
  emailValide,
  estTri,
  estVue,
  etatEspace,
  lienTelephone,
  nomAffiche,
  telephoneLisible,
  type LigneClient,
  type Tri,
  type Vue,
} from "@/crm/clients/commun";
import s from "@/crm/clients/clients.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clients" };

/*
 * Les clients du CRM (demande de David, 08/11/2026 : « il manque clairement un
 * onglet client »). Une ligne par client : qui il est, comment le joindre (un
 * clic appelle ou écrit), ses dossiers et l'étape du dernier, ce qu'il a
 * signé et ce qu'il doit encore, son espace client, sa dernière activité.
 *
 * Les filtres resserrent la même liste, dans la rangée du bas de la bande :
 * recherche (nom, société, e-mail, téléphone, ville, référence de dossier),
 * commercial de son dernier dossier, type de client, et le tri. Les vues,
 * quatre, vont au menu (compact : il passe au-dessus de la liste) : Tous,
 * avec un dossier en cours, à relancer ou reste à payer, sans dossier. La
 * bande garde son titre d'une vue à l'autre. La liste se lit par pages.
 */

type Params = Record<string, string | string[] | undefined>;

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
const JOUR_ANNEE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const COMPLET = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });
const jour = (d: string) => (new Date(d).getFullYear() === new Date().getFullYear() ? JOUR : JOUR_ANNEE).format(new Date(d));
const euros = (n: number) => {
  const cents = Math.abs(n - Math.round(n)) >= 0.005;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 }).format(n);
};

/** « Aujourd'hui », « Hier », « Il y a 5 j », puis la date. */
function depuis(d: string, maintenant: number): string {
  const j = Math.floor((maintenant - new Date(d).getTime()) / 86_400_000);
  if (j <= 0) return "Aujourd’hui";
  if (j === 1) return "Hier";
  if (j < 30) return `Il y a ${j} j`;
  return jour(d);
}

/** L'instant du rendu (hors du composant : un rendu reste pur). */
const instant = () => Date.now();

const COLLATOR = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
function trier(l: LigneClient[], tri: Tri): LigneClient[] {
  const x = [...l];
  if (tri === "az") return x.sort((a, b) => COLLATOR.compare(nomAffiche(a), nomAffiche(b)) || a.id - b.id);
  if (tri === "ca") return x.sort((a, b) => b.ca - a.ca || b.activite.localeCompare(a.activite));
  return x.sort((a, b) => b.activite.localeCompare(a.activite) || b.id - a.id);
}

export default async function Clients({ searchParams }: { searchParams: Promise<Params> }) {
  await currentUser();
  const brut = await searchParams;
  const sp = Object.fromEntries(Object.entries(brut).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const vue: Vue = estVue(sp.vue) ? sp.vue : "tous";
  const tri: Tri = estTri(sp.tri) ? sp.tri : "recents";
  const q = sp.q?.trim().slice(0, 80) ?? "";
  const type = sp.type && sp.type in TYPES ? sp.type : null;
  const commercial = sp.commercial && /^\d+$/.test(sp.commercial) ? Number(sp.commercial) : null;

  const [toutes, commerciaux] = await Promise.all([lignesClients(), commerciauxKanban()]);
  const maintenant = instant();
  const filtrees = toutes.filter((l) => (!type || l.type === type) && (!commercial || l.dernier?.commercialId === commercial) && correspond(q, l.texte, l.telephones));
  const nombres = Object.fromEntries(VUES.map((v) => [v.cle, filtrees.filter((l) => dansVue(l, v.cle)).length])) as Record<Vue, number>;
  const lignes = trier(
    filtrees.filter((l) => dansVue(l, vue)),
    tri,
  );
  const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const visibles = lignes.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);

  // L'adresse d'une vue ou d'une page : les filtres suivent.
  const lien = (o: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const tout = {
      q: q || null,
      type,
      commercial: commercial ? String(commercial) : null,
      tri: tri === "recents" ? null : tri,
      vue: vue === "tous" ? null : vue,
      page: null,
      ...o,
    };
    for (const [k, v] of Object.entries(tout)) if (v && !(k === "vue" && v === "tous") && !(k === "page" && v === "1")) u.set(k, v);
    const x = u.toString();
    return `/clients${x ? `?${x}` : ""}`;
  };

  const menu = (
    <MenuVertical
      titre="Clients"
      groupes={[{ items: VUES.map((v) => ({ href: lien({ vue: v.cle }), label: v.label, icone: v.icone, actif: vue === v.cle, nombre: nombres[v.cle] })) }]}
    />
  );

  const filtre = !!(q || type || commercial);
  const total = toutes.length;
  const texte = filtre
    ? `${filtrees.length} client${filtrees.length > 1 ? "s" : ""} sur ${total} répond${filtrees.length > 1 ? "ent" : ""} aux filtres`
    : `${total} client${total > 1 ? "s" : ""} · leurs dossiers, ce qu’ils ont signé, ce qu’ils doivent encore`;

  return (
    <div className="view">
      <Bandeau
        surtitre="Clients"
        // Un seul titre pour les quatre vues : changer de vue ne change pas de page.
        titre="Clients"
        texte={texte}
        bas={
          <Suspense>
            <FiltresClients commerciaux={commerciaux} />
          </Suspense>
        }
      />
      <AvecMenu menu={menu}>
        <section className={s.liste} aria-label="Liste des clients">
          <div className={s.tete} aria-hidden>
            <span>Client</span>
            <span>Coordonnées</span>
            <span>Dossiers</span>
            <span className={s.num}>CA signé</span>
            <span className={s.num}>Reste à payer</span>
            <span>Espace client</span>
            <span>Activité</span>
            <span />
          </div>
          {visibles.length === 0 ? (
            <div className={s.vide}>
              <i>
                <Icone nom="clients" taille={26} />
              </i>
              <b>{filtre ? "Aucun client ne répond à ces filtres." : vue === "sans_dossier" ? "Tous les clients ont au moins un dossier." : "Aucun client dans cette vue."}</b>
              {filtre && <Link href={lien({ q: null, type: null, commercial: null })}>Effacer les filtres</Link>}
            </div>
          ) : (
            <ol className={s.lignes}>
              {visibles.map((l, i) => (
                <Ligne key={l.id} l={l} maintenant={maintenant} rang={i} />
              ))}
            </ol>
          )}
          {lignes.length > PAR_PAGE && (
            <nav className={s.pagination} aria-label="Pages">
              <span>
                {(page - 1) * PAR_PAGE + 1}–{Math.min(page * PAR_PAGE, lignes.length)} sur {lignes.length}
              </span>
              <div>
                {page > 1 ? (
                  <Link href={lien({ page: String(page - 1) })} className={s.pageLien} aria-label="Page précédente">
                    <Icone nom="gauche" taille={15} />
                  </Link>
                ) : (
                  <span className={s.pageLien} aria-disabled="true">
                    <Icone nom="gauche" taille={15} />
                  </span>
                )}
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <Link key={n} href={lien({ page: String(n) })} className={s.pageLien} aria-current={n === page ? "page" : undefined}>
                    {n}
                  </Link>
                ))}
                {page < pages ? (
                  <Link href={lien({ page: String(page + 1) })} className={s.pageLien} aria-label="Page suivante">
                    <Icone nom="droite" taille={15} />
                  </Link>
                ) : (
                  <span className={s.pageLien} aria-disabled="true">
                    <Icone nom="droite" taille={15} />
                  </span>
                )}
              </div>
            </nav>
          )}
        </section>
      </AvecMenu>
    </div>
  );
}

function Ligne({ l, maintenant, rang }: { l: LigneClient; maintenant: number; rang: number }) {
  const nom = nomAffiche(l);
  const teinte = TEINTE_TYPE[l.type] ?? "indigo";
  const tel = telephoneLisible(l.telephone) ?? telephoneLisible(l.telephone2);
  const telHref = lienTelephone(l.telephone) ?? lienTelephone(l.telephone2);
  const email = emailValide(l.email) ? l.email.trim() : null;
  const espace = etatEspace(l.espaces, l.derniereConnexion, jour);
  const etape = l.dernier ? etapeDossier(l.dernier.statut) : null;
  const contact = l.societe && (l.prenom || l.nom) ? [l.prenom, l.nom].filter(Boolean).join(" ") : null;
  return (
    <li className={s.ligne} style={{ ["--i" as string]: Math.min(rang, 14) }}>
      <div className={s.qui}>
        <span className={s.avatar} data-teinte={teinte} aria-hidden>
          {initiales(nom) || "?"}
        </span>
        <span className={s.quiTexte}>
          {/* Le lien du nom couvre toute la ligne (::after) ; les liens d'appel et d'e-mail passent par-dessus. */}
          <Link href={`/clients/${l.id}`} className={s.nom} prefetch={false}>
            {nom}
          </Link>
          <span className={s.sous}>
            <Pastille label={TYPES[l.type] ?? l.type} teinte={teinte} />
            <span className={s.sousTexte}>{contact ?? (l.villes.length ? l.villes.slice(0, 2).join(" → ") : `Client n° ${l.id}`)}</span>
          </span>
        </span>
      </div>
      <div className={s.coord}>
        {tel ? (
          telHref ? (
            <a href={telHref} className={s.contact} title={`Appeler ${nom}`}>
              <Icone nom="telephone" taille={14} />
              <span>{tel}</span>
            </a>
          ) : (
            <span className={s.contact}>
              <Icone nom="telephone" taille={14} />
              <span>{tel}</span>
            </span>
          )
        ) : (
          <span className={s.manque}>Pas de téléphone</span>
        )}
        {email ? (
          <a href={`mailto:${email}`} className={s.contact} title={`Écrire à ${email}`}>
            <Icone nom="courrier" taille={14} />
            <span>{email}</span>
          </a>
        ) : (
          <span className={s.manque}>Pas d’e-mail</span>
        )}
      </div>
      <div className={s.dossiers}>
        {l.dernier && etape ? (
          <>
            <span className={s.dossiersHaut}>
              <b>{l.nbDossiers}</b> dossier{l.nbDossiers > 1 ? "s" : ""}
              {l.enCours > 0 && l.nbDossiers > 1 && <em> · {l.enCours} en cours</em>}
            </span>
            <span className={s.dossiersBas}>
              <Pastille label={etape.label} teinte={etape.teinte} titre={`Dernier dossier : ${l.dernier.ref} · ${etape.aide}`} />
              <small>{l.dernier.ref}</small>
              {l.dernier.commercial && <Avatar r={l.dernier.commercial} mini />}
            </span>
          </>
        ) : (
          <span className={s.manque}>Aucun dossier</span>
        )}
      </div>
      <div className={`${s.num} ${s.montant}`}>{l.ca > 0 ? euros(l.ca) : <span className={s.zero}>—</span>}</div>
      <div className={`${s.num} ${s.montant}`} data-ton={l.reste > 0.5 ? "du" : undefined}>
        {l.reste > 0.5 ? euros(l.reste) : <span className={s.zero}>{l.ca > 0 ? "Soldé" : "—"}</span>}
        {l.aRelancer && (
          <span className={s.relance} title="Une relance attend sur un de ses dossiers">
            <Icone nom="horloge" taille={12} /> À relancer
          </span>
        )}
      </div>
      <div className={s.espace} data-etat={espace.cle}>
        <i aria-hidden />
        <span>{espace.cle === "aucun" ? "—" : espace.label}</span>
      </div>
      <div className={s.activite} title={COMPLET.format(new Date(l.activite))}>
        {depuis(l.activite, maintenant)}
      </div>
      <span className={s.aller} aria-hidden>
        <Icone nom="droite" taille={16} />
      </span>
    </li>
  );
}
