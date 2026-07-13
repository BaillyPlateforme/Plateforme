// Accès centralisé et typé aux variables d'environnement.
// On échoue tôt et clairement si une variable serveur manque.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

export const env = {
  // Publiques (front + back)
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  // Serveur uniquement
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
  storageBucket: () => process.env.SUPABASE_STORAGE_BUCKET ?? "request-photos",
};
