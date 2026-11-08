import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { etatEnvois } from "@/lib/envois";
import MenuReglages from "@/crm/reglages/MenuReglages";
import { surtitreReglages } from "@/crm/reglages/pages";
import { cartesMessages } from "@/crm/messages/donnees";
import Marketplace from "@/crm/messages/Marketplace";

export const dynamic = "force-dynamic";

/**
 * Courriers et SMS : tous les messages de la plateforme, une carte par type
 * d'action — activable, modifiable, avec son déclencheur, son délai et son
 * nombre d'envois. Filtres par étape du parcours et par canal.
 *
 * Les filtres sont des liens (?etape=…&canal=…) : l'étape dans la rangée du
 * bas du bandeau (Pilules), le canal dans ses boutons. Une page de Réglages :
 * le menu de Réglages à gauche.
 */
export default async function Modeles({ searchParams }: { searchParams: Promise<{ etape?: string; canal?: string }> }) {
  const sp = await searchParams;
  const { cartes, etapes } = await cartesMessages();
  const canal = sp.canal === "sms" || sp.canal === "email" ? sp.canal : null;
  const etape = etapes.some((e) => e.cle === sp.etape) ? sp.etape! : null;
  const visibles = cartes.filter((c) => (!canal || c.canal === canal) && (!etape || c.etape === etape));
  const envois = etatEnvois();
  const lien = (p: { etape?: string | null; canal?: string | null }) => {
    const u = new URLSearchParams();
    const e = p.etape === undefined ? etape : p.etape;
    const c = p.canal === undefined ? canal : p.canal;
    if (e) u.set("etape", e);
    if (c) u.set("canal", c);
    const qs = u.toString();
    return `/modeles${qs ? `?${qs}` : ""}`;
  };
  const actifs = cartes.filter((c) => c.actif).length;
  const aValider = cartes.filter((c) => c.aValider).length;
  return (
    <div className="view">
      <Bandeau
        surtitre={surtitreReglages("/modeles")}
        titre="Courriers et SMS"
        texte={`${actifs} messages actifs sur ${cartes.length}${aValider ? ` · ${aValider} textes à valider` : ""} · envois : ${envois.libelle.toLowerCase()}`}
        bas={
          <Pilules
            label="Étape"
            items={[
              { href: lien({ etape: null }), label: "Toutes", actif: !etape, nombre: cartes.filter((c) => !canal || c.canal === canal).length },
              ...etapes
                .map((e) => ({ e, n: cartes.filter((c) => c.etape === e.cle && (!canal || c.canal === canal)).length }))
                .filter((x) => x.n > 0)
                .map(({ e, n }) => ({ href: lien({ etape: e.cle }), label: e.libelle, actif: etape === e.cle, nombre: n })),
            ]}
          />
        }
      >
        <Link href={lien({ canal: null })} data-ton={!canal ? "plein" : "contour"}>Tous</Link>
        <Link href={lien({ canal: "email" })} data-ton={canal === "email" ? "plein" : "contour"}>E-mail</Link>
        <Link href={lien({ canal: "sms" })} data-ton={canal === "sms" ? "plein" : "contour"}>SMS</Link>
      </Bandeau>
      <AvecMenu menu={<MenuReglages />}>
        <Marketplace cartes={visibles} etapes={etapes} />
      </AvecMenu>
    </div>
  );
}
