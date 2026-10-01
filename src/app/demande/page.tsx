import { redirect } from "next/navigation";

/**
 * L'ancienne adresse du formulaire. Des e-mails et des modèles la portent :
 * elle renvoie vers la racine, où tout vit désormais, en gardant le parcours
 * demandé.
 */
export default async function DemandePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  redirect(mode === "express" || mode === "complet" ? `/?mode=${mode}` : "/");
}
