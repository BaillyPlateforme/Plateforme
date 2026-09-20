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
