"use server";
import { revalidatePath } from "next/cache";
import { q, q1 } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { segmentValide, typeValide, type Champs } from "./commun";

/*
 * Les modèles de dossier : les créer (de zéro ou depuis une fiche), les
 * modifier, les supprimer. Chaque action revérifie la session (une action
 * serveur peut être appelée depuis n'importe quelle adresse de l'app).
 */

export type Issue = { ok: true; id: number; nom: string } | { ok: false; erreur: string };

const texte = (f: FormData, k: string, max = 2000) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v.slice(0, max);
};

/** Les champs d'un modèle, lus dans le formulaire : seuls les champs connus, aux valeurs connues. */
function lireChamps(f: FormData): Champs {
  const c: Champs = {};
  const type = texte(f, "type");
  if (segmentValide(type)) c.type = type;
  const tdm = texte(f, "type_demenagement");
  if (typeValide(tdm)) c.type_demenagement = tdm;
  const vol = Number(String(f.get("volume") ?? "").replace(",", "."));
  if (Number.isFinite(vol) && vol > 0 && vol < 10_000) c.volume = Math.round(vol * 10) / 10;
  if (f.get("garde_meuble") === "on") c.garde_meuble = true;
  if (f.get("vehicule") === "on") c.vehicule = true;
  const obs = texte(f, "observations", 4000);
  if (obs) c.observations = obs;
  return c;
}

const rafraichir = () => {
  revalidatePath("/dossiers/modeles");
  revalidatePath("/dossiers/nouveau");
};

/**
 * Crée un modèle (id nul) ou le modifie. `sourceDossierId` : le dossier
 * d'où il vient, quand on l'enregistre depuis une fiche (« Enregistrer comme
 * modèle ») ; l'activité du dossier en garde la trace.
 */
export async function enregistrerModele(id: number | null, sourceDossierId: number | null, f: FormData): Promise<Issue> {
  const u = await currentUser();
  const nom = texte(f, "nom", 80);
  if (!nom) return { ok: false, erreur: "Donnez un nom au modèle." };
  const description = texte(f, "description", 240);
  const champs = JSON.stringify(lireChamps(f));
  if (id) {
    const r = await q1<{ id: number }>(
      "update modeles_dossier set nom = $2, description = $3, champs = $4, maj_le = now() where id = $1 returning id",
      [id, nom, description, champs],
    );
    if (!r) return { ok: false, erreur: "Ce modèle n'existe plus." };
    rafraichir();
    return { ok: true, id: r.id, nom };
  }
  const source = sourceDossierId ? await q1<{ id: number }>("select id from dossiers where id = $1", [sourceDossierId]) : undefined;
  const r = await q1<{ id: number }>(
    "insert into modeles_dossier(nom, description, champs, cree_par_id, source_dossier_id) values($1, $2, $3, $4, $5) returning id",
    [nom, description, champs, u.id, source?.id ?? null],
  );
  if (source) {
    await q("insert into activite(dossier_id, utilisateur_id, libelle) values($1, $2, $3)", [source.id, u.id, `Enregistré comme modèle « ${nom} »`]);
    revalidatePath(`/dossiers/${source.id}`);
  }
  rafraichir();
  return { ok: true, id: r!.id, nom };
}

export async function supprimerModele(id: number): Promise<Issue> {
  await currentUser();
  const r = await q1<{ id: number; nom: string }>("delete from modeles_dossier where id = $1 returning id, nom", [id]);
  if (!r) return { ok: false, erreur: "Ce modèle n'existe plus." };
  rafraichir();
  return { ok: true, id: r.id, nom: r.nom };
}
