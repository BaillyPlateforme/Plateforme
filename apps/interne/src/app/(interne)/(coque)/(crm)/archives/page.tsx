import Bandeau, { Pilules } from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { AvecMenu } from "@/ui/MenuVertical";
import MenuReglages from "@/crm/reglages/MenuReglages";
import { surtitreReglages } from "@/crm/reglages/pages";
import { aArchiver, compteursArchivage, dossiersArchives } from "@/crm/archivage/donnees";
import { reglerDelaiArchivage } from "@/crm/archivage/actions";
import { AArchiver, Archives } from "@/crm/archivage/ListeClos";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import { reglageNombre } from "@/crm/exploitation/commun";
import { BarreBas, RechercheVerre } from "@/crm/exploitation/ui/Bas";
import u from "@/crm/exploitation/ui/ui.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Archivage" };

/*
 * L'archivage (Créagidem : module Archivage, « dossiers clos ») : les
 * dossiers archivés, consultables à part et restaurables, et ceux qu'on
 * propose d'archiver — perdus, ou terminés depuis le délai réglé. Un dossier
 * archivé quitte la liste des dossiers et le Kanban ; la recherche le
 * retrouve toujours.
 */
export default async function Archivage({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string }> }) {
  const sp = await searchParams;
  const vue = sp.vue === "archives" ? "archives" : "a_archiver";
  const texte = sp.q?.trim() || undefined;
  const [n, delai, proposes, archives] = await Promise.all([compteursArchivage(), reglageNombre("archivage_delai_jours"), vue === "a_archiver" ? aArchiver(texte) : null, vue === "archives" ? dossiersArchives(texte) : null]);
  const lien = (v: string) => `/archives?${new URLSearchParams({ ...(v !== "a_archiver" ? { vue: v } : {}), ...(sp.q ? { q: sp.q } : {}) })}`;
  const lignes = proposes?.lignes ?? archives ?? [];

  return (
    <div className="view">
      <Bandeau
        surtitre={surtitreReglages("/archives")}
        titre="Archivage"
        texte="Les dossiers clos, terminés ou perdus : rangés à part, consultables et restaurables."
        bas={
          <BarreBas>
            <Pilules
              label="Dossiers clos"
              items={[
                { href: lien("a_archiver"), label: "À archiver", actif: vue === "a_archiver", nombre: n.proposes },
                { href: lien("archives"), label: "Archivés", actif: vue === "archives", nombre: n.archives },
              ]}
            />
            <RechercheVerre action="/archives" valeur={sp.q} placeholder="Référence, client, e-mail…" garder={{ vue: vue === "archives" ? "archives" : undefined }} />
          </BarreBas>
        }
      />
      <AvecMenu menu={<MenuReglages />}>
        <div className={u.ecran}>
          {proposes && (
            <p className={u.message} data-ton="ambre">
              {proposes.delai
                ? `Sont proposés les dossiers perdus et ceux terminés depuis ${proposes.delai} jours au moins.`
                : "Aucun délai n'est réglé : tous les dossiers terminés et perdus sont proposés. Réglez un délai plus bas pour ne proposer que les plus anciens."}
            </p>
          )}
          <section className={`${u.carte} ${u.carteSerree}`}>
            {lignes.length === 0 ? (
              <div className={u.vide}>
                <i>
                  <Icone nom="archive" taille={24} />
                </i>
                <b>{vue === "archives" ? "Aucun dossier archivé." : "Aucun dossier à archiver."}</b>
              </div>
            ) : vue === "archives" ? (
              <Archives lignes={lignes} />
            ) : (
              <AArchiver lignes={lignes} />
            )}
          </section>
          <section className={u.carte}>
            <div className={u.carteTete}>
              <div>
                <h3>Délai avant archivage</h3>
                <p className={u.sousTitre}>Facultatif. Un dossier terminé n&apos;est proposé qu&apos;après ce délai (compté depuis la livraison). Vide : tous les dossiers terminés sont proposés.</p>
              </div>
            </div>
            <Formulaire action={reglerDelaiArchivage}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <div className={u.champ} style={{ gridColumn: "auto", width: 220 }}>
                  <label htmlFor="delai">Délai (jours)</label>
                  <input id="delai" type="number" min={0} step={1} name="delai" defaultValue={delai ?? ""} placeholder="Non renseigné" />
                </div>
                <button type="submit" className={u.bouton} data-ton="secondaire">
                  Enregistrer
                </button>
              </div>
            </Formulaire>
          </section>
        </div>
      </AvecMenu>
    </div>
  );
}
