import { redirect } from "next/navigation";

/*
 * L'ancien Kanban des relances (/relances/kanban) : il est désormais la vue
 * par défaut de /relances (simplification du 08/11/2026). Le type et le
 * dossier filtrés suivent.
 */
export default async function AncienKanban({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const u = new URLSearchParams();
  for (const k of ["type", "dossier"]) if (typeof sp[k] === "string" && sp[k]) u.set(k, sp[k] as string);
  redirect(`/relances${u.size ? `?${u}` : ""}`);
}
