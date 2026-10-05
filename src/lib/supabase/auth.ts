import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client serveur lié à la session (cookies) — pour lire l'utilisateur connecté.
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : ignoré (le middleware rafraîchit).
          }
        },
      },
    },
  );
}

/**
 * Identité affichable, lue dans le cookie de session — sans aller-retour.
 *
 * Le middleware a déjà validé la session auprès de Supabase avant que la page
 * ne soit rendue ; refaire un `getUser()` ici ajoutait un second appel réseau
 * (150 à 250 ms) à chaque navigation, pour afficher une adresse e-mail.
 * À n'utiliser que pour l'affichage : jamais pour autoriser quoi que ce soit.
 */
export async function getUserAffichage() {
  const supabase = await createAuthClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function getUser() {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Qui est connecté. Deux sortes de comptes partagent la même authentification :
 * l'équipe Bailly, et les comptes RH — ceux des entreprises clientes, rattachés
 * chacun à un espace pro (`app_metadata`, que seul le serveur peut écrire).
 */
export type Acces =
  | { id: string; email: string; role: "equipe" }
  | { id: string; email: string; role: "rh"; espaceId: string; nom: string };

export async function getAcces(): Promise<Acces | null> {
  const user = await getUser();
  if (!user) return null;
  const m = (user.app_metadata ?? {}) as { role?: string; espace_id?: string };
  if (m.role === "rh")
    return {
      id: user.id,
      email: user.email ?? "",
      role: "rh",
      espaceId: m.espace_id ?? "",
      nom: String((user.user_metadata as { nom?: string } | null)?.nom ?? ""),
    };
  return { id: user.id, email: user.email ?? "", role: "equipe" };
}

/**
 * Réserve une action à l'équipe Bailly. Une session ne suffit pas : un compte
 * RH en a une aussi, et il ne doit rien pouvoir régler.
 */
export async function exigerEquipe() {
  const acces = await getAcces();
  if (!acces) throw new Error("Session expirée : reconnectez-vous.");
  if (acces.role !== "equipe") throw new Error("Réservé à l'équipe Bailly.");
}
