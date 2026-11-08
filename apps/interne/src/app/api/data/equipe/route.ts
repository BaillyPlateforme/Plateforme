import { NextResponse } from "next/server";
import { listTeam } from "@/lib/team";
import { membreConnecte, porteSuperAdmin } from "@/lib/droits";

export const dynamic = "force-dynamic";

/**
 * L'équipe, et de quoi montrer les règles du droit de super admin : qui est
 * connecté (son rôle) et combien de super admins sont actifs. L'écran ne
 * décide de rien : les actions (lib/actions/team.ts) revérifient tout.
 */
export async function GET() {
  try {
    const [members, moi] = await Promise.all([listTeam(), membreConnecte()]);
    return NextResponse.json({
      members,
      moi: moi ? { id: moi.id, role: moi.role } : null,
      superAdminsActifs: members.filter(porteSuperAdmin).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
