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
  geminiApiKey: () => required("GEMINI_API_KEY"),
  brevoApiKey: () => process.env.BREVO_API_KEY ?? "",
  labWebhookUrl: () =>
    process.env.LAB_WEBHOOK_URL ??
    "https://n8n.srv905564.hstgr.cloud/webhook/689f1c29-b034-4cbc-bbe6-124026db24bb",
  geminiModel: () => process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview",
  storageBucket: () => process.env.SUPABASE_STORAGE_BUCKET ?? "request-photos",
  libraryBucket: () => process.env.SUPABASE_LIBRARY_BUCKET ?? "playground-photos",
};
