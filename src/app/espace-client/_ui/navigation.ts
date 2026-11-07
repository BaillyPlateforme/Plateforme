import type { Espace } from "@/lib/espace-client/espace";

/*
 * La navigation d'un dossier, calculée une fois pour toutes les pages : les
 * boutons pilule de la page de garde (et de chaque bandeau), la rangée de
 * liens à puces du bas. Une rubrique masquée pour un grand compte n'apparaît
 * nulle part.
 */

export type Pilule = { cle: string; label: string; href: string; point?: boolean };

export function pilules(e: Espace): Pilule[] {
  const base = `/espace-client/${e.dossier.reference}`;
  const out: Pilule[] = [{ cle: "accueil", label: "Mon déménagement", href: base }];
  if (e.vis.devis) out.push({ cle: "devis", label: "Mes devis", href: `${base}/devis` });
  out.push({ cle: "documents", label: "Mes documents", href: `${base}/documents`, point: e.vis.documentsAFaire > 0 });
  if (e.vis.factures) out.push({ cle: "factures", label: "Mes factures", href: e.vis.devis ? `${base}/devis#factures` : `${base}/devis` });
  out.push({ cle: "cartons", label: "Mes cartons", href: `${base}/cartons` });
  return out;
}

export function liensBas(e: Espace): { label: string; href: string; externe?: boolean }[] {
  const base = `/espace-client/${e.dossier.reference}`;
  return [
    { label: "Mon conseiller", href: `${base}/conseiller` },
    { label: "Mes tutos", href: `${base}/tutos` },
    { label: "Services complémentaires", href: `${base}/services` },
    ...(e.vis.conteneur ? [{ label: "Mon conteneur", href: `${base}/conteneur` }] : []),
    { label: "SAV", href: `${base}/sav` },
    { label: "Confidentialité", href: `${base}/documents#cgv` },
    { label: "Déconnexion", href: "/espace-client/deconnexion", externe: true },
  ];
}
