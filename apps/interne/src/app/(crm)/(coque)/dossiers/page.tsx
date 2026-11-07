import Link from "next/link";
import { listDossiers } from "@/crm/lib/data";
import { DossierTable } from "@/crm/components/DossierTable";
import { Ic } from "@/crm/lib/icons";
import { TYPES } from "@/crm/lib/format";

export const dynamic = "force-dynamic";

export default async function Dossiers({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const rows = await listDossiers({ q: sp.q, type: sp.type });
  const href = (type?: string) => `/dossiers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(type ? { type } : {}) })}`;
  return (
    <div className="view dossiers">
      <div className="page-h"><div><h1>Clients & dossiers</h1><p>{rows.length} dossier{rows.length > 1 ? "s" : ""}{sp.q ? ` pour « ${sp.q} »` : ""}</p></div>
        <Link href="/dossiers/nouveau" className="btn primary"><Ic n="plus" />Nouveau dossier</Link></div>
      <div className="filters"><Link href={href()} className={!sp.type ? "on" : ""}>Tous</Link>{Object.entries(TYPES).map(([k, v]) => <Link key={k} href={href(k)} className={sp.type === k ? "on" : ""}>{v}s</Link>)}</div>
      <DossierTable rows={rows} />
    </div>
  );
}
