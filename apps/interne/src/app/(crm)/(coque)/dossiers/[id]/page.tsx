import Link from "next/link";
import Bandeau, { Etapes } from "@/ui/Bandeau";
import MenuActions from "@/ui/MenuActions";
import { notFound } from "next/navigation";
import { getDossier } from "@/crm/lib/data";
import { q, type Row } from "@/crm/lib/db";
import { Ic } from "@/crm/lib/icons";
import { emballages } from "@/crm/lib/tarif";
import { eur, m3, nomClient, dateFr, ilYa, STATUTS, TYPES } from "@/crm/lib/format";
import * as A from "@/crm/actions";
import * as B from "@/crm/actions2";
import { litiges as getLitiges } from "@/crm/lib/data2";
import GalerieChantier from "@/terrain/composants/GalerieChantier";
import { EspaceClient } from "@/crm/components/EspaceClient";
import { EtatSmsRdv } from "@/crm/rdv/EtatSmsRdv";
import { etatsRdv } from "@/crm/rdv/sms";
import EnregistrerModele from "@/crm/creation/EnregistrerModele";
import SectionVisite from "@/crm/visites/composants/SectionVisite";
import ChampPrestataire from "@/crm/partenaires/ChampPrestataire";

export const dynamic = "force-dynamic";

const GENRE: Record<string, string> = { depart: "Départ", garde_meuble: "Garde-meuble", arrivee: "Arrivée", autre: "Étape" };
const TYPE_D: Record<string, string> = { national: "National", international: "International", maritime: "Maritime", aerien: "Aérien", gm: "Garde-meuble", bureau: "Bureau" };
const STEPS = ["Fiche client", "Visite technique", "Devis", "Commande", "Lettres de voiture", "Facture"];
const STEP_OF: Record<string, number> = { prospect: 0, visite: 1, devis: 2, commande: 3, planifie: 4, termine: 5, perdu: 2 };
const DEVIS_ST: Record<string, string> = { brouillon: "Brouillon", envoye: "Envoyé", signe: "Signé", refuse: "Non retenu" };
const LV_ST: Record<string, string> = { a_planifier: "À planifier", planifiee: "Planifiée", en_cours: "En cours", livree: "Livrée" };
const DESTS = ["Arrivée", "Garde-meuble", "Don", "Déchetterie", "Autre adresse"];

export default async function Fiche({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ espace?: string; m?: string; visite?: string; vm?: string; vc?: string; vd?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const d = await getDossier(id);
  if (!d) notFound();
  const lit = await getLitiges(id);
  const etatsSms = await etatsRdv(d.rdvs.map((r: Row) => r.id));
  const users = await q("select id,nom,role from utilisateurs order by id");
  const step = STEP_OF[d.statut];
  const emb = emballages(d.volume);
  const pieces = [...new Set(d.inv.map((i: Row) => i.piece))] as string[];
  const signe = d.devis.find((v: Row) => v.statut === "signe");
  const arrhes = d.paiements.reduce((a: number, p: Row) => a + p.montant, 0);
  const moisCa = d.mois_ca ? new Date(d.mois_ca).toISOString().slice(0, 7) : "";
  const salut = d.civilite === "Madame" ? "Madame" : d.civilite === "Monsieur" ? "Monsieur" : "Bonjour";
  const mailto = `mailto:${d.email ?? ""}?subject=${encodeURIComponent(`Votre devis de déménagement ${d.ref}`)}&body=${encodeURIComponent(
    `${salut} ${d.nom},\n\nSuite à notre rencontre, veuillez trouver nos propositions pour votre déménagement de ${d.stops[0]?.adresse ?? ""} vers ${d.stops[d.stops.length - 1]?.adresse ?? ""} (${m3(d.volume)}) :\n\n` +
    d.devis.map((v: Row) => `• ${v.formule[0].toUpperCase() + v.formule.slice(1)} : ${eur(v.montant)}`).join("\n") +
    `\n\nLes arrhes s'élèvent à 30 % de la formule retenue. Je reste à votre disposition.\n\nCordialement,\n${d.commercial ?? "Bailly Déménagement"}`)}`;
  const apresCommande = ["commande", "planifie", "termine"].includes(d.statut);
  // Le solde : ce que le client doit encore. Le plus grand du montant signé et du total facturé, moins les règlements.
  const montantSigne = d.devis.filter((v: Row) => v.statut === "signe").reduce((a: number, v: Row) => a + Number(v.montant ?? 0), 0);
  const facture = d.factures.reduce((a: number, f: Row) => a + Number(f.montant ?? 0), 0);
  const regle = d.paiements.reduce((a: number, x: Row) => a + Number(x.montant ?? 0), 0);
  const solde = Math.max(0, Math.max(montantSigne, facture) - regle);
  // Un espace client ouvert : l'e-mail du client est son identifiant de connexion, il se modifie depuis l'espace.
  const espaceOuvert = !!(await q("select 1 from public.ec_dossiers where crm_dossier_id=$1 limit 1", [id]).catch(() => [])).length;

  return (
    <div className="view dossier">
      <Bandeau
        surtitre={`Dossier ${d.ref}`}
        titre={nomClient(d)}
        texte={[d.telephone, `${d.stops[0]?.adresse ?? "—"} → ${d.stops[d.stops.length - 1]?.adresse ?? "—"}`, m3(d.volume)].filter(Boolean).join(" · ")}
        etiquettes={[
          STATUTS[d.statut].label,
          TYPES[d.type],
          `Commercial · ${d.commercial ?? "—"}`,
          `Traité par · ${d.traite_par ?? "—"}`,
          TYPE_D[d.type_demenagement] ?? "National",
          d.vehicule && "Carte grise + assurance à fournir",
        ]}
        bas={
          <Etapes
            label="Étapes du dossier"
            items={STEPS.map((l, i) => ({
              label: l,
              etat: d.statut === "perdu" ? "avenir" : i < step || d.statut === "termine" ? "fait" : i === step ? "encours" : "avenir",
            }))}
          />
        }
      >
        <Link href="#facturation" data-ton="contour" title="Ce que le client doit encore : montant signé (ou facturé), moins les règlements reçus">Solde · {eur(solde)}</Link>
        <Link href={`/parcours/${id}`} data-ton="contour">Parcours</Link>
        <Link href={`/imprimer/${id}?doc=fiche`} data-ton="contour"><Ic n="pdf" />&nbsp;Fiche PDF</Link>
        <EnregistrerModele dossier={{ id, ref: d.ref, type: d.type, type_demenagement: d.type_demenagement, volume: d.volume, vehicule: d.vehicule, garde_meuble: d.stops.some((x: Row) => x.genre === "garde_meuble"), observations: d.observations ?? null }} />
        {/* Les gestes secondaires, rangés dans « ⋯ » pour que les boutons tiennent sur deux lignes. */}
        <MenuActions>
          <form action={A.dupliquerDossier.bind(null, id)}><button>Dupliquer le dossier</button></form>
          {d.statut === "perdu"
            ? <form action={A.rouvrir.bind(null, id)}><button>Rouvrir le dossier</button></form>
            : d.statut !== "termine" && <form action={A.marquerPerdu.bind(null, id)}><button data-danger>Marquer perdu</button></form>}
        </MenuActions>
      </Bandeau>

      {d.statut === "perdu" && <div className="alert">Ce dossier est marqué perdu. Il reste consultable et peut être rouvert.</div>}


      <div className="d-grid">
        <form action={A.majFiche.bind(null, id)} style={{ display: "contents" }}>
          <section className="card route" style={{ gridColumn: "span 12" }}>
            <h3>Client</h3>
            <div className="form-grid">
              <div className="fld w2"><label>Civilité</label><select name="client_civilite" defaultValue={d.civilite ?? ""}><option value="">—</option><option>Madame</option><option>Monsieur</option></select></div>
              <div className="fld w3"><label>Prénom</label><input type="text" name="client_prenom" defaultValue={d.prenom ?? ""} /></div>
              <div className="fld w3"><label>Nom</label><input type="text" name="client_nom" defaultValue={d.nom ?? ""} required /></div>
              <div className="fld w4"><label>Société</label><input type="text" name="client_societe" defaultValue={d.societe ?? ""} placeholder="Pour un compte ou un partenaire" /></div>
              <div className="fld w4"><label>Téléphone</label><input type="tel" name="client_telephone" defaultValue={d.telephone ?? ""} /></div>
              <div className="fld w8"><label>E-mail</label><input type="email" name="client_email" defaultValue={d.email ?? ""} readOnly={espaceOuvert} title={espaceOuvert ? "Identifiant de connexion de l’espace client : il se modifie depuis la fiche de l’espace" : undefined} /></div>
            </div>
          </section>
          <section className="card route">
            <h3>Itinéraire & période</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {d.stops.map((s: Row) => (
                <div key={s.id} className="rowform">
                  <div className="fld" style={{ maxWidth: 120 }}><label>{GENRE[s.genre]}</label><span className="sub">{s.ascenseur ? "avec ascenseur" : ""}</span></div>
                  <div className="fld" style={{ flex: 3 }}><input type="text" name={`adresse_${s.id}`} defaultValue={s.adresse ?? ""} placeholder="Adresse" /></div>
                  <div className="fld" style={{ maxWidth: 90 }}><input type="text" name={`etage_${s.id}`} defaultValue={s.etage ?? ""} placeholder="Étage" /></div>
                  <label className="chk"><input type="checkbox" name={`asc_${s.id}`} defaultChecked={s.ascenseur} />Asc.</label>
                  <div className="fld" style={{ flex: 2 }}><input type="text" name={`acces_${s.id}`} defaultValue={s.acces ?? ""} placeholder="Accès, stationnement…" /></div>
                </div>
              ))}
            </div>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <div className="fld w4"><label>Période souhaitée</label><input type="text" name="periode" defaultValue={d.periode ?? ""} placeholder="Fin janvier 2027" /></div>
              <div className="fld w4"><label>Mois de rattachement du CA</label><input type="month" name="mois_ca" defaultValue={moisCa} /></div>
              <div className="fld w4"><label>Date ferme</label><span className="sub" style={{ paddingTop: 10 }}>{d.date_chargement ? dateFr(d.date_chargement, { day: "numeric", month: "long", year: "numeric" }) : "Pas de date : voir Planification"}</span></div>
              <div className="fld w4"><label>Commercial</label><select name="commercial_id" defaultValue={d.commercial_id ?? ""}><option value="">—</option>{users.filter((u) => u.role === "commercial").map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}</select></div>
              <div className="fld w4"><label>Dossier traité par</label><select name="traite_par_id" defaultValue={d.traite_par_id ?? ""}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}</select></div>
              <div className="fld w4"><label>Type de client</label><select name="type_client" defaultValue={d.type}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
          </section>
          <section className="card note">
            <h3><Ic n="flag" />Observations commerciales</h3>
            <textarea name="observations" defaultValue={d.observations ?? ""} style={{ minHeight: 180 }} placeholder="Concurrents déjà vus, code portail, instructions du téléphone…" />
            <label className="chk" style={{ marginTop: 12 }}><input type="checkbox" name="passer_en_dernier" defaultChecked={d.passer_en_dernier} />Passer en dernier (le client consulte déjà des concurrents) : signalé sur le planning</label>
            <label className="chk" style={{ marginTop: 8 }}><input type="checkbox" name="vehicule" defaultChecked={d.vehicule} />Transporte un véhicule (carte grise + attestation d’assurance à demander)</label>
            <div className="sec-actions"><button className="btn primary sm">Enregistrer la fiche</button></div>
          </section>
        </form>

        <EspaceClient d={d} commerciaux={users.filter((u) => u.role === "commercial")} espace={sp.espace} message={sp.m} />

        {/* La visite technique (§3.2) : créneaux, rendez-vous, saisie sur la tablette, comptes-rendus signés. */}
        <SectionVisite d={d} commerciaux={users.filter((u) => u.role === "commercial")} sp={sp} />

        <section className="card inv">
          <div className="card-h"><h3>Inventaire · {m3(d.volume)}</h3>
            <div className="seg modes"><button className="on"><Ic n="pen" />Manuel</button><button className="mode-off" disabled title="Bientôt"><Ic n="cam" />Photo</button><button className="mode-off" disabled title="Bientôt"><Ic n="mic" />Dictée vocale</button></div></div>
          {d.inv.length === 0 && <div className="empty">Aucun objet. Ajoutez les meubles vus pendant la visite.</div>}
          {pieces.map((p) => (
            <div className="room" key={p}>
              <h5>{p}<small>{m3(d.inv.filter((i: Row) => i.piece === p).reduce((a: number, i: Row) => a + i.volume * i.quantite, 0))}</small></h5>
              {d.inv.filter((i: Row) => i.piece === p).map((i: Row) => (
                <div className="it" key={i.id}>
                  <span className="it-n">{i.quantite > 1 ? `${i.quantite} × ` : ""}{i.libelle}</span>
                  <span className={`dest d-${i.destination[0]}`}>{i.destination}</span>
                  <form action={A.basculerDemontage.bind(null, id, i.id)} className="mt"><button><i className={`box ${i.demontage ? "on" : ""}`} />Démont.</button></form>
                  <b>{m3(i.volume * i.quantite)}</b>
                  <form action={A.supprimerObjet.bind(null, id, i.id)}><button className="x" title="Supprimer">×</button></form>
                </div>
              ))}
            </div>
          ))}
          <form action={A.ajouterObjet.bind(null, id)} className="invadd">
            <input type="text" name="piece" placeholder="Pièce" list="pieces" required />
            <input type="text" name="libelle" placeholder="Objet (ex. Canapé 3 places)" required />
            <input type="number" name="quantite" defaultValue={1} min={1} title="Quantité" />
            <input type="number" name="volume" step="0.1" placeholder="m³" required title="Volume unitaire" />
            <select name="destination">{DESTS.map((x) => <option key={x}>{x}</option>)}</select>
            <label className="chk"><input type="checkbox" name="demontage" />Démont.</label>
            <button className="btn primary sm">Ajouter</button>
            <datalist id="pieces"><option>Salon</option><option>Cuisine</option><option>Chambre</option><option>Bureau</option><option>Cave / box</option><option>Garage</option></datalist>
          </form>
          <div className="pack"><h5><Ic n="box" />Emballages calculés automatiquement</h5>
            <div><span><b>{emb.cartonsStandard}</b> cartons standard</span><span><b>{emb.cartonsLivres}</b> cartons livres</span><span><b>{emb.penderies}</b> penderies</span><span><b>{emb.bulle}</b> rouleaux bulle</span></div>
            <small>Règle appliquée : paquets de 20 · repris sur la fiche imprimée et le devis</small></div>
        </section>

        <section className="card devis">
          <div className="card-h"><h3>Devis · 3 formules</h3>
            {d.devis.length > 0 && <Link className="btn ghost sm" href={`/imprimer/${id}?doc=devis`}><Ic n="pdf" />Aperçu client</Link>}</div>
          {d.devis.length === 0 && d.type === "militaire" ? (
            <div className="empty">Dossier militaire : pas de devis. Le client dépose ses documents et le dossier passe directement en commande.
              <form action={A.commandeSansDevis.bind(null, id)} className="sec-actions" style={{ justifyContent: "center" }}><button className="btn primary" disabled={apresCommande}>Passer en commande sans devis</button></form></div>
          ) : d.devis.length === 0 ? (
            <div className="empty">Pas encore de devis.<form action={A.genererDevis.bind(null, id)} className="sec-actions" style={{ justifyContent: "center" }}>
              <button className="btn primary" disabled={d.volume <= 0}>Générer les 3 formules</button></form>
              {d.volume <= 0 && <div className="sub">Renseignez d’abord l’inventaire.</div>}</div>
          ) : (
            <>
              <div className="forms">
                {d.devis.map((v: Row) => (
                  <div key={v.id} className={`dev-card ${v.formule === "standard" ? "rec" : ""}`}>
                    {v.formule === "standard" && <em style={{ position: "absolute", top: -10, left: 12, font: "600 10px var(--font)", fontStyle: "normal", background: "var(--accent)", color: "#fff", padding: "2px 8px", borderRadius: 99 }}>Recommandé</em>}
                    <small>{v.formule === "premium" ? "Le client ne fait rien" : v.formule === "standard" ? "Emballe ce qui casse" : "Le client fait tout"}</small>
                    <h4 style={{ textTransform: "capitalize" }}>{v.formule}</h4>
                    <b className="px">{eur(v.montant)}</b>
                    <ul>{(v.lignes as Row[]).map((l, i) => <li key={i} className={l.charge === "client" ? "n" : ""}><span>{l.libelle}</span><span>{l.charge === "client" ? "client" : eur(l.prix)}</span></li>)}</ul>
                    <span className={`dev-st ${v.statut}`}>{DEVIS_ST[v.statut]}{v.signe_le ? ` · ${dateFr(v.signe_le)}` : ""}</span>
                    <Link className="btn ghost sm" href={`/dossiers/${id}/devis/${v.id}`} style={{ width: "100%", justifyContent: "center" }}>Détail du devis</Link>
                    {v.token && v.statut === "envoye" && <Link className="sub" href={`/signature/${v.token}`}>Lien de signature client</Link>}
                    {["brouillon", "envoye"].includes(v.statut) && !signe && <form action={B.envoyerPourSignature.bind(null, id, v.id)}><button className="btn ghost sm" style={{ width: "100%", justifyContent: "center" }}>Envoyer pour signature</button></form>}
                    {v.statut === "brouillon" && <form action={A.envoyerDevis.bind(null, id, v.id)}><button className="btn ghost sm" style={{ width: "100%", justifyContent: "center" }}>Envoyer</button></form>}
                    {["brouillon", "envoye"].includes(v.statut) && !signe && <form action={A.signerDevis.bind(null, id, v.id)}><button className="btn primary sm" style={{ width: "100%", justifyContent: "center" }}>Signé par le client</button></form>}
                  </div>
                ))}
              </div>
              <div className="sec-actions">
                {!signe && <form action={A.genererDevis.bind(null, id)}><button className="btn ghost sm">Régénérer les brouillons</button></form>}
                {d.email && <a className="btn ghost sm" href={mailto}><Ic n="link" />Envoyer par e-mail</a>}
              </div>
              {signe && (
                <div className="arr"><Ic n="spark" />Arrhes 30 % : <b>{eur(Math.round(signe.montant * 0.3))}</b>{arrhes > 0 ? ` · reçues : ${eur(arrhes)}` : ""}
                  {arrhes === 0 && <form action={A.enregistrerArrhes.bind(null, id)} style={{ marginLeft: 8 }}><button className="btn ghost sm">Enregistrer l’encaissement</button></form>}</div>
              )}
            </>
          )}
        </section>

        {apresCommande && (() => {
          const items: [string, boolean][] = [
            ["Devis signé par le client", !!signe], ["Arrhes versées", arrhes > 0],
            ["Chargement : date posée au planning", !!d.date_chargement], ["Livraison : date posée au planning", !!d.date_livraison],
            ["Demande de stationnement renseignée", d.stops.some((x: Row) => x.acces)], ["Proposition de sous-traitance éditée", d.lettres.some((l: Row) => l.prix_sous_traitance != null)],
            ["Personnel affecté", d.lettres.some((l: Row) => l.equipe)], ["Véhicule affecté", d.lettres.some((l: Row) => l.immatriculation)],
            ["Instructions rédigées", d.lettres.some((l: Row) => l.instructions)], ["Matériel (emballages) prévu", d.volume > 0],
            // Coché seulement si le SMS est vraiment parti (pas journalisé ni bloqué : voir crm/envois.ts).
            ["SMS de confirmation envoyé", d.activite.some((a: Row) => /^SMS de confirmation (envoyé|déjà envoyé)/.test(String(a.libelle)))], ["Lettres de voiture créées", d.lettres.length > 0],
          ];
          return (
            <section className="card docs" style={{ gridColumn: "span 12" }}>
              <div className="card-h"><h3>Suivi de la commande</h3><b>{items.filter((i) => i[1]).length} / {items.length} actions faites</b></div>
              <div className="suivi">{items.map(([l, ok]) => <div key={l} className={ok ? "ok" : "ko"}><i>{ok ? "✓" : "✗"}</i>{l}</div>)}</div>
            </section>);
        })()}

        {apresCommande && (
          <section className="card docs" style={{ gridColumn: "span 12" }}>
            <div className="card-h"><h3>Planification & lettres de voiture</h3>
              {d.lettres.length === 0 && d.statut !== "perdu" && <form action={A.creerLettres.bind(null, id)}><button className="btn primary sm"><Ic n="truck" />Créer les lettres de voiture</button></form>}</div>
            <form action={A.planifierDemenagement.bind(null, id)} className="rowform" style={{ marginBottom: 14 }}>
              <div className="fld"><label>Date de chargement</label><input type="date" name="date_chargement" defaultValue={d.date_chargement ? new Date(d.date_chargement).toISOString().slice(0, 10) : ""} required /></div>
              <div className="fld"><label>Date de livraison</label><input type="date" name="date_livraison" defaultValue={d.date_livraison ? new Date(d.date_livraison).toISOString().slice(0, 10) : ""} /></div>
              <button className="btn ghost">{d.date_chargement ? "Modifier les dates" : "Confirmer au planning"}</button>
              {!d.date_chargement && <span className="sub">Sans date, le CA se rattache au mois prévu ({d.periode ?? "à préciser"}).</span>}
            </form>
            {d.lettres.length === 0 && <div className="sub">Une lettre de voiture est créée par rupture de charge (ex. Paris → garde-meuble, puis garde-meuble → arrivée).</div>}
            {d.lettres.map((l: Row) => (
              <form key={l.id} action={A.majLettre.bind(null, id, l.id)} className="lv">
                <div className="lv-top">
                  <div><div className="t">{l.numero}</div><div className="sub">{l.trajet}</div><div className="sub">{l.montant > 0 ? `Montant porté : ${eur(l.montant)}` : "Montant à 0 € (déjà compté sur la 1ʳᵉ lettre)"}</div></div>
                  <div className="fld"><label>Prestataire / agent</label><ChampPrestataire valeur={l.prestataire} /></div>
                  <div className="fld"><label>Prix sous-traitant (€)</label><input type="number" step="1" name="prix_sous_traitance" defaultValue={l.prix_sous_traitance ?? ""} /></div>
                </div>
                <div className="lv-top">
                  <div className="fld"><label>Déménageurs (équipe)</label><input type="text" name="equipe" defaultValue={l.equipe ?? ""} placeholder="Noms de l’équipe" /></div>
                  <div className="fld"><label>Immatriculation du camion</label><input type="text" name="immatriculation" defaultValue={l.immatriculation ?? ""} placeholder="AB-123-CD" /></div>
                  <div className="fld"><label>Instructions aux déménageurs</label><input type="text" name="instructions" defaultValue={l.instructions ?? ""} placeholder="Monte-meubles réservé à 8h, apporter un chèque…" /></div>
                </div>
                <div className="rowform" style={{ justifyContent: "flex-start" }}>
                  <select name="statut" defaultValue={l.statut} style={{ maxWidth: 180 }}>{Object.entries(LV_ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <input type="hidden" name="date_chargement" value={l.date_chargement ? new Date(l.date_chargement).toISOString().slice(0, 10) : ""} />
                  <input type="hidden" name="date_livraison" value={l.date_livraison ? new Date(l.date_livraison).toISOString().slice(0, 10) : ""} />
                  <button className="btn primary sm">Enregistrer</button>
                  <Link className="btn ghost sm" href={`/imprimer/${id}?doc=soustraitance&lv=${l.id}`}>Sous-traitance PDF</Link>
                  <Link className="btn ghost sm" href={`/imprimer/${id}?doc=lettre&lv=${l.id}`}>Lettre de voiture (5 feuilles)</Link>
                </div>
              </form>
            ))}
          </section>
        )}

        {apresCommande && (
          <section className="card route">
            <h3>Facturation</h3>
            <table className="tbl mini"><tbody>
              {d.paiements.map((p: Row) => <tr key={`p${p.id}`}><td>{p.libelle}</td><td>{dateFr(p.recu_le)}</td><td className="num"><b>{eur(p.montant)}</b></td><td><i className="st g">Reçu</i></td></tr>)}
              {d.factures.map((f: Row) => <tr key={f.id}><td>{f.numero} · {f.objet} <Link className="sub" href={`/imprimer/${id}?doc=facture&f=${f.id}`}>PDF</Link></td><td>{dateFr(f.emise_le)}</td><td className="num"><b>{eur(f.montant)}</b></td>
                <td>{f.statut === "payee" ? <i className="st g">Payée</i> : <form action={A.facturePayee.bind(null, id, f.id)}><button className="btn ghost sm">Marquer payée</button></form>}</td></tr>)}
              {d.paiements.length + d.factures.length === 0 && <tr><td className="empty" colSpan={4}>Rien d’encaissé ni de facturé.</td></tr>}
            </tbody></table>
            {d.type !== "compte" ? (
              <form action={A.emettreFacture.bind(null, id)} className="rowform" style={{ marginTop: 14 }}>
                <div className="fld"><label>Objet</label><input type="text" name="objet" defaultValue="Solde du déménagement" /></div>
                <div className="fld"><label>Montant (vide = solde automatique)</label><input type="number" step="1" name="montant" /></div>
                <button className="btn primary sm">Émettre la facture</button>
              </form>
            ) : <p className="sub" style={{ marginTop: 12 }}>Client « compte » : pas de facture ni de paiement en ligne côté client (parcours dédié).</p>}
          </section>
        )}

        <section className="card route" style={{ gridColumn: apresCommande ? "span 7" : "span 12" }}>
          <div className="card-h"><h3><Ic n="alert" />Litiges</h3></div>
          {lit.length === 0 && <p className="sub">Aucun litige sur ce dossier.</p>}
          {lit.map((l: Row) => <div key={l.id} className="rowform" style={{ padding: "8px 0", borderBottom: "1px dashed var(--line)" }}><span style={{ flex: 3 }}><b>{l.objet}</b><small style={{ display: "block" }}>Ouvert le {dateFr(l.ouvert_le)}{l.montant ? ` · ${eur(l.montant)}` : ""}</small></span>
            <i className={`st ${l.statut === "clos" ? "g" : l.statut === "en_cours" ? "w" : "r"}`}>{l.statut === "clos" ? "Clos" : l.statut === "en_cours" ? "En cours" : "Ouvert"}</i>
            {l.statut !== "clos" && <form action={B.changerLitige.bind(null, id, l.id, l.statut === "ouvert" ? "en_cours" : "clos")}><button className="btn ghost sm">{l.statut === "ouvert" ? "Prendre en charge" : "Clore"}</button></form>}</div>)}
          <form action={B.ouvrirLitige.bind(null, id)} className="rowform" style={{ marginTop: 12 }}><div className="fld" style={{ flex: 3 }}><input type="text" name="objet" placeholder="Objet du litige (meuble rayé, carton manquant…)" required /></div><div className="fld" style={{ maxWidth: 110 }}><input type="number" name="montant" placeholder="€" /></div><button className="btn ghost sm">Ouvrir un litige</button></form>
        </section>

        <section className="card note" style={{ gridColumn: apresCommande ? "span 5" : "span 12", background: "var(--surface)" }}>
          <div className="card-h"><h3>Rendez-vous & activité</h3><Link className="btn ghost sm" href={`/planning/nouveau?dossier=${id}`}><Ic n="cal" />Planifier une visite</Link></div>
          {d.rdvs.map((r: Row) => <div key={r.id} className="sub" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "4px 0" }}>📅 {dateFr(r.debut, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.titre} · {r.commercial}<form action={B.envoyerSms.bind(null, id, r.id)}><button className="btn ghost sm">SMS de confirmation</button></form>
            {/* L'état du SMS et la réponse du client (src/crm/rdv) ; la réponse se saisit aussi à la main. */}
            <EtatSmsRdv etat={etatsSms.get(r.id)} confirmer={B.reponseRdv.bind(null, id, r.id, "confirme")} annuler={B.reponseRdv.bind(null, id, r.id, "annule")} /></div>)}
          <ul className="tl-list" style={{ gridTemplateColumns: apresCommande ? "1fr" : "repeat(3,1fr)" }}>
            {d.activite.length === 0 && <li>Aucune activité.</li>}
            {d.activite.map((a: Row, i: number) => <li key={i} className={i === 0 ? "now" : "done"}><i />{a.libelle}<small>{a.initiales} · {ilYa(a.cree_le)}</small></li>)}
          </ul>
        </section>

        {/* Outil terrain : les photos envoyées par les déménageurs (src/terrain). */}
        <GalerieChantier dossierId={id} />
      </div>
    </div>
  );
}
