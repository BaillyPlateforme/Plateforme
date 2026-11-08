"use client";

import { useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import { initiales } from "@/crm/lib/format";
import Fenetre from "@/crm/exploitation/ui/Fenetre";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { ajouterContact, majContact, supprimerContact } from "./actions";
import type { Contact } from "./donnees";
import s from "./partenaires.module.css";

/** Les contacts d'une société : la liste, l'ajout et la modification dans une fenêtre, le retrait. */
export default function Contacts({ id, contacts }: { id: number; contacts: Contact[] }) {
  const [edite, setEdite] = useState<Contact | "nouveau" | null>(null);
  const [, lancer] = useTransition();
  const c = edite && edite !== "nouveau" ? edite : null;
  return (
    <>
      <div className={s.contacts}>
        {contacts.length === 0 && <p className={u.aide}>Aucun contact pour l&apos;instant.</p>}
        {contacts.map((x) => (
          <div key={x.id} className={s.contactLigne}>
            <i>{initiales(x.nom)}</i>
            <span>
              <b>
                {x.nom}
                {x.principal && (
                  <em className={u.etat} data-ton="vert">
                    Principal
                  </em>
                )}
              </b>
              <small>{x.fonction ?? "Fonction non renseignée"}</small>
              <small>
                {x.telephone && <a href={`tel:${x.telephone.replace(/\s/g, "")}`}>{x.telephone}</a>}
                {x.telephone && x.email && " · "}
                {x.email && <a href={`mailto:${x.email}`}>{x.email}</a>}
              </small>
            </span>
            <button type="button" className={`${u.bouton} ${u.petit}`} data-ton="secondaire" onClick={() => setEdite(x)}>
              Modifier
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={`${u.bouton} ${u.petit}`} data-ton="discret" onClick={() => setEdite("nouveau")} style={{ marginTop: 12 }}>
        <Icone nom="plus" taille={15} />
        Ajouter un contact
      </button>
      <Fenetre
        ouvert={!!edite}
        fermer={() => setEdite(null)}
        titre={c ? c.nom : "Nouveau contact"}
        sousTitre={c ? "Modifier le contact" : "Une personne de la société"}
        icone="equipe"
      >
        <Formulaire key={c?.id ?? "nouveau"} action={c ? majContact.bind(null, id, c.id) : ajouterContact.bind(null, id)} className={u.fenetreFormulaire} onSucces={() => setEdite(null)}>
          <div className={u.fenetreCorps}>
            <div className={u.champs}>
              <div className={`${u.champ} ${u.w6}`}>
                <label htmlFor="ct-nom">
                  Nom <em>*</em>
                </label>
                <input id="ct-nom" type="text" name="nom" defaultValue={c?.nom ?? ""} required />
              </div>
              <div className={`${u.champ} ${u.w6}`}>
                <label htmlFor="ct-fonction">Fonction</label>
                <input id="ct-fonction" type="text" name="fonction" defaultValue={c?.fonction ?? ""} />
              </div>
              <div className={`${u.champ} ${u.w6}`}>
                <label htmlFor="ct-telephone">Téléphone</label>
                <input id="ct-telephone" type="tel" name="telephone" defaultValue={c?.telephone ?? ""} />
              </div>
              <div className={`${u.champ} ${u.w6}`}>
                <label htmlFor="ct-email">E-mail</label>
                <input id="ct-email" type="email" name="email" defaultValue={c?.email ?? ""} />
              </div>
              <div className={`${u.champ} ${u.w12}`}>
                <label className={u.case}>
                  <input type="checkbox" name="principal" defaultChecked={c?.principal ?? contacts.length === 0} />
                  Contact principal de la société
                </label>
              </div>
            </div>
          </div>
          <div className={u.fenetrePied}>
            {c && (
              <button
                type="button"
                className={u.bouton}
                data-ton="danger"
                data-gauche
                onClick={() => {
                  if (!window.confirm(`Retirer ${c.nom} des contacts ?`)) return;
                  lancer(async () => {
                    await supprimerContact(id, c.id);
                    setEdite(null);
                  });
                }}
              >
                Retirer
              </button>
            )}
            <button type="button" className={u.bouton} data-ton="secondaire" onClick={() => setEdite(null)}>
              Annuler
            </button>
            <button type="submit" className={u.bouton}>
              {c ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </Formulaire>
      </Fenetre>
    </>
  );
}
