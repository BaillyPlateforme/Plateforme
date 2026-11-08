import { redirect } from "next/navigation";

/* Provisoire : la page unique des réglages (menu à gauche) remplace ce renvoi. */
export default function Reglages() {
  redirect("/dashboard/parametres");
}
