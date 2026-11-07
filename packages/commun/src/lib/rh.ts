import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { EspacePro } from "@/lib/espaces";
import type { DemandeRh } from "@/lib/rh-modele";
import type { RequestRow } from "@/lib/types";

/*
 * Les comptes RH et ce qu'ils voient.
 *
 * Un compte RH est un compte d'authentification ordinaire, marqué côté serveur
 * (`app_metadata`) : son rôle, et l'espace pro auquel il est rattaché. Pas de
 * table à part — donc pas de migration : le rattachement voyage dans le jeton
 * de session, où le navigateur ne peut pas le modifier.
 */

export interface CompteRh {
  id: string;
  email: string;
  nom: string;
  cree_le: string;
  derniere_connexion: string | null;
}

type Marque = { role?: string; espace_id?: string };

/** Tous les comptes RH d'un espace. */
export async function listerComptesRh(espaceId: string): Promise<CompteRh[]> {
  const { data, error } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`);
  return data.users
    .filter((u) => {
      const m = (u.app_metadata ?? {}) as Marque;
      return m.role === "rh" && m.espace_id === espaceId;
    })
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      nom: String((u.user_metadata as { nom?: string } | null)?.nom ?? ""),
      cree_le: u.created_at,
      derniere_connexion: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

const MOT_DE_PASSE_MIN = 10;

export async function creerCompteRh(
  espaceId: string,
  entree: { email: string; nom?: string; motDePasse: string },
): Promise<CompteRh> {
  const email = entree.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  if (entree.motDePasse.length < MOT_DE_PASSE_MIN) throw new Error(`Le mot de passe doit compter au moins ${MOT_DE_PASSE_MIN} caractères.`);
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email,
    password: entree.motDePasse,
    // Le compte est créé par l'équipe pour quelqu'un qu'elle connaît : pas de mail de confirmation.
    email_confirm: true,
    app_metadata: { role: "rh", espace_id: espaceId },
    user_metadata: { nom: (entree.nom ?? "").trim() },
  });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) throw new Error("Un compte existe déjà avec cette adresse.");
    throw new Error(`Création du compte impossible : ${error?.message ?? "réponse vide"}`);
  }
  return { id: data.user.id, email, nom: (entree.nom ?? "").trim(), cree_le: data.user.created_at, derniere_connexion: null };
}

/** Vérifie qu'un compte est bien un compte RH avant d'y toucher : on ne supprime pas un membre de l'équipe par ici. */
async function compteRh(id: string) {
  const admin = createServiceClient().auth.admin;
  const { data, error } = await admin.getUserById(id);
  if (error || !data.user) throw new Error("Compte introuvable.");
  if (((data.user.app_metadata ?? {}) as Marque).role !== "rh") throw new Error("Ce compte n'est pas un compte RH.");
  return admin;
}

export async function supprimerCompteRh(id: string) {
  const admin = await compteRh(id);
  const { error } = await admin.deleteUser(id);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
}

export async function changerMotDePasseRh(id: string, motDePasse: string) {
  if (motDePasse.length < MOT_DE_PASSE_MIN) throw new Error(`Le mot de passe doit compter au moins ${MOT_DE_PASSE_MIN} caractères.`);
  const admin = await compteRh(id);
  const { error } = await admin.updateUserById(id, { password: motDePasse });
  if (error) throw new Error(`Changement impossible : ${error.message}`);
}

const COLONNES =
  "id,status,client_nom,client_email,client_tel,depart_ville,depart_code_postal,arrivee_ville,arrivee_code_postal,date_souhaitee,flexibilite,volume_m3,distance_km,formule,estimation_prix,created_at,updated_at";

/**
 * Les demandes d'un espace, telles que ses RH peuvent les voir. On ne lit que
 * les colonnes montrées : ni l'adresse, ni l'inventaire, ni les notes de
 * l'équipe ne quittent la base par ce chemin.
 */
export async function demandesRh(espace: Pick<EspacePro, "id" | "slug" | "rh_couts">): Promise<DemandeRh[]> {
  const supabase = createServiceClient();
  // Les demandes portent l'identifiant de leur espace ; les toutes premières
  // n'avaient que son nom de lien.
  const { data, error } = await supabase
    .from("requests")
    .select(COLONNES)
    .or(`raw_payload->espace->>id.eq.${espace.id},raw_payload->espace->>slug.eq.${espace.slug}`)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Lecture des demandes impossible : ${error.message}`);
  const lignes = (data ?? []) as unknown as RequestRow[];
  if (lignes.length === 0) return [];

  const { data: devis } = await supabase
    .from("devis")
    .select("request_id,reference,montant_ht,montant_ttc,valid_until,created_at")
    .in("request_id", lignes.map((r) => r.id))
    .order("created_at", { ascending: false });
  // Le plus récent devis de chaque demande.
  const parDemande = new Map<string, { reference: string; montant_ht: number; montant_ttc: number; valid_until: string | null }>();
  for (const d of (devis ?? []) as { request_id: string; reference: string; montant_ht: number; montant_ttc: number; valid_until: string | null }[])
    if (!parDemande.has(d.request_id)) parDemande.set(d.request_id, d);

  return lignes.map((r) => {
    const d = parDemande.get(r.id);
    const ttc = d?.montant_ttc ?? r.estimation_prix ?? null;
    return {
      id: r.id,
      nom: r.client_nom ?? "—",
      email: r.client_email,
      tel: r.client_tel,
      depart: r.depart_ville,
      depart_cp: r.depart_code_postal,
      arrivee: r.arrivee_ville,
      arrivee_cp: r.arrivee_code_postal,
      date_souhaitee: r.date_souhaitee,
      periode: r.flexibilite,
      volume_m3: r.volume_m3,
      distance_km: r.distance_km,
      formule: r.formule,
      statut: r.status,
      cree_le: r.created_at,
      maj_le: r.updated_at,
      cout_ht: espace.rh_couts ? (d?.montant_ht ?? null) : null,
      cout_ttc: espace.rh_couts ? ttc : null,
      devis_reference: d?.reference ?? null,
      devis_valide_jusqu: d?.valid_until ?? null,
    };
  });
}
