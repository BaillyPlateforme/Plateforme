import { redirect } from "next/navigation";

/* Les visites techniques sont une vue du planning commercial (simplification du 08/11/2026). */
export default function AnciennesVisites() {
  redirect("/planning?vue=visites");
}
