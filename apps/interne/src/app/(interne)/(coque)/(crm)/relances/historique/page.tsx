import { redirect } from "next/navigation";

/*
 * L'ancien historique des relances (/relances/historique) : il est désormais
 * la vue « Historique » de /relances (simplification du 08/11/2026). Ses
 * filtres et le dossier suivent.
 */
export default async function AncienHistorique({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const u = new URLSearchParams({ vue: "historique" });
  for (const k of ["dossier", "type", "canal", "issue", "periode", "origine"]) if (typeof sp[k] === "string" && sp[k]) u.set(k, sp[k] as string);
  redirect(`/relances?${u}`);
}
