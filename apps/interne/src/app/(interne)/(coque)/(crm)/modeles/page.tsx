import { Suspense } from "react";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import Filtres from "@/ui/Filtres";
import { AvecMenu } from "@/ui/MenuVertical";
import { etatEnvois } from "@/lib/envois";
import MenuReglages from "@/crm/reglages/MenuReglages";
import { surtitreReglages } from "@/crm/reglages/pages";
import { cartesMessages } from "@/crm/messages/donnees";
import Marketplace from "@/crm/messages/Marketplace";
import s from "@/crm/messages/messages.module.css";

export const dynamic = "force-dynamic";

/**
 * Courriers et SMS : tous les messages de la plateforme, une carte par type
 * d'action — activable, modifiable, avec son déclencheur, son délai et son
 * nombre d'envois. Depuis le 08/11/2026, la page reprend aussi l'ancienne
 * messagerie (/dashboard/messagerie, qui y mène) : chaque modèle des
 * questionnaires a sa carte, se crée (« Nouveau modèle »), se supprime, porte
 * sa règle d'envoi et ses conditions ; tout message se teste (« Tester un
 * envoi », « Tester l'envoi » sur chaque carte).
 *
 * Les filtres sont des liens (?etape=…&canal=…) : l'étape en pilules et le
 * canal en liste, dans la rangée du bas du bandeau. Une page de Réglages : le
 * menu de Réglages à gauche.
 */
export default async function Modeles({ searchParams }: { searchParams: Promise<{ etape?: string; canal?: string; nouveau?: string; tester?: string }> }) {
  const sp = await searchParams;
  const { cartes, etapes, modeles } = await cartesMessages();
  const canal = sp.canal === "sms" || sp.canal === "email" ? sp.canal : null;
  const etape = etapes.some((e) => e.cle === sp.etape) ? sp.etape! : null;
  const visibles = cartes.filter((c) => (!canal || c.canal === canal) && (!etape || c.etape === etape));
  const envois = etatEnvois();
  const lien = (p: { etape?: string | null; canal?: string | null; nouveau?: boolean; tester?: boolean } = {}) => {
    const u = new URLSearchParams();
    const e = p.etape === undefined ? etape : p.etape;
    const c = p.canal === undefined ? canal : p.canal;
    if (e) u.set("etape", e);
    if (c) u.set("canal", c);
    if (p.nouveau) u.set("nouveau", "1");
    if (p.tester) u.set("tester", "1");
    const qs = u.toString();
    return `/modeles${qs ? `?${qs}` : ""}`;
  };
  // Pour chaque modèle des questionnaires, les règles qui l'envoient : son texte vaut pour toutes.
  const partages: Record<string, string[]> = {};
  for (const c of cartes) if (c.regle && c.modeleId) (partages[c.modeleId] ??= []).push(c.regle.name);
  const creer = sp.nouveau === "1";
  const testLibre = sp.tester === "1";
  const actifs = cartes.filter((c) => c.actif).length;
  const aValider = cartes.filter((c) => c.aValider).length;
  return (
    <div className="view">
      <Bandeau
        surtitre={surtitreReglages("/modeles")}
        titre="Courriers et SMS"
        texte={`${actifs} messages actifs sur ${cartes.length}${aValider ? ` · ${aValider} textes à valider` : ""} · envois : ${envois.libelle.toLowerCase()}`}
        action={{ label: "Nouveau modèle", href: lien({ nouveau: true }), icone: "plus" }}
        secondaire={{ label: "Tester un envoi", href: lien({ tester: true }) }}
        bas={
          <div className={s.basBandeau}>
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
            {/* Les filtres lisent l'adresse côté navigateur : une frontière Suspense. */}
            <Suspense>
              <Filtres filtres={[{ cle: "canal", libelle: "Tous les canaux", options: [{ valeur: "email", libelle: "E-mail" }, { valeur: "sms", libelle: "SMS" }] }]} garder={["etape"]} />
            </Suspense>
          </div>
        }
      />
      <AvecMenu menu={<MenuReglages />}>
        <Marketplace
          key={`${creer}-${testLibre}`}
          cartes={visibles}
          etapes={etapes}
          modeles={modeles}
          partages={partages}
          creer={creer}
          testLibre={testLibre}
          lienSansFenetre={lien()}
        />
      </AvecMenu>
    </div>
  );
}
