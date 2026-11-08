import { redirect } from "next/navigation";

/* Provisoire : l'annuaire unique (déménageurs et sous-traitants) remplace ce renvoi. */
export default function Partenaires() {
  redirect("/sous-traitants");
}
