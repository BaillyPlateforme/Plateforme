import type { Metadata } from "next";
import { versExterne } from "@/lib/adresses";
import FormulaireConnexion from "./FormulaireConnexion";

export const metadata: Metadata = { title: "Connexion" };

/*
 * La connexion à l'app interne, dans le design du CRM qui en occupe la racine.
 * Un seul compte pour tout : le CRM et l'espace équipe (/dashboard).
 */
export default async function Connexion({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect } = await searchParams;
  // Une redirection interne seulement : jamais vers un autre domaine.
  const cible = redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";

  return (
    <div className="login">
      <div className="login-card">
        <i className="logo" style={{ width: 48, height: 48, fontSize: 24 }}>
          B
        </i>
        <h1>Bailly CRM</h1>
        <p>Connectez-vous avec votre compte Bailly : il ouvre le CRM et l&apos;espace équipe.</p>
        <FormulaireConnexion cible={cible} />
        <p style={{ marginTop: 22, marginBottom: 0, fontSize: 13 }}>
          <a href={versExterne("/")} style={{ color: "var(--muted)" }}>
            Retour au site public
          </a>
        </p>
      </div>
    </div>
  );
}
