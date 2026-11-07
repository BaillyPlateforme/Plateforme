import Link from "next/link";
import { Ic } from "@/crm/lib/icons";

/** Un dossier introuvable (supprimé, ou un numéro mal recopié) : on reste dans la coque du CRM. */
export default function DossierIntrouvable() {
  return (
    <div className="soon">
      <div className="orb"><Ic n="search" /></div>
      <h1>Page introuvable</h1>
      <p>Ce dossier n&apos;existe pas, ou plus. Retrouvez-le depuis la liste des dossiers.</p>
      <div className="sec-actions" style={{ justifyContent: "center", marginTop: 22 }}>
        <Link href="/dossiers" className="btn primary">Clients & dossiers</Link>
      </div>
    </div>
  );
}
