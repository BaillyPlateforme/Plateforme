import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_CLIENT } from "@/lib/espace-client/session";

/** La déconnexion : le cookie de session s'efface, retour à la connexion. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/espace-client/connexion?au-revoir=1", req.url));
  res.cookies.set(COOKIE_CLIENT, "", { path: "/espace-client", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}
