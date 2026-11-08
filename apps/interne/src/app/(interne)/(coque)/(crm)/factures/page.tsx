import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import Filtres, { type Filtre } from "@/ui/Filtres";
import { currentUser } from "@/crm/lib/auth";
import { q1 } from "@/crm/lib/db";
import { arrhesAttendues, compteursFacturation, listeFactures, listeReglements, soldeDossier } from "@/crm/facturation/donnees";
import { TableFactures, TableReglements } from "@/crm/facturation/Listes";
import { MODES, euros2 } from "@/crm/facturation/calcul";
import { nomClient } from "@/crm/lib/format";
import s from "@/crm/facturation/facturation.module.css";

export const dynamic = "force-dynamic";

/*
 * La facturation (Créagidem, §Q). Simplification du 08/11/2026 : plus de
 * menu à gauche. Trois vues en pilules dans la rangée du bas du bandeau —
 * les factures, les règlements, les arrhes — et, à côté, leurs filtres en
 * listes déroulantes : pour les factures, le type (factures, factures
 * d'arrhes, avoirs), l'état et le regroupement par client payeur ou
 * d'origine ; pour les règlements, le mode ; pour les arrhes, l'affectation.
 * La recherche reste à droite. Ouverte depuis un dossier (?dossier=), la page
 * ne montre que lui. Les mentions et conditions sont dans Réglages.
 */
type Vue = "factures" | "reglements" | "arrhes";
const VUES: Vue[] = ["factures", "reglements", "arrhes"];
const TYPES = { factures: { genres: ["facture", "solde"], titre: "Factures" }, acomptes: { genres: ["acompte"], titre: "Factures d'arrhes" }, avoirs: { genres: ["avoir"], titre: "Avoirs" } } as const;
type Type = keyof typeof TYPES;
const ETATS = [["ouvertes", "À régler"], ["partielle", "Réglées en partie"], ["retard", "En retard"], ["soldee", "Soldées"], ["annulee", "Annulées"]] as const;

export default async function Factures({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await currentUser();
  const sp = await searchParams;
  // Les anciennes vues « Factures d'arrhes » et « Avoirs » du menu sont devenues un filtre de type.
  if (sp.vue === "acomptes" || sp.vue === "avoirs") {
    const u = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "vue"));
    u.set("type", sp.vue);
    redirect(`/factures?${u}`);
  }
  const vue: Vue = VUES.includes(sp.vue as Vue) ? (sp.vue as Vue) : "factures";
  const dossier = sp.dossier && /^\d+$/.test(sp.dossier) ? Number(sp.dossier) : null;
  const type: Type | null = sp.type && sp.type in TYPES ? (sp.type as Type) : null;
  const groupe = sp.groupe === "payeur" || sp.groupe === "origine" ? sp.groupe : null;
  const etat = type !== "avoirs" && ETATS.some(([k]) => k === sp.etat) ? sp.etat! : null;
  const mode = MODES.some((m) => m.cle === sp.mode) ? sp.mode! : null;
  const libres = sp.affectation === "libres" ? "libres" : sp.affectation === "affectes" ? "affectes" : null;
  const q = sp.q?.trim().slice(0, 80) || null;

  // L'adresse d'une vue : le dossier ouvert et la recherche suivent toujours ; les filtres restent à la vue qu'ils servent.
  const lien = (o: Record<string, string | null | undefined>) => {
    const u = new URLSearchParams();
    const tout = { vue, dossier: dossier ? String(dossier) : null, q, ...o };
    for (const [k, v] of Object.entries(tout)) if (v && !(k === "vue" && v === "factures")) u.set(k, v);
    const x = u.toString();
    return `/factures${x ? `?${x}` : ""}`;
  };

  const [compteurs, solde, dossierRef, attendues] = await Promise.all([
    compteursFacturation(dossier),
    dossier ? soldeDossier(dossier) : Promise.resolve(null),
    // La référence du dossier, même sans facture ni règlement à lister (le bandeau disait « Dossier · reste à payer »).
    dossier ? q1<{ ref: string }>("select ref from dossiers where id=$1", [dossier]) : Promise.resolve(undefined),
    // Les arrhes attendues : l'encart de la vue Arrhes, et le nombre de sa pilule.
    arrhesAttendues(dossier),
  ]);
  const genres = type ? [...TYPES[type].genres] : ["facture", "solde", "acompte", "avoir"];
  const factures = vue === "factures" ? await listeFactures({ genres, etat, dossier, q }) : [];
  const reglements = vue === "reglements" || vue === "arrhes"
    ? await listeReglements({ mode: vue === "reglements" ? mode : null, dossier, q, nature: vue === "arrhes" ? "arrhes" : null, affectation: libres })
    : [];
  const refDossier = dossier ? (dossierRef?.ref ?? factures[0]?.ref ?? reglements[0]?.ref ?? (attendues[0]?.ref as string | undefined) ?? null) : null;
  const resteListe = factures.reduce((a, f) => a + f.reste, 0);

  const texte = dossier
    ? solde ? `Dossier ${refDossier ?? ""} · ${solde.reste < 0 ? `crédit du client ${euros2(-solde.reste)}` : `reste à payer ${euros2(solde.reste)}`}` : ""
    : vue === "reglements" || vue === "arrhes"
      ? `${reglements.length} ${vue === "arrhes" ? "versement" : "règlement"}${reglements.length > 1 ? "s" : ""} · ${euros2(reglements.reduce((a, r) => a + r.montant, 0))}`
      : `Reste à payer sur cette liste : ${euros2(resteListe)}`;

  const vues = (
    <Pilules
      label="Vues de la facturation"
      items={[
        { href: lien({ vue: "factures" }), label: "Factures", actif: vue === "factures", nombre: compteurs.ouvertes || undefined },
        { href: lien({ vue: "reglements" }), label: "Règlements", actif: vue === "reglements", nombre: compteurs.reglements || undefined },
        { href: lien({ vue: "arrhes" }), label: "Arrhes", actif: vue === "arrhes", nombre: attendues.length || undefined },
      ]}
    />
  );

  const filtres: Filtre[] =
    vue === "factures"
      ? [
          { cle: "type", libelle: "Tous les types", options: (Object.keys(TYPES) as Type[]).map((k) => ({ valeur: k, libelle: TYPES[k].titre })) },
          ...(type === "avoirs" ? [] : [{ cle: "etat", libelle: "Tous les états", options: ETATS.map(([valeur, libelle]) => ({ valeur, libelle })) }]),
          { cle: "groupe", libelle: "Sans regroupement", options: [{ valeur: "payeur", libelle: "Par client payeur" }, { valeur: "origine", libelle: "Par client d'origine" }] },
        ]
      : vue === "reglements"
        ? [
            { cle: "mode", libelle: "Tous les modes", options: MODES.filter((m) => m.cle !== "autre").map((m) => ({ valeur: m.cle, libelle: m.court })) },
            { cle: "affectation", libelle: "Tous les règlements", options: [{ valeur: "libres", libelle: "Au crédit" }] },
          ]
        : [{ cle: "affectation", libelle: "Toutes les arrhes", options: [{ valeur: "libres", libelle: "À facturer" }, { valeur: "affectes", libelle: "Facturées ou déduites" }] }];

  // La recherche garde la vue, le dossier et les filtres en cours.
  const garder: Record<string, string | null> = { vue: vue === "factures" ? null : vue, dossier: dossier ? String(dossier) : null, type, etat, groupe, mode, affectation: libres };
  const recherche = (
    <form className={s.recherche} action="/factures" role="search">
      {Object.entries(garder).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input type="search" name="q" defaultValue={q ?? ""} placeholder="N°, client, dossier, chèque…" aria-label="Rechercher" />
      <button type="submit">Chercher</button>
    </form>
  );

  return (
    <div className={`view ${s.page}`}>
      <Bandeau
        surtitre={dossier ? `Facturation · dossier ${refDossier ?? ""}` : "Commercial · Facturation"}
        titre={vue === "reglements" ? "Règlements" : vue === "arrhes" ? "Arrhes" : type ? TYPES[type].titre : "Factures"}
        texte={texte}
        bas={
          <div className={s.filtresBas}>
            {vues}
            {/* Les filtres lisent l'adresse côté navigateur : une frontière Suspense. */}
            <Suspense>
              <Filtres filtres={filtres} garder={["dossier", "vue", "q"]} />
            </Suspense>
            {recherche}
          </div>
        }
      >
        {dossier && <Link href={`/dossiers/${dossier}#facturation`} data-ton="contour">Fiche du dossier</Link>}
        {dossier && <Link href="/factures" data-ton="contour">Toute la facturation</Link>}
      </Bandeau>
      {vue === "arrhes" && attendues.length > 0 && (
        <div className={s.encart}>
          <h4>Arrhes attendues · {attendues.length} dossier{attendues.length > 1 ? "s" : ""} signé{attendues.length > 1 ? "s" : ""} sans arrhes reçues</h4>
          <ul>
            {attendues.slice(0, 8).map((a) => (
              <li key={a.id as number}>
                <span><Link href={`/dossiers/${a.id}?encaisser=arrhes#facturation`}>{nomClient(a)}</Link> · {a.ref} · devis {a.numero} ({euros2(a.montant as number)})</span>
                <Link href={`/dossiers/${a.id}?encaisser=arrhes#facturation`}>Encaisser →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {vue === "factures" ? <TableFactures rows={factures} groupe={groupe} /> : <TableReglements rows={reglements} arrhes={vue === "arrhes"} />}
    </div>
  );
}
