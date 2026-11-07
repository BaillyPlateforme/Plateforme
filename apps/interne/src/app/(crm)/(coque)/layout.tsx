import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { currentUser } from "@/crm/lib/auth";
import { activiteRecente, relancesDevis, aPlanifier } from "@/crm/lib/data";
import { gmEnRetard } from "@/crm/lib/data2";
import { Ic } from "@/crm/lib/icons";
import { NavLinks, Tabs } from "@/crm/components/Nav";
import { NotifBell, type Notif } from "@/crm/components/NotifBell";
import Applications from "@/composants/Applications";
import { ilYa, nomClient } from "@/crm/lib/format";

export const dynamic = "force-dynamic";

/*
 * La coque du CRM : le rail de navigation à gauche (les rubriques du CRM), la
 * barre du haut — dont le menu des applications, qui mène à l'espace équipe et
 * à ce que voient les clients — et la page.
 * L'impression (/imprimer) est rangée hors de ce groupe : elle s'affiche sans
 * coque.
 */
export default async function CoqueCrm({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const [act, rel, plan, gm] = await Promise.all([activiteRecente(8), relancesDevis(), aPlanifier(), gmEnRetard()]);
  const items: Notif[] = [
    ...gm.map((g): Notif => ({ id: `g${g.id}`, kind: "todo", titre: `Garde-meuble non facturé : ${g.client}`, sous: `Échéance dépassée de ${g.retard} jours`, href: "/garde-meuble" })),
    ...plan.map((r): Notif => ({ id: `p${r.id}`, kind: "todo", titre: `Planifier ${nomClient(r)}`, sous: "Devis signé : confirmer la date au planning", href: `/dossiers/${r.id}` })),
    ...rel.map((r): Notif => ({ id: `r${r.id}`, kind: "todo", titre: `Relancer ${nomClient(r)}`, sous: `Devis envoyé il y a ${r.jours} jours, sans réponse`, href: `/dossiers/${r.id}` })),
    ...act.map((a, i): Notif => ({ id: `a${i}`, kind: "activite", titre: a.nom ? nomClient(a) : "Agence", sous: a.libelle, quand: ilYa(a.cree_le), href: a.dossier_id ? `/dossiers/${a.dossier_id}` : "/" })),
  ];
  return (
    <div className="app" data-layout="rail">
      <aside className="nav">
        <Link href="/" className="brand" title="Accueil du CRM"><i className="logo">B</i></Link>
        <NavLinks />
      </aside>
      <main className="main">
        <header className="top">
          <form action="/dossiers" className="search"><Ic n="search" /><input name="q" placeholder="Rechercher un client, un dossier, un devis…" /></form>
          <Tabs />
          <Link href="/dossiers/nouveau" className="btn primary"><Ic n="plus" />Nouveau dossier</Link>
          <Applications />
          <NotifBell items={items} />
          <form action={signOut}><button className="user-btn" title={`${user.nom} — se déconnecter`}><i className="av">{user.initiales}</i></button></form>
        </header>
        <div id="view">{children}</div>
      </main>
    </div>
  );
}
