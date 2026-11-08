import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { etatEnvois } from "@/lib/envois";
import { abonneDOffice, estAbonne, jetonDesabonnement, lireEtat, texteAlerte } from "@/lib/alertes-equipe";
import { ALERTES, alerteDe, GROUPES } from "@/lib/alertes-equipe/catalogue";
import { currentUser } from "@/crm/lib/auth";
import { q } from "@/crm/lib/db";
import { Catalogue, Destinataires, Matrice, type AlerteVue, type DestVue } from "@/crm/alertes/Alertes";
import { dossierDuFiltre, MenuRelances } from "@/crm/relances/Section";
import s from "@/crm/relances/relances.module.css";

export const dynamic = "force-dynamic";

const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * Les alertes de l'équipe : qui reçoit quoi. Les destinataires (l'équipe,
 * lue dans team_members, et des adresses ajoutées à la main), le catalogue
 * des alertes internes (une par événement, activable, avec son texte), la
 * matrice des abonnements, et le journal des alertes parties.
 */
export default async function AlertesEquipe({ searchParams }: { searchParams: Promise<{ dossier?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const dossier = dossierDuFiltre(sp.dossier);
  const [etat, journal] = await Promise.all([
    lireEtat(q),
    q<{ id: number; alerte: string; evenement: string; reference: string | null; destinataires: number; resume: string | null; cree_le: string }>(
      "select id, alerte, evenement, reference, destinataires, resume, cree_le::text from alertes_evenements order by cree_le desc, id desc limit 40",
    ).catch(() => []),
  ]);
  const envoi = etatEnvois();
  const liens = !!jetonDesabonnement("verification@bailly.fr", ALERTES[0].cle);

  const dests: DestVue[] = (etat?.destinataires ?? []).map((d) => ({
    ...d,
    abonnements: Object.fromEntries(
      ALERTES.map((a) => [a.cle, { abonne: etat ? estAbonne(etat, d.cle, a.cle) : false, office: etat ? !etat.abonnements.has(`${d.cle}|${a.cle}`) && abonneDOffice(a, d.cle) : false }]),
    ),
  }));
  const alertes: AlerteVue[] = ALERTES.map((a) => {
    const reglage = etat?.reglages.get(a.cle) ?? null;
    const t = texteAlerte(a, reglage);
    return {
      cle: a.cle, titre: a.titre, groupe: a.groupe, quand: a.quand, branchee: a.branchee, ou: a.ou,
      texte: a.texteCode ? "code" : reglage?.valide && reglage.corps?.trim() ? "valide" : "neutre",
      actif: reglage?.actif ?? true,
      abonnes: dests.filter((d) => !d.enPause && d.abonnements[a.cle]?.abonne).length,
      variables: a.variables, objet: t.objet, corps: t.corps,
    };
  });
  const branchees = ALERTES.filter((a) => a.branchee).length;
  const actives = alertes.filter((a) => a.actif).length;

  return (
    <div className="view">
      <Bandeau
        surtitre="Commercial · Relances · Configuration"
        titre="Alertes de l’équipe"
        texte={`${ALERTES.length} alertes · ${branchees} branchées · ${actives} actives · ${dests.filter((d) => !d.enPause).length} destinataires actifs`}
        etiquettes={[`Envoi : ${envoi.libelle.toLowerCase()}`]}
        bas={
          <Pilules
            label="Aller à"
            items={[
              { href: "#destinataires", label: "Destinataires" },
              { href: "#catalogue", label: "Catalogue des alertes" },
              { href: "#abonnements", label: "Abonnements" },
              { href: "#journal", label: "Journal" },
            ]}
          />
        }
      >
        <Link href="/dashboard/envois" data-ton="contour">Journal des envois</Link>
        <Link href="/relances/configuration" data-ton="contour">Règles des relances</Link>
      </Bandeau>
      <AvecMenu menu={<MenuRelances page="alertes" dossier={dossier} />}>
        <div className={s.page}>
          {!etat && <p className={s.provisoire}>Les abonnements ne se lisent pas (base injoignable ?) : les alertes qui existaient partent comme avant, les nouvelles ne partent pas.</p>}
          <div className={s.provisoire}>
            <i>i</i>
            <span>
              <b>Ce qui part, et à qui.</b> Chaque alerte part par e-mail aux seules adresses abonnées et actives, par le module d’envoi de la plateforme (aujourd’hui :{" "}
              {envoi.libelle.toLowerCase()} — {envoi.detail}), avec une clé par événement et par destinataire et un lien de désabonnement
              {liens ? "" : " (absent : ni ALERTES_SECRET ni clé de service pour signer le jeton)"}. Les alertes qui existaient gardent leurs destinataires d’avant (abonnés d’office) ;
              les nouvelles n’ont aucun abonné tant que l’équipe ne coche rien. Leurs textes neutres sont <b>à valider</b>.
            </span>
          </div>

          <div className={s.grille}>
            <section id="destinataires" className={`${s.carte} ${s.c5}`} style={{ scrollMarginTop: 190, alignSelf: "start" }}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Destinataires</p>
                  <h2 className={s.titre}>Les adresses de l’équipe</h2>
                  <p className={s.sous}>Les membres actifs de l’équipe (lus, sans y écrire), le conseiller de chaque dossier, et des adresses ajoutées à la main — une boîte commune, par exemple.</p>
                </div>
              </div>
              <Destinataires dests={dests} />
            </section>
            <section id="catalogue" className={`${s.carte} ${s.c7}`} style={{ scrollMarginTop: 190 }}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Catalogue</p>
                  <h2 className={s.titre}>Une alerte par événement</h2>
                  <p className={s.sous}>Désactivée, une alerte ne part plus pour personne, quels que soient les abonnements.</p>
                </div>
              </div>
              <Catalogue alertes={alertes} groupes={GROUPES} />
            </section>
            <section id="abonnements" className={`${s.carte} ${s.c12}`} style={{ scrollMarginTop: 190 }}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Abonnements</p>
                  <h2 className={s.titre}>Qui reçoit quoi</h2>
                  <p className={s.sous}>Chaque adresse s’abonne ou se désabonne, alerte par alerte. Chaque e-mail d’alerte porte aussi son lien de désabonnement.</p>
                </div>
              </div>
              <Matrice dests={dests} alertes={alertes} />
            </section>
            <section id="journal" className={`${s.carte} ${s.c12}`} style={{ scrollMarginTop: 190 }}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Journal</p>
                  <h2 className={s.titre}>Les dernières alertes déclenchées</h2>
                  <p className={s.sous}>Chaque message lui-même, parti ou retenu, est au journal des envois.</p>
                </div>
                <Link className={s.lien} href="/dashboard/envois">Journal des envois</Link>
              </div>
              {journal.length === 0 ? (
                <p className={s.aide}>Aucune alerte déclenchée pour l’instant.</p>
              ) : (
                <table className={s.journal}>
                  <thead>
                    <tr>
                      <th>Quand</th>
                      <th>Alerte</th>
                      <th>Référence</th>
                      <th>Destinataires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.map((j) => (
                      <tr key={j.id}>
                        <td>{quand(j.cree_le)}</td>
                        <td>
                          <b>{alerteDe(j.alerte)?.titre ?? j.alerte}</b>
                        </td>
                        <td>{j.reference ?? "—"}</td>
                        <td>{j.resume ?? j.destinataires}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      </AvecMenu>
    </div>
  );
}
