import { listDossiers } from "@/crm/lib/data";
import { DossierTable } from "@/crm/components/DossierTable";
import { TYPES_PLURIEL } from "@/crm/lib/format";
import Bandeau, { Pilules } from "@/ui/Bandeau";

export const dynamic = "force-dynamic";

/*
 * La liste des clients et dossiers. Les filtres par type de client sont dans
 * la rangée du bas du bandeau, comme sur les autres listes (règle de David) :
 * ils étaient posés sous le bandeau, qui restait vide en bas.
 */
export default async function Dossiers({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const rows = await listDossiers({ q: sp.q, type: sp.type });
  const href = (type?: string) => `/dossiers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(type ? { type } : {}) })}`;
  return (
    <div className="view dossiers">
      <Bandeau
        surtitre={`Commercial · ${rows.length} dossier${rows.length > 1 ? "s" : ""}${sp.q ? ` pour « ${sp.q} »` : ""}`}
        titre="Clients & dossiers"
        texte="Chaque client, chaque déménagement : de la visite au devis, de la commande à la facture."
        action={{ label: "Nouveau dossier", href: "/dossiers/nouveau", icone: "plus" }}
        bas={
          <Pilules
            label="Type de client"
            items={[
              { href: href(), label: "Tous", actif: !sp.type },
              ...Object.entries(TYPES_PLURIEL).map(([k, v]) => ({ href: href(k), label: v, actif: sp.type === k })),
            ]}
          />
        }
      />
      <DossierTable rows={rows} />
    </div>
  );
}
