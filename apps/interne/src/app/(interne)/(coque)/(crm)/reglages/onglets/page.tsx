import Bandeau from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { AvecMenu } from "@/ui/MenuVertical";
import { GROUPES } from "@/ui/navigation";
import { currentUser } from "@/crm/lib/auth";
import { membreConnecte } from "@/lib/droits";
import { estRoleAdmin } from "@/lib/roles-equipe";
import MenuReglages from "@/crm/reglages/MenuReglages";
import { surtitreReglages } from "@/crm/reglages/pages";
import { lireMasques } from "@/crm/onglets/donnees";
import { masquesPour } from "@/crm/onglets/regles";
import FormOnglets, { type RubriqueVue } from "@/crm/onglets/FormOnglets";
import s from "@/crm/onglets/onglets.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onglets du menu" };

/**
 * Réglages › Onglets (demande de David, 19/11/2026) : les rubriques de la
 * barre du haut et leurs pages, visibles ou masquées pour les agents et pour
 * les admins. Seuls les admins et le super admin les changent ; un agent voit
 * l'écran en lecture. Les règles : src/crm/onglets/regles.ts.
 */
export default async function Onglets({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const [moi, lignes] = await Promise.all([membreConnecte().catch(() => null), lireMasques()]);
  const admin = estRoleAdmin(moi?.role);
  const rubriques: RubriqueVue[] = GROUPES.map((g) => ({ titre: g.titre, pages: g.entrees.map((e) => ({ href: e.href, label: e.label, icone: e.icone })) }));
  const masques = { agent: masquesPour(lignes, "agent"), admin: masquesPour(lignes, "admin") };
  const resume = (n: number, qui: string) => (n ? `${n} page${n > 1 ? "s" : ""} masquée${n > 1 ? "s" : ""} pour les ${qui}` : `rien de masqué pour les ${qui}`);

  return (
    <div className="view">
      <Bandeau
        surtitre={surtitreReglages("/reglages/onglets")}
        titre="Onglets du menu"
        texte={`${resume(masques.agent.length, "agents")} · ${resume(masques.admin.length, "admins")}`}
      />
      <AvecMenu menu={<MenuReglages />}>
        <div className={s.page}>
          {sp.ok && (
            <p className={`${s.note} ${s.ok}`}>
              <Icone nom="coche" taille={17} className={s.noteIcone} />
              <span>
                <b>Enregistré.</b> Chacun voit son nouveau menu à sa prochaine page.
              </span>
            </p>
          )}
          {sp.erreur === "droits" && (
            <p className={`${s.note} ${s.erreur}`}>
              <Icone nom="alerte" taille={17} className={s.noteIcone} />
              <span>Seuls les admins règlent les onglets du menu : rien n&apos;a changé.</span>
            </p>
          )}
          <p className={s.note}>
            <Icone nom="oeil" taille={17} className={s.noteIcone} />
            <span>
              {admin ? (
                <>
                  Allumé, l&apos;onglet est dans le menu de ce rôle ; éteint, il en disparaît. L&apos;interrupteur d&apos;une rubrique règle toutes ses pages ; une rubrique
                  sans page visible quitte la barre du haut.{" "}
                </>
              ) : (
                <>Seuls les admins règlent les onglets du menu. </>
              )}
              <b>Le super admin voit toujours tout.</b> L&apos;accueil reste visible pour tous, les Réglages pour les admins. Une page masquée quitte le menu, mais
              s&apos;ouvre toujours depuis un lien (un devis depuis la fiche de son dossier…).
            </span>
          </p>
          <FormOnglets rubriques={rubriques} masques={masques} lecture={!admin} />
        </div>
      </AvecMenu>
    </div>
  );
}
