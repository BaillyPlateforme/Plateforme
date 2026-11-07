import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import { etatEnvois } from "@/lib/envois";
import { cartesMessages } from "@/crm/messages/donnees";
import Marketplace from "@/crm/messages/Marketplace";
import s from "@/crm/messages/messages.module.css";

export const dynamic = "force-dynamic";

/**
 * Courriers et SMS : tous les messages de la plateforme, une carte par type
 * d'action — activable, modifiable, avec son déclencheur, son délai et son
 * nombre d'envois. Filtres par étape du parcours et par canal.
 *
 * Les filtres sont des liens (?etape=…&canal=…) : à la fusion avec le design
 * « Quantum », ils passent dans la rangée du bas du Bandeau (Pilules).
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
        surtitre="Gestion"
        titre="Courriers et SMS"
        texte={`Chaque message de la plateforme, du questionnaire au SAV : ${actifs} actifs sur ${cartes.length}${aValider ? `, ${aValider} textes à valider` : ""}. Envois : ${envois.libelle.toLowerCase()}.`}
        secondaire={{ label: "Relances", href: "/relances" }}
      />
      <nav className={s.filtres} aria-label="Filtres">
        <div className={s.groupe}>
          <small>Étape</small>
          <Link className={s.pilule} href={lien({ etape: null })} aria-current={!etape ? "page" : undefined}>
            Toutes <i>{cartes.filter((c) => !canal || c.canal === canal).length}</i>
          </Link>
          {etapes.map((e) => {
            const n = cartes.filter((c) => c.etape === e.cle && (!canal || c.canal === canal)).length;
            return n ? (
              <Link key={e.cle} className={s.pilule} href={lien({ etape: e.cle })} aria-current={etape === e.cle ? "page" : undefined}>
                {e.libelle} <i>{n}</i>
              </Link>
            ) : null;
          })}
        </div>
        <div className={s.groupe}>
          <small>Canal</small>
          <Link className={s.pilule} href={lien({ canal: null })} aria-current={!canal ? "page" : undefined}>Tous</Link>
          <Link className={s.pilule} href={lien({ canal: "email" })} aria-current={canal === "email" ? "page" : undefined}>E-mail</Link>
          <Link className={s.pilule} href={lien({ canal: "sms" })} aria-current={canal === "sms" ? "page" : undefined}>SMS</Link>
        </div>
      </nav>
      <Marketplace cartes={visibles} etapes={etapes} />
    </div>
  );
}
