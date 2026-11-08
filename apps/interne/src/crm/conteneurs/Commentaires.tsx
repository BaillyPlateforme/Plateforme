"use client";

import { useTransition } from "react";
import { initiales } from "@/crm/lib/format";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { commenter, supprimerCommentaire } from "./actions";
import s from "./conteneurs.module.css";

/** Les commentaires d'un conteneur : le dernier en haut, un champ pour en ajouter. */
export default function Commentaires({ id, commentaires }: { id: number; commentaires: { id: number; auteur: string; texte: string; quand: string }[] }) {
  const [, lancer] = useTransition();
  return (
    <div className={s.fil}>
      <Formulaire action={commenter.bind(null, id)} className={s.nouveauCommentaire} vider>
        <div className={u.champ} style={{ gridColumn: "auto" }}>
          <label htmlFor="commentaire">Nouveau commentaire</label>
          <textarea id="commentaire" name="texte" required placeholder="Échange avec le transitaire, réserve à l'empotage, retard annoncé…" />
        </div>
        <div className={u.pied}>
          <button type="submit" className={u.bouton}>
            Publier
          </button>
        </div>
      </Formulaire>
      {commentaires.length === 0 && <p className={u.aide}>Aucun commentaire.</p>}
      {commentaires.map((c) => (
        <article key={c.id} className={s.commentaire}>
          <i>{initiales(c.auteur)}</i>
          <div>
            <p className={s.commentaireTete}>
              <b>{c.auteur}</b>
              <span>{c.quand}</span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Supprimer ce commentaire ?")) lancer(async () => void (await supprimerCommentaire(id, c.id)));
                }}
              >
                Supprimer
              </button>
            </p>
            <p className={s.commentaireTexte}>{c.texte}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
