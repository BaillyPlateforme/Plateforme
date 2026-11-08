import { redirect } from "next/navigation";

/** /statistiques mène aux statistiques commerciales (le premier onglet du module). */
export default function Statistiques() {
  redirect("/statistiques/commerciales");
}
