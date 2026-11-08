import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import MenuVertical, { AvecMenu } from "@/ui/MenuVertical";
import { currentUser } from "@/crm/lib/auth";
import { q1 } from "@/crm/lib/db";
import { arrhesAttendues, compteursFacturation, listeFactures, listeReglements, soldeDossier } from "@/crm/facturation/donnees";
import { TableFactures, TableReglements } from "@/crm/facturation/Listes";
import { MODES, euros2 } from "@/crm/facturation/calcul";
import { nomClient } from "@/crm/lib/format";
import s from "@/crm/facturation/facturation.module.css";

export const dynamic = "force-dynamic";

/*
 * La facturation (Créagidem, §Q) : les factures et les avoirs, à plat ou
 * rangés par client payeur ou par client d'origine ; les factures d'arrhes ;
 * les règlements ; les arrhes. Les sous-vues sont dans le menu vertical, les
 * filtres dans la rangée du bas du bandeau. Ouverte depuis un dossier
 * (?dossier=), elle ne montre que lui.
 */
type Vue = "factures" | "acomptes" | "avoirs" | "reglements" | "arrhes";
const VUES: Vue[] = ["factures", "acomptes", "avoirs", "reglements", "arrhes"];
const TITRES: Record<Vue, string> = { factures: "Factures", acomptes: "Factures d'arrhes", avoirs: "Avoirs", reglements: "Règlements", arrhes: "Arrhes" };
const ETATS = [["", "Toutes"], ["ouvertes", "À régler"], ["partielle", "Réglées en partie"], ["retard", "En retard"], ["soldee", "Soldées"], ["annulee", "Annulées"]] as const;

export default async function Factures({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await currentUser();
  const sp = await searchParams;
  const vue: Vue = VUES.includes(sp.vue as Vue) ? (sp.vue as Vue) : "factures";
  const dossier = sp.dossier && /^\d+$/.test(sp.dossier) ? Number(sp.dossier) : null;
  const groupe = sp.groupe === "payeur" || sp.groupe === "origine" ? sp.groupe : null;
  const etat = ETATS.some(([k]) => k && k === sp.etat) ? sp.etat! : null;
  const mode = MODES.some((m) => m.cle === sp.mode) ? sp.mode! : null;
  const libres = sp.affectation === "libres" ? "libres" : sp.affectation === "affectes" ? "affectes" : null;
  const q = sp.q?.trim().slice(0, 80) || null;

  // L'adresse d'une vue, avec ses filtres : le dossier ouvert et la recherche suivent toujours.
  const lien = (o: Record<string, string | null | undefined>) => {
    const u = new URLSearchParams();
    const tout = { vue, dossier: dossier ? String(dossier) : null, q, ...o };
    for (const [k, v] of Object.entries(tout)) if (v && !(k === "vue" && v === "factures")) u.set(k, v);
    const x = u.toString();
    return `/factures${x ? `?${x}` : ""}`;
  };

  const [compteurs, solde, dossierRef] = await Promise.all([
    compteursFacturation(dossier),
    dossier ? soldeDossier(dossier) : Promise.resolve(null),
    // La référence du dossier, même sans facture ni règlement à lister (le bandeau disait « Dossier · reste à payer »).
    dossier ? q1<{ ref: string }>("select ref from dossiers where id=$1", [dossier]) : Promise.resolve(undefined),
  ]);
  const genres = vue === "acomptes" ? ["acompte"] : vue === "avoirs" ? ["avoir"] : ["facture", "solde", "acompte"];
  const factures = vue === "factures" || vue === "acomptes" || vue === "avoirs" ? await listeFactures({ genres, etat: vue === "avoirs" ? null : etat, dossier, q }) : [];
  const reglements = vue === "reglements" || vue === "arrhes"
    ? await listeReglements({ mode, dossier, q, nature: vue === "arrhes" ? "arrhes" : null, affectation: libres })
    : [];
  const attendues = vue === "arrhes" ? await arrhesAttendues(dossier) : [];
  const refDossier = dossier ? (dossierRef?.ref ?? factures[0]?.ref ?? reglements[0]?.ref ?? (attendues[0]?.ref as string | undefined) ?? null) : null;
  const resteListe = factures.reduce((a, f) => a + f.reste, 0);

  const texte = dossier
    ? solde ? `Dossier ${refDossier ?? ""} · ${solde.reste < 0 ? `crédit du client ${euros2(-solde.reste)}` : `reste à payer ${euros2(solde.reste)}`}` : ""
    : vue === "reglements" || vue === "arrhes"
      ? `${reglements.length} ${vue === "arrhes" ? "versement" : "règlement"}${reglements.length > 1 ? "s" : ""} · ${euros2(reglements.reduce((a, r) => a + r.montant, 0))}`
      : `Reste à payer sur cette liste : ${euros2(resteListe)}`;

  const recherche = (
    <form className={s.recherche} action="/factures" role="search">
      {vue !== "factures" && <input type="hidden" name="vue" value={vue} />}
      {dossier && <input type="hidden" name="dossier" value={dossier} />}
      {etat && <input type="hidden" name="etat" value={etat} />}
      {groupe && <input type="hidden" name="groupe" value={groupe} />}
      {mode && <input type="hidden" name="mode" value={mode} />}
      <input type="search" name="q" defaultValue={q ?? ""} placeholder="N°, client, dossier, chèque…" aria-label="Rechercher" />
      <button type="submit">Chercher</button>
    </form>
  );

  const filtres =
    vue === "factures" || vue === "acomptes" ? (
      <Pilules label="État des factures" items={ETATS.map(([k, l]) => ({ href: lien({ etat: k || null, groupe }), label: l, actif: (etat ?? "") === k }))} />
    ) : vue === "reglements" ? (
      <Pilules label="Mode de règlement" items={[{ href: lien({ affectation: null }), label: "Tous", actif: !mode && !libres }, ...MODES.filter((m) => m.cle !== "autre").map((m) => ({ href: lien({ mode: m.cle }), label: m.court, actif: mode === m.cle })), { href: lien({ affectation: "libres" }), label: "Au crédit", actif: libres === "libres" }]} />
    ) : vue === "arrhes" ? (
      <Pilules label="Arrhes" items={[{ href: lien({}), label: "Toutes", actif: !libres }, { href: lien({ affectation: "libres" }), label: "À facturer", actif: libres === "libres" }, { href: lien({ affectation: "affectes" }), label: "Facturées ou déduites", actif: libres === "affectes" }]} />
    ) : null;

  const menu = (
    <MenuVertical
      titre="Facturation"
      groupes={[
        {
          titre: "Documents",
          items: [
            { href: lien({ vue: "factures", groupe: null }), label: "Factures", icone: "facture", actif: vue === "factures" && !groupe, nombre: compteurs.ouvertes },
            { href: lien({ vue: "factures", groupe: "payeur" }), label: "Par client payeur", icone: "clients", actif: vue === "factures" && groupe === "payeur" },
            { href: lien({ vue: "factures", groupe: "origine" }), label: "Par client d'origine", icone: "dossierClient", actif: vue === "factures" && groupe === "origine" },
            { href: lien({ vue: "acomptes", groupe: null }), label: "Factures d'arrhes", icone: "devis", actif: vue === "acomptes", nombre: compteurs.acomptes },
            { href: lien({ vue: "avoirs", groupe: null }), label: "Avoirs", icone: "commande", actif: vue === "avoirs", nombre: compteurs.avoirs },
          ],
        },
        {
          titre: "Encaissements",
          items: [
            { href: lien({ vue: "reglements", groupe: null }), label: "Règlements", icone: "euro", actif: vue === "reglements", nombre: compteurs.reglements },
            { href: lien({ vue: "arrhes", groupe: null }), label: "Arrhes", icone: "horloge", actif: vue === "arrhes", nombre: attendues.length || undefined },
          ],
        },
      ]}
    />
  );

  return (
    <div className={`view ${s.page}`}>
      <Bandeau
        surtitre={dossier ? `Facturation · dossier ${refDossier ?? ""}` : "Commercial · Facturation"}
        titre={TITRES[vue]}
        texte={texte}
        bas={<div className={s.filtresBas}>{filtres}{recherche}</div>}
      >
        {dossier && <Link href={`/dossiers/${dossier}#facturation`} data-ton="contour">Fiche du dossier</Link>}
        {dossier && <Link href="/factures" data-ton="contour">Toute la facturation</Link>}
        <Link href="/dashboard/parametres#facturation" data-ton="contour">Mentions et conditions</Link>
      </Bandeau>
      <AvecMenu menu={menu}>
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
        {vue === "reglements" || vue === "arrhes" ? <TableReglements rows={reglements} arrhes={vue === "arrhes"} /> : <TableFactures rows={factures} groupe={vue === "factures" ? groupe : null} />}
      </AvecMenu>
    </div>
  );
}
