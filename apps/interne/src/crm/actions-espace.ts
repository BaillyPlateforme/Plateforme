"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, q1 } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { lireDemande } from "@/lib/espace-client/demandes";
import { ouvrirEspaceDepuisCrm, renvoyerLienCrm } from "@/lib/espace-client/crm";
import { projeterEspace } from "@/crm/lib/espace";

/*
 * L'espace client, ouvert depuis le CRM. Un dossier, deux faces : le dossier
 * naît dans le CRM — saisi à la main, ou créé depuis une demande du site —,
 * et son espace client s'ouvre depuis sa fiche. Le module d'accès à l'espace
 * (packages/commun, lib/espace-client/crm.ts) fait le reste : le client de
 * l'espace, le dossier lié, la projection des devis et des factures, le
 * compte de connexion et le lien d'accès, journalisé tant que l'envoi réel
 * n'est pas activé (ESPACE_CLIENT_ENVOI).
 *
 * Comme toutes les actions du CRM, chacune commence par vérifier la session.
 */

const s = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const refresh = (id: number) => { revalidatePath("/(interne)", "layout"); revalidatePath(`/dossiers/${id}`); revalidatePath("/dashboard/espace-client", "layout"); };
const vers = (id: number, etat: string, message?: string) =>
  `/dossiers/${id}?espace=${etat}${message ? `&m=${encodeURIComponent(message.slice(0, 300))}` : ""}#espace-client`;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function noter(dossierId: number, utilisateurId: number, libelle: string) {
  await q("insert into activite(dossier_id,utilisateur_id,libelle) values($1,$2,$3)", [dossierId, utilisateurId, libelle]);
  await q("update dossiers set maj_le=now() where id=$1", [dossierId]);
}

/**
 * « Ouvrir l'espace client », depuis la fiche du dossier. Le formulaire
 * complète au passage ce qui manque et qui se saisit en une ligne :
 * l'adresse e-mail du client, le mois prévu, le commercial, le pays d'un
 * déménagement international. Le reste (le trajet, le volume) se renseigne
 * dans la fiche.
 */
export async function ouvrirEspaceClient(dossierId: number, f: FormData) {
  const u = await currentUser();
  const d = await q1<{ client_id: number; email: string | null; mois_ca: unknown; date_chargement: unknown; commercial_id: number | null }>(
    "select d.client_id, c.email, d.mois_ca, d.date_chargement, d.commercial_id from dossiers d join clients c on c.id=d.client_id where d.id=$1",
    [dossierId],
  );
  if (!d) redirect("/parcours");

  const completes: string[] = [];
  const email = s(f, "email")?.toLowerCase() ?? null;
  if (email && !EMAIL.test(d.email ?? "")) {
    if (!EMAIL.test(email)) redirect(vers(dossierId, "erreur", "Cette adresse e-mail n'est pas valide."));
    await q("update clients set email=$2 where id=$1", [d.client_id, email]);
    completes.push("e-mail du client");
  }
  const mois = s(f, "mois_ca");
  if (mois && /^\d{4}-\d{2}$/.test(mois) && !d.mois_ca && !d.date_chargement) {
    await q("update dossiers set mois_ca=$2 where id=$1", [dossierId, `${mois}-01`]);
    completes.push("mois prévu");
  }
  const commercial = Number(s(f, "commercial_id"));
  if (!d.commercial_id && Number.isSafeInteger(commercial) && commercial > 0) {
    await q("update dossiers set commercial_id=$2 where id=$1 and exists (select 1 from utilisateurs where id=$2)", [dossierId, commercial]);
    completes.push("commercial");
  }
  if (completes.length) await noter(dossierId, u.id, `Fiche complétée pour l'espace client (${completes.join(", ")})`);

  const pays = s(f, "pays");
  const r = await ouvrirEspaceDepuisCrm(dossierId, { pays: pays && /^[A-Z]{2}$/.test(pays) ? pays : null });
  // Les factures et règlements selon le modèle de la facturation (src/crm/facturation), après la projection d'ouverture.
  if (r.ok) await projeterEspace(dossierId);
  refresh(dossierId);
  if (!r.ok) redirect(vers(dossierId, "erreur", r.erreur));
  redirect(vers(dossierId, r.deja ? "deja" : r.avertissement ? "avertissement" : "ouvert", r.avertissement));
}

/** « Renvoyer le lien d'accès » : un nouveau lien, journalisé (ou envoyé avec ESPACE_CLIENT_ENVOI=1). */
export async function renvoyerLienEspace(dossierId: number) {
  await currentUser();
  const r = await renvoyerLienCrm(dossierId);
  refresh(dossierId);
  if (!r.ok) redirect(vers(dossierId, "erreur", r.erreur));
  redirect(vers(dossierId, r.statut === "envoyee" ? "lien-envoye" : "lien-journalise"));
}

async function numeroDossier() {
  const an = new Date().getFullYear();
  const r = await q1<{ n: number }>("select coalesce(max(substring(ref from '[0-9]+$')::int),0) + 1 as n from dossiers where ref like $1", [`BD-${an}-%`]);
  return `BD-${an}-${String(r!.n).padStart(4, "0")}`;
}

const adresse = (a: string | null, cp: string | null, v: string | null) => [a, [cp, v].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
const etage = (n: number | null) => (n == null ? null : n === 0 ? "RDC" : String(n));

/**
 * « Ouvrir l'espace client », depuis la fiche d'une demande du site : c'est
 * l'entrée d'une demande dans le CRM. Le dossier du CRM est créé s'il
 * n'existe pas — le client, le trajet (adresses, étages, ascenseurs), le
 * volume, et la date souhaitée en guise de période indicative —, puis
 * l'espace s'ouvre par le même chemin que depuis la fiche du dossier.
 *
 * Ce que la demande ne dit pas se complète à la main sur la fiche (décision
 * du 7/11) : le mois prévu (la date souhaitée n'est pas la date convenue) et
 * le commercial. Tant qu'il manque, la fiche du dossier s'ouvre sur le
 * formulaire d'ouverture, qui le demande.
 */
export async function ouvrirEspaceDepuisDemande(requestId: string) {
  const u = await currentUser();
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) redirect("/dashboard");

  let id = (await q1<{ id: number }>("select id from dossiers where request_id=$1", [requestId]))?.id;
  if (!id) {
    const dem = await lireDemande(requestId);
    if (!dem) redirect(`/dashboard/${requestId}`);
    const [prenom, ...reste] = (dem.client_nom ?? "").trim().split(/\s+/);
    // Une demande venue d'un espace pro est celle d'un salarié muté : son entreprise est le compte.
    const type = dem.espace_nom ? "compte" : "particulier";
    const souhait = dem.date_souhaitee
      ? `Souhaitée le ${new Date(`${dem.date_souhaitee}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
      : null;
    const client = await q1<{ id: number }>(
      "insert into clients(type,prenom,nom,societe,email,telephone) values($1,$2,$3,$4,$5,$6) returning id",
      [type, reste.length ? prenom : null, reste.length ? reste.join(" ") : (dem.client_nom?.trim() || dem.client_email || "Sans nom"), dem.espace_nom, dem.client_email?.trim().toLowerCase() ?? null, dem.client_tel],
    );
    try {
      const cree = await q1<{ id: number }>(
        `insert into dossiers(ref,client_id,commercial_id,statut,periode,volume,observations,request_id)
         values($1,$2,$3,'prospect',$4,$5,$6,$7) returning id`,
        [await numeroDossier(), client!.id, u.role === "commercial" ? u.id : null, souhait, dem.volume_m3 ?? 0,
          `Dossier créé depuis la demande du site du ${new Date(dem.created_at).toLocaleDateString("fr-FR")}.`, requestId],
      );
      id = cree!.id;
    } catch (e) {
      // Deux clics : la demande a déjà son dossier (index unique sur request_id).
      await q("delete from clients where id=$1 and not exists (select 1 from dossiers where client_id=$1)", [client!.id]);
      const deja = await q1<{ id: number }>("select id from dossiers where request_id=$1", [requestId]);
      if (!deja) throw e;
      id = deja.id;
    }
    if (id && !(await q1("select 1 from etapes_trajet where dossier_id=$1", [id]))) {
      const trajet = await q1<{ depart_etage: number | null; depart_ascenseur: boolean | null; arrivee_etage: number | null; arrivee_ascenseur: boolean | null }>(
        "select depart_etage, depart_ascenseur, arrivee_etage, arrivee_ascenseur from public.requests where id=$1",
        [requestId],
      ).catch(() => undefined);
      await q("insert into etapes_trajet(dossier_id,ordre,genre,adresse,etage,ascenseur) values($1,0,'depart',$2,$3,$4),($1,1,'arrivee',$5,$6,$7)", [
        id, adresse(dem.depart_adresse, dem.depart_code_postal, dem.depart_ville), etage(trajet?.depart_etage ?? null), !!trajet?.depart_ascenseur,
        adresse(dem.arrivee_adresse, dem.arrivee_code_postal, dem.arrivee_ville), etage(trajet?.arrivee_etage ?? null), !!trajet?.arrivee_ascenseur,
      ]);
      await noter(id, u.id, "Dossier créé depuis une demande du site (Questionnaires)");
    }
  }

  const r = await ouvrirEspaceDepuisCrm(id);
  refresh(id);
  revalidatePath(`/dashboard/${requestId}`);
  if (!r.ok) {
    // Ce qui manque se complète sur la fiche : elle s'ouvre sur le formulaire d'ouverture.
    redirect(vers(id, "a-completer", r.erreur));
  }
  redirect(vers(id, r.deja ? "deja" : r.avertissement ? "avertissement" : "ouvert", r.avertissement));
}
