import { createClient } from "@supabase/supabase-js";

/*
 * Qui fait partie de l'équipe Bailly : les comptes inscrits (et actifs) dans
 * la table team_members — et eux seuls.
 *
 * Avant, l'app de l'équipe laissait entrer tout compte sans rôle. Or les
 * inscriptions publiques de Supabase sont ouvertes : n'importe qui pouvait
 * créer un compte et entrer dans le back-office. L'appartenance se lit
 * désormais dans la base, avec la clé de service.
 *
 * Le proxy passe à chaque requête : la réponse est gardée une minute par
 * adresse, pour ne pas interroger la base à chaque clic. Retirer quelqu'un de
 * l'équipe prend donc effet en une minute au plus.
 */
const DUREE_MS = 60_000;
const cache = new Map<string, { membre: boolean; jusqua: number }>();

export async function estMembreEquipe(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const cle = email.trim().toLowerCase();
  const connu = cache.get(cle);
  if (connu && connu.jusqua > Date.now()) return connu.membre;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return false;

  const supabase = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  // Comparaison EXACTE : « ilike » prenait « _ » et « % » de l'adresse pour des jokers, et un compte
  // « celine_x@… » passait pour « celine.x@… ». L'équipe tient en quelques lignes : on les relit toutes.
  const { data, error } = await supabase.from("team_members").select("email, actif");
  // Une erreur de lecture ferme la porte, sans la retenir en cache.
  if (error) return false;
  const ligne = (data ?? []).find((m) => (m.email ?? "").trim().toLowerCase() === cle);
  const membre = !!ligne && ligne.actif !== false;
  cache.set(cle, { membre, jusqua: Date.now() + DUREE_MS });
  return membre;
}
