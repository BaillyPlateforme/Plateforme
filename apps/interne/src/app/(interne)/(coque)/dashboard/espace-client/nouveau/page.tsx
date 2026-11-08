import Link from "next/link";
import { q } from "@/crm/lib/db";
import { ouvrirEspaceClient, ouvrirEspaceDepuisDemande } from "@/crm/actions-espace";
import { prealablesEspace } from "@/lib/espace-client/crm";
import { SEGMENTS, segmentDuCrm } from "@/lib/espace-client/segments";
import { Carte, LienBouton, Pastille, champ } from "../_composants/socle";
import EnTeteSection from "../../EnTeteSection";

export const metadata = { title: "Ouvrir un espace — Espace client — Bailly" };
export const dynamic = "force-dynamic";

type Ligne = {
  id: number; ref: string; statut: string; type: string; nom: string; prenom: string | null; societe: string | null; email: string | null;
  depart: string | null; arrivee: string | null; mois_ca: unknown; date_chargement: unknown; volume: number; commercial_id: number | null;
  commercial: string | null; type_demenagement: string | null; espace_id: string | null; espace_ref: string | null;
  /** Un client, un espace : les dossiers de l'espace que son client a déjà (même adresse e-mail), quand il en a un. */
  son_espace: string[] | null;
};

const STATUT: Record<string, string> = { prospect: "Nouveau", visite: "Visite à faire", devis: "Devis envoyé", commande: "Signé", planifie: "Planifié", termine: "Terminé" };

/**
 * « Ouvrir un espace » : un espace client s'ouvre depuis un dossier du CRM,
 * qui tient le client, le trajet, les dates et les devis. Cet écran liste les
 * dossiers du CRM, dit lesquels ont déjà leur espace et ce qui manque aux
 * autres. Un dossier nouveau se crée dans le CRM ; une demande du site y
 * entre depuis sa fiche (« Créer le dossier et ouvrir l'espace client »).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; demande?: string; tous?: string }> }) {
  const sp = await searchParams;
  const recherche = (sp.q ?? "").trim();
  const p: unknown[] = [];
  const w = ["d.statut <> 'perdu'"];
  if (recherche) {
    p.push(`%${recherche}%`);
    w.push(`(c.nom ilike $1 or c.prenom ilike $1 or c.societe ilike $1 or c.email ilike $1 or d.ref ilike $1)`);
  }
  if (sp.tous !== "1") w.push("e.id is null");
  const lignes = await q<Ligne>(
    `select d.id, d.ref, d.statut, c.type, c.nom, c.prenom, c.societe, c.email, d.mois_ca, d.date_chargement, d.volume::float8 as volume,
       d.commercial_id, u.nom as commercial, d.type_demenagement, e.id as espace_id, e.reference as espace_ref,
       (select array_agg(x.reference order by x.created_at) from public.ec_clients ec join public.ec_dossiers x on x.client_id = ec.id
         where ec.email = lower(btrim(c.email))) as son_espace,
       (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' and coalesce(adresse,'')<>'' order by ordre limit 1) as depart,
       (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' and coalesce(adresse,'')<>'' order by ordre desc limit 1) as arrivee
     from dossiers d join clients c on c.id=d.client_id left join utilisateurs u on u.id=d.commercial_id
     left join public.ec_dossiers e on e.crm_dossier_id=d.id
     where ${w.join(" and ")} order by d.maj_le desc, d.id desc limit 40`,
    p,
  );

  return (
    <div className="space-y-5">
      {/* Le bandeau de la section : le titre de l'écran et le retour à la liste des espaces. */}
      <EnTeteSection propre surtitre="Espace client" titre="Ouvrir un espace" texte="Les dossiers de vos clients, de la visite au SAV">
        <Link href="/dashboard/espace-client" data-ton="contour">
          Tous les espaces
        </Link>
      </EnTeteSection>
      {sp.demande && /^[0-9a-f-]{36}$/i.test(sp.demande) && (
        <Carte titre="Ouvrir l'espace d'une demande du site">
          <p className="text-[13px] text-ink-soft">
            Une demande du site entre dans le CRM avant d&apos;avoir son espace : le dossier reprend le client, le trajet et le volume, puis l&apos;espace s&apos;ouvre depuis sa fiche.
          </p>
          <form action={ouvrirEspaceDepuisDemande.bind(null, sp.demande)} className="mt-4">
            <button className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-semibold text-nuit transition hover:bg-brand-mid">
              Créer le dossier dans le CRM et ouvrir l&apos;espace client
            </button>
          </form>
        </Carte>
      )}

      <section className="relative isolate overflow-hidden rounded-[18px] bg-nuit p-6 text-white">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Un dossier, deux faces</p>
            <h2 className="mt-1 text-[24px] font-bold leading-tight tracking-tight">Un espace client s&apos;ouvre depuis un dossier du CRM</h2>
            <p className="mt-2 text-[13.5px] text-white/75">
              Le CRM tient le client, le trajet, les dates, les devis et les factures ; l&apos;espace en est la face tournée vers le client, avec ses documents, ses conditions de
              livraison, ses cartons et le SAV. Les demandes du site entrent dans le CRM depuis leur fiche.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dossiers/nouveau" className="inline-flex items-center rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-nuit transition hover:bg-brand-mid">
              + Nouveau dossier dans le CRM
            </Link>
            <Link href="/demandes" className="inline-flex items-center rounded-xl border border-white/25 px-4 py-2.5 text-[13.5px] font-medium transition hover:border-white">
              Demandes du site
            </Link>
          </div>
        </div>
      </section>

      <Carte
        titre={sp.tous === "1" ? `${lignes.length} dossier${lignes.length > 1 ? "s" : ""} du CRM` : `${lignes.length} dossier${lignes.length > 1 ? "s" : ""} sans espace client`}
        action={
          <form className="flex flex-wrap items-center gap-2" action="/dashboard/espace-client/nouveau">
            <input name="q" defaultValue={recherche} placeholder="Client, e-mail, BD-…" className={`${champ} !w-60`} aria-label="Rechercher un dossier du CRM" />
            <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <input type="checkbox" name="tous" value="1" defaultChecked={sp.tous === "1"} /> avec ceux qui ont un espace
            </label>
            <button className="rounded-xl border border-line-strong bg-card px-3.5 py-2 text-[13px] font-medium hover:border-ink">Chercher</button>
          </form>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-y border-line text-left text-[11.5px] text-ink-soft">
              <tr>
                {["Dossier CRM", "Client", "Trajet", "Commercial", "Pour ouvrir l'espace", ""].map((h) => (
                  <th key={h} className="px-5 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {lignes.map((l) => {
                const manque = prealablesEspace({ ...l, volume: Number(l.volume) || 0 }).filter((x) => !x.ok);
                const segment = SEGMENTS[segmentDuCrm(l.type)];
                return (
                  <tr key={l.id} className="hover:bg-subtle/50">
                    <td className="px-5 py-3">
                      <Link href={`/dossiers/${l.id}`} className="font-semibold tabular-nums hover:text-brand-ink">
                        {l.ref}
                      </Link>
                      <p className="text-[11.5px] text-ink-soft">{STATUT[l.statut] ?? l.statut}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{l.societe || [l.prenom, l.nom].filter(Boolean).join(" ")}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Pastille ton={segment.cle === "particulier" ? "neutre" : "noir"}>{segment.libelle}</Pastille>
                        {l.email && <span className="text-[11.5px] text-ink-soft">{l.email}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {l.depart ?? "—"} → {l.arrivee ?? "—"}
                    </td>
                    <td className="px-5 py-3">{l.commercial ?? <span className="text-ink-soft">—</span>}</td>
                    <td className="px-5 py-3">
                      {l.espace_id ? (
                        <Pastille ton="ok">{l.son_espace && l.son_espace.length > 1 ? `Dans son espace · ${l.son_espace.length} dossiers` : `Espace ouvert · ${l.espace_ref}`}</Pastille>
                      ) : l.son_espace?.length ? (
                        <span className="text-[12.5px]">
                          <Pastille ton="attente">À ajouter à son espace</Pastille>
                          <span className="mt-1 block text-[11.5px] text-ink-soft">
                            Son espace existe ({l.son_espace.join(", ")}){manque.length ? ` · manque : ${manque.map((x) => x.libelle.toLowerCase()).join(", ")}` : ""}
                          </span>
                        </span>
                      ) : manque.length ? (
                        <span className="text-[12.5px] text-brand-ink">À compléter : {manque.map((x) => x.libelle.toLowerCase()).join(", ")}</span>
                      ) : (
                        <Pastille ton="ok">Prêt</Pastille>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {l.espace_id ? (
                        <LienBouton href={`/dashboard/espace-client/dossiers/${l.espace_id}`}>Fiche de l&apos;espace</LienBouton>
                      ) : manque.length ? (
                        <LienBouton href={`/dossiers/${l.id}#espace-client`}>Compléter dans le CRM</LienBouton>
                      ) : (
                        <form action={ouvrirEspaceClient.bind(null, l.id)}>
                          <button className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-accent-dark">
                            {l.son_espace?.length ? "Ajouter à son espace" : <>Ouvrir l&apos;espace</>}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-ink-soft">
                    {recherche ? "Aucun dossier du CRM ne correspond." : "Tous les dossiers du CRM ont leur espace client."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Carte>
    </div>
  );
}
