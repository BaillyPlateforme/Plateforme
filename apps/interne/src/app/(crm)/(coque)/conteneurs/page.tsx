import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { dateFr, eur, m3 } from "@/crm/lib/format";
import { compteursConteneurs, listeConteneurs, type ConteneurListe } from "@/crm/conteneurs/donnees";
import { etatJalon, JALONS, STATUTS, estStatut } from "@/crm/conteneurs/regles";
import { BarreBas, RechercheVerre } from "@/crm/exploitation/ui/Bas";
import u from "@/crm/exploitation/ui/ui.module.css";
import s from "@/crm/conteneurs/conteneurs.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteneurs" };

/*
 * Les conteneurs (Créagidem : liste groupée Export / Import, ou dans l'ordre
 * chronologique) : trajet, navire, remplissage, avancement des jalons, marge
 * et alertes du contrôle d'incohérences. « Nouveau conteneur » ouvre la
 * saisie complète ; le dispatch international reste à côté.
 */
const VUES = { cours: "En cours", export: "Export", import: "Import", livres: "Livrés", tous: "Tous" } as const;
type Vue = keyof typeof VUES;
const auj = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

function Carte({ c }: { c: ConteneurListe }) {
  const part = c.capacite ? c.utilise / c.capacite : 0;
  const etats = JALONS.map((j) => etatJalon(c.jalons[j.cle], auj()));
  const faits = etats.filter((e) => e === "fait").length;
  const dernier = [...JALONS].reverse().find((j) => c.jalons[j.cle]?.reel);
  const statut = estStatut(c.statut) ? STATUTS[c.statut] : STATUTS.preparation;
  return (
    <article className={s.tc}>
      <div className={s.ident}>
        <Link href={`/conteneurs/${c.id}`} className={s.lien}>
          <b className={s.numero}>{c.numero}</b>
        </Link>
        <span className={s.badges}>
          <i className={u.etat} data-ton={c.sens === "export" ? "indigo" : "violet"}>
            {c.sens === "export" ? "Export" : "Import"}
          </i>
          <i className={u.etat} data-ton={statut.ton}>
            {statut.libelle}
          </i>
        </span>
        <small>
          {c.taille}
          {c.ref_groupeur ? ` · réf. ${c.ref_groupeur}` : c.groupeur ? ` · ${c.groupeur}` : ""}
        </small>
      </div>
      <div className={s.route}>
        <div>
          <b>{c.lieu_depart ?? "Départ à préciser"}</b>
          <small>{c.depart_prevu ? dateFr(c.depart_prevu, { day: "numeric", month: "short", year: "numeric" }) : "Date à fixer"}</small>
        </div>
        <span className={s.fleche}>
          <Icone nom="fleche" taille={16} />
        </span>
        <div>
          <b>{c.destination}</b>
          <small>{c.arrivee_prevue ? dateFr(c.arrivee_prevue, { day: "numeric", month: "short", year: "numeric" }) : "Date à fixer"}</small>
        </div>
        <p className={s.navire}>{[c.navire && `Navire ${c.navire}`, c.voyage && `voyage ${c.voyage}`, c.compagnie].filter(Boolean).join(" · ") || "Navire et compagnie à renseigner"}</p>
      </div>
      <div className={s.remplissage}>
        <span>
          <b>{m3(c.utilise)}</b> / {m3(c.capacite)} · {c.clients} client{c.clients > 1 ? "s" : ""}
        </span>
        <div className={u.jauge} data-ton={part > 1 ? "rose" : part > 0.9 ? "ambre" : undefined}>
          <i style={{ width: `${Math.min(100, part * 100)}%` }} />
        </div>
      </div>
      <div>
        <div className={s.frise} title={JALONS.map((j, i) => `${j.libelle} : ${etats[i] === "fait" ? "fait" : etats[i] === "retard" ? "en retard" : etats[i] === "prevu" ? "prévu" : "—"}`).join("\n")}>
          {etats.map((e, i) => (
            <i key={JALONS[i].cle} data-etat={e} />
          ))}
        </div>
        <p className={s.friseTexte}>
          {faits}/{JALONS.length} jalons{dernier ? ` · dernier : ${dernier.libelle.toLowerCase()} le ${dateFr(c.jalons[dernier.cle]!.reel!)}` : ""}
        </p>
      </div>
      <div className={s.droite}>
        <span className={s.marge}>
          {c.marge.reelle != null ? eur(c.marge.reelle) : c.marge.prevue != null ? eur(c.marge.prevue) : "—"}
          <small>{c.marge.reelle != null ? "marge réalisée" : c.marge.prevue != null ? "marge prévue" : "marge non saisie"}</small>
        </span>
        {c.alertes > 0 ? (
          <Link href={`/conteneurs/${c.id}?onglet=controle`} className={`${u.etat} ${s.alertes}`} data-ton={c.erreurs ? "rose" : "ambre"}>
            {c.alertes} alerte{c.alertes > 1 ? "s" : ""}
          </Link>
        ) : (
          <i className={u.etat} data-ton="vert">
            Cohérent
          </i>
        )}
      </div>
    </article>
  );
}

export default async function Conteneurs({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string; ordre?: string; ok?: string }> }) {
  const sp = await searchParams;
  const vue: Vue = sp.vue && sp.vue in VUES ? (sp.vue as Vue) : "cours";
  const chrono = sp.ordre === "chrono";
  const [rows, n] = await Promise.all([listeConteneurs({ vue, q: sp.q?.trim() || undefined }), compteursConteneurs()]);
  const nombres: Record<Vue, number> = { cours: n.cours, export: n.export, import: n.import, livres: n.livres, tous: n.tous };
  const lien = (p: Record<string, string | undefined>) => {
    const x = new URLSearchParams();
    for (const [k, v] of Object.entries({ vue: vue === "cours" ? undefined : vue, q: sp.q, ordre: sp.ordre, ...p })) if (v) x.set(k, v);
    return `/conteneurs${x.size ? `?${x}` : ""}`;
  };
  const groupes = chrono
    ? [{ titre: "Ordre chronologique", lignes: rows }]
    : [
        { titre: "Export", lignes: rows.filter((r) => r.sens === "export") },
        { titre: "Import", lignes: rows.filter((r) => r.sens === "import") },
      ].filter((g) => g.lignes.length);

  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation"
        titre="Conteneurs"
        texte="Trajet, navire, jalons, remplissage, coûts et marge de chaque conteneur."
        action={{ label: "Nouveau conteneur", href: "/conteneurs/nouveau", icone: "plus" }}
        bas={
          <BarreBas>
            <Pilules label="Conteneurs" items={(Object.keys(VUES) as Vue[]).map((v) => ({ href: lien({ vue: v === "cours" ? undefined : v }), label: VUES[v], actif: vue === v, nombre: nombres[v] }))} />
            <RechercheVerre action="/conteneurs" valeur={sp.q} placeholder="Numéro, navire, client, destination…" garder={{ vue: vue === "cours" ? undefined : vue, ordre: sp.ordre }} />
          </BarreBas>
        }
      >
        <Link href={lien({ ordre: chrono ? undefined : "chrono" })} data-ton="contour">
          {chrono ? "Grouper Export / Import" : "Ordre chronologique"}
        </Link>
        <Link href="/conteneurs/dispatch" data-ton="contour">
          Dispatch international
        </Link>
      </Bandeau>
      <div className={u.ecran}>
        {sp.ok === "supprime" && <p className={u.message}>Conteneur supprimé.</p>}
        {rows.length === 0 && (
          <div className={`${u.carte} ${u.vide}`}>
            <i>
              <Icone nom="bateau" taille={24} />
            </i>
            <b>{sp.q ? "Aucun conteneur ne correspond." : "Aucun conteneur ici."}</b>
            <Link href="/conteneurs/nouveau" className={u.lien}>
              Saisir un conteneur
            </Link>
          </div>
        )}
        {groupes.map((g) => (
          <section key={g.titre} className={s.groupe}>
            <h2 className={s.groupeTitre}>
              {g.titre} <small>{g.lignes.length}</small>
            </h2>
            {g.lignes.map((c) => (
              <Carte key={c.id} c={c} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
