import { redirect } from "next/navigation";

/**
 * L'ancienne adresse du formulaire. Elle reste en place — des e-mails et des
 * modèles la portent — et renvoie vers l'accueil, qui est désormais le
 * formulaire lui-même. Les paramètres suivent.
 */
export default async function DemandePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(await searchParams)) {
    if (typeof valeur === "string") params.set(cle, valeur);
    else if (Array.isArray(valeur)) valeur.forEach((v) => params.append(cle, v));
  }
  const q = params.toString();
  redirect(q ? `/?${q}` : "/");
}
