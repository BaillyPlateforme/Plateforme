/*
 * Les tests unitaires ne parlent à aucun service : aucune clé, aucune base.
 * Un module qui appellerait Brevo, Gemini, Créagidem ou Supabase échouerait
 * aussitôt au lieu d'envoyer quoi que ce soit.
 */
for (const cle of Object.keys(process.env)) {
  if (/^(BREVO|GEMINI|CREAGIDEM|SUPABASE|NEXT_PUBLIC_SUPABASE|DATABASE_URL|STRIPE|OPENAI|ELEVENLABS)/.test(cle)) delete process.env[cle];
}
process.env.ENVOI_MODE = "desactive";
process.env.CREAGIDEM_MODE = "inactif";
process.env.TZ = "Europe/Paris";
