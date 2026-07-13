import { listEmails, EMAIL_TEMPLATES } from "@/lib/emails";
import { listClients } from "@/lib/clients";
import { getSettings } from "@/lib/settings";
import EmailsClient from "./EmailsClient";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const [emails, clients, settings] = await Promise.all([
    listEmails(),
    listClients(),
    getSettings(),
  ]);
  const recipients = clients.map((c) => ({ email: c.email, nom: c.nom }));

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Outils</div>
        <h1 className="mt-1 font-serif text-4xl">Emails</h1>
      </header>
      <EmailsClient
        emails={emails}
        templates={EMAIL_TEMPLATES}
        recipients={recipients}
        webhookConfigured={!!settings.n8n_webhook_url}
      />
    </div>
  );
}
