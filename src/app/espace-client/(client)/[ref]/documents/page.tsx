import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { chargerEspace } from "@/lib/espace-client/espace";
import { lienFichier } from "@/lib/espace-client/fichiers";
import { dateCourte, dateHeure, dateLongue, estRecent, euros, nomPays, taille } from "@/lib/espace-client/format";
import { ESCALIER, MONTE_MEUBLE, POIDS_LOURD, STATIONNEMENT, libelleEtage } from "@/lib/espace-client/libelles";
import { aAccepte } from "@/lib/espace-client/progression";
import { CGV, RGPD } from "@/lib/espace-client/textes";
import { PageHero } from "../../../_ui/PageHero";
import { Preuve, TitreChapitre } from "../../../_ui/Cadre";
import { Icone } from "../../../_ui/Icone";
import { DepotPiece } from "./DepotPiece";
import { FormulaireCgv, TexteJuridique } from "./FormulaireCgv";
import { FormulaireConditions } from "./FormulaireConditions";
import { FormulaireDeclaration } from "./FormulaireDeclaration";
import { Sommaire } from "./Sommaire";

export const metadata: Metadata = { title: "Mes documents" };

const d = (n: number) => ({ "--d": n }) as CSSProperties;
const extension = (nom: string) => (nom.split(".").pop() ?? "PDF").slice(0, 4).toUpperCase();

/**
 * « Mes documents » — la page documents.html de la micro démo : pièces à
 * fournir (adaptées à la destination), conditions de livraison, déclaration
 * de valeurs, CGV et RGPD, et les documents déposés par l'équipe.
 */
export default async function MesDocuments({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const { dossier, client, requirements, documents, conditions, declaration, acceptations } = e;
  const inter = dossier.portee === "international";

  const certifConditions = aAccepte(acceptations, "conditions_livraison");
  const certifValeurs = aAccepte(acceptations, "declaration_valeurs");
  const cgv = aAccepte(acceptations, "cgv");
  const rgpd = aAccepte(acceptations, "rgpd");
  const conditionsOk = !!conditions?.valide_at && !!certifConditions;
  const valeursOk = declaration?.statut === "soumise";
  const cgvOk = !!cgv && !!rgpd;

  const pieces = requirements.map((r) => ({ r, depot: documents.find((x) => x.requirement_id === r.id) ?? null }));
  const formulaires = [
    { id: "conditions", t: "Conditions de livraison", s: "Questionnaire d'accès à la livraison · obligatoire", ok: conditionsOk },
    { id: "valeurs", t: "Déclaration de valeurs", s: "Document d'assurance, rempli en ligne", ok: valeursOk },
    { id: "cgv", t: "CGV et politique RGPD", s: "Acceptation en ligne horodatée", ok: cgvOk },
  ];
  const restant = pieces.filter((p) => p.r.obligatoire && !p.depot).length + formulaires.filter((f) => !f.ok).length;
  const libres = documents.filter((x) => x.source === "client" && !x.requirement_id);
  const equipe = documents.filter((x) => x.source === "equipe");

  return (
    <>
      <PageHero e={e} titre="Mes documents" sous="Pièces à fournir, formulaires à remplir en ligne et documents déposés par l'équipe Bailly." active="documents" />
      <main className="section">
        <div className="wrap chapters">
          <Sommaire
            chapitres={[
              { id: "pieces", titre: "Pièces à fournir", ok: pieces.every((p) => !p.r.obligatoire || p.depot) },
              { id: "conditions", titre: "Conditions de livraison", ok: conditionsOk },
              { id: "valeurs", titre: "Déclaration de valeurs", ok: valeursOk },
              { id: "cgv", titre: "CGV et RGPD", ok: cgvOk },
              { id: "equipe", titre: "Déposés par Bailly", ok: null },
            ]}
          />
          <div>
            {/* 01 · Pièces à fournir */}
            <section className="chapter" id="pieces">
              <TitreChapitre n="01">Pièces à fournir</TitreChapitre>
              <p className="chapter-intro apparait">
                {restant ? (
                  <>
                    Il vous reste <b style={{ color: "var(--ink)" }}>{restant} élément{restant > 1 ? "s" : ""}</b> à fournir.
                  </>
                ) : (
                  "Votre dossier est complet, merci !"
                )}{" "}
                {inter ? (
                  <>
                    La liste inclut les pièces exigées pour votre destination (<b style={{ color: "var(--ink)" }}>{nomPays(dossier.pays_destination)}</b>) et se met à jour automatiquement.
                  </>
                ) : (
                  "La liste s'adapte automatiquement à votre destination."
                )}
              </p>
              <div className="checklist">
                {pieces.map(({ r, depot }, i) => (
                  <div key={r.id} className={`ck ${depot ? "ok" : r.obligatoire ? "todo" : ""} apparait`} style={d(i)}>
                    <span className="s">
                      <Icone nom={depot ? "check" : "upload"} />
                    </span>
                    <div>
                      <strong>
                        {r.libelle}
                        {r.pays && <span className="flag">{nomPays(r.pays)}</span>}
                        {!r.obligatoire && <span className="flag" style={{ color: "var(--muted)" }}>Facultatif</span>}
                      </strong>
                      <small>
                        {depot ? (
                          <a href={lienFichier("doc", depot.id)} target="_blank" rel="noopener" style={{ textDecoration: "underline" }}>
                            {depot.nom_fichier}
                          </a>
                        ) : (
                          r.description
                        )}
                        {depot && ` · déposé le ${dateCourte(depot.created_at)}`}
                      </small>
                    </div>
                    {depot ? <span className="badge ok">Reçu</span> : <DepotPiece reference={ref} requirementId={r.id} />}
                  </div>
                ))}
                {formulaires.map((f, i) => (
                  <div key={f.id} className={`ck ${f.ok ? "ok" : "todo"} apparait`} style={d(pieces.length + i)}>
                    <span className="s">
                      <Icone nom={f.ok ? "check" : "documents"} />
                    </span>
                    <div>
                      <strong>{f.t}</strong>
                      <small>{f.s}</small>
                    </div>
                    {f.ok ? (
                      <span className="badge ok">Fait</span>
                    ) : (
                      <a className="btn btn-ghost btn-sm" href={`#${f.id}`}>
                        Remplir <Icone nom="arrow" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <div className="card mt-m apparait" style={{ padding: "18px 20px" }}>
                <p style={{ fontWeight: 600 }}>Un autre document à transmettre ?</p>
                {libres.length > 0 && (
                  <ul className="mini-docs">
                    {libres.map((x) => (
                      <li key={x.id}>
                        <Icone nom="check" style={{ width: 15, height: 15, color: "var(--ok)" }} /> {x.libelle} ·{" "}
                        <a href={lienFichier("doc", x.id)} target="_blank" rel="noopener">
                          {x.nom_fichier}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-s">
                  <DepotPiece reference={ref} libre />
                </div>
              </div>
              <p className="note" style={{ marginTop: 14 }}>
                <Icone nom="lock" /> PDF, JPEG, PNG ou HEIC · 10 Mo maximum · stockage privé, accès par lien signé de cinq minutes.
              </p>
            </section>

            {/* 02 · Conditions de livraison */}
            <section className="chapter" id="conditions">
              <TitreChapitre n="02">Conditions de livraison</TitreChapitre>
              {conditionsOk ? (
                <div className="card apparait">
                  <p style={{ fontWeight: 600 }}>Merci, vos conditions de livraison sont enregistrées.</p>
                  <p className="muted" style={{ marginTop: 6 }}>
                    Toute modification doit être signalée à votre conseiller. Livraison au <b style={{ color: "var(--ink)" }}>{conditions!.adresse_livraison}</b>.
                  </p>
                  <div className="quote-lines" style={{ marginTop: 16 }}>
                    {(
                      [
                        ["Étage", libelleEtage(conditions!.etage)],
                        ["Ascenseur", conditions!.ascenseur ? (conditions!.ascenseur_dimensions ? `Oui · ${conditions!.ascenseur_dimensions.largeur} × ${conditions!.ascenseur_dimensions.profondeur} × ${conditions!.ascenseur_dimensions.hauteur} cm` : "Oui") : "Non"],
                        ["Escalier", ESCALIER[conditions!.escalier]],
                        ["Distance de portage", `${conditions!.distance_portage_m} m`],
                        ["Accès poids lourd", POIDS_LOURD[conditions!.acces_poids_lourd]],
                        ["Stationnement", STATIONNEMENT[conditions!.stationnement]],
                        ["Rue", conditions!.particularites_rue.join(", ") || "—"],
                        ["Monte-meuble", MONTE_MEUBLE[conditions!.monte_meuble]],
                        ["Horaires restreints", conditions!.horaires_restreints ?? "Aucun"],
                        ...(conditions!.commentaire ? [["Commentaire", conditions!.commentaire] as [string, string]] : []),
                      ] as [string, string][]
                    ).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ color: "var(--muted)" }}>{k}</span>
                        <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {conditions!.photos.length > 0 && (
                    <div className="thumbs">
                      {conditions!.photos.map((p) => (
                        <a key={p.id} href={lienFichier("photo", p.id)} target="_blank" rel="noopener" className="f" title={p.nom}>
                          {p.nom}
                        </a>
                      ))}
                    </div>
                  )}
                  <Preuve titre="Informations certifiées exactes" quand={`Le ${dateHeure(certifConditions!.accepted_at)}`} version={certifConditions!.version_texte} ip={certifConditions!.ip} ua={certifConditions!.user_agent} />
                </div>
              ) : (
                <>
                  <p className="chapter-intro apparait">
                    Bailly organise l&apos;accès au chargement ; à la livraison, c&apos;est à vous de nous signaler les contraintes. Ce questionnaire est obligatoire : il évite les mauvaises surprises le jour J.
                  </p>
                  <FormulaireConditions reference={ref} adresse={dossier.adresse_arrivee} />
                </>
              )}
            </section>

            {/* 03 · Déclaration de valeurs */}
            <section className="chapter" id="valeurs">
              <TitreChapitre n="03">Déclaration de valeurs</TitreChapitre>
              {valeursOk ? (
                <div className="card apparait">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
                    <p style={{ fontWeight: 600 }}>Déclaration transmise à Bailly Déménagement</p>
                    <span className="num" style={{ fontSize: 40, fontWeight: 700 }}>
                      {euros(declaration!.total)}
                    </span>
                  </div>
                  <p className="note">
                    Par {declaration!.contenu.declarant_nom}, {declaration!.contenu.declarant_qualite.toLowerCase()}, à {declaration!.contenu.lieu} le {dateLongue(declaration!.contenu.date)}.
                  </p>
                  <div className="quote-lines" style={{ marginTop: 14 }}>
                    {declaration!.contenu.objets.map((o, i) => (
                      <div key={i}>
                        <span>
                          {o.designation}{" "}
                          <span style={{ color: "var(--muted)" }}>
                            · {o.categorie} · × {o.quantite}
                          </span>
                        </span>
                        <span>{euros(o.quantite * o.valeur_unitaire)}</span>
                      </div>
                    ))}
                  </div>
                  {certifValeurs ? (
                    <Preuve titre="Déclaration soumise sans erreur" quand={`Le ${dateHeure(certifValeurs.accepted_at)}`} version={certifValeurs.version_texte} ip={certifValeurs.ip} ua={certifValeurs.user_agent} />
                  ) : (
                    <p className="note mt-s">Transmise le {dateHeure(declaration!.soumise_at!)}.</p>
                  )}
                </div>
              ) : (
                <>
                  <p className="chapter-intro apparait">
                    Elle sert de base à votre assurance. Listez vos biens par catégorie avec leur valeur de remplacement : le total se calcule automatiquement.
                  </p>
                  <FormulaireDeclaration reference={ref} nom={client.societe ? "" : `${client.prenom} ${client.nom}`} lieu={dossier.ville_depart} />
                </>
              )}
            </section>

            {/* 04 · CGV et RGPD */}
            <section className="chapter" id="cgv">
              <TitreChapitre n="04">CGV et RGPD</TitreChapitre>
              {cgvOk ? (
                <div className="card apparait">
                  <p style={{ fontWeight: 600 }}>Vous avez accepté les conditions générales de vente et la politique de confidentialité.</p>
                  <div className="grid-2" style={{ gap: 12 }}>
                    <Preuve titre="Conditions générales de vente" quand={`Le ${dateHeure(cgv!.accepted_at)}`} version={cgv!.version_texte} ip={cgv!.ip} ua={cgv!.user_agent} />
                    <Preuve titre="Politique de confidentialité (RGPD)" quand={`Le ${dateHeure(rgpd!.accepted_at)}`} version={rgpd!.version_texte} ip={rgpd!.ip} ua={rgpd!.user_agent} />
                  </div>
                  <details className="mt-m">
                    <summary className="link-arrow" style={{ cursor: "pointer", listStyle: "none" }}>
                      <Icone nom="documents" /> Relire les textes
                    </summary>
                    <div className="stack mt-s">
                      <TexteJuridique titre="Conditions générales de vente" sections={CGV} />
                      <TexteJuridique titre="Politique de confidentialité" sections={RGPD} />
                    </div>
                  </details>
                </div>
              ) : (
                <>
                  <p className="chapter-intro apparait">Pas besoin d&apos;imprimer ni de signer : votre acceptation en ligne est horodatée et conservée avec la version du texte.</p>
                  <FormulaireCgv reference={ref} />
                </>
              )}
            </section>

            {/* 05 · Déposés par Bailly */}
            <section className="chapter" id="equipe">
              <TitreChapitre n="05">Déposés par Bailly</TitreChapitre>
              <p className="chapter-intro apparait">Attestation d&apos;assurance, lettre de voiture… Vous recevez un e-mail à chaque nouveau document.</p>
              {equipe.length ? (
                <div className="docs-team">
                  {equipe.map((x, i) => (
                    <div key={x.id} className="doc apparait" style={d(i)}>
                      <span className="fi">{extension(x.nom_fichier)}</span>
                      <div>
                        <strong>
                          {x.libelle}
                          {estRecent(x.created_at) && <span className="new-tag">NOUVEAU</span>}
                        </strong>
                        <small>
                          Déposé par l&apos;équipe le {dateLongue(x.created_at)} · {taille(x.taille_octets)}
                        </small>
                      </div>
                      <a className="btn btn-ghost btn-sm" href={lienFichier("doc", x.id)} target="_blank" rel="noopener">
                        <Icone nom="download" /> Télécharger
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-slot apparait">Votre attestation d&apos;assurance et votre lettre de voiture apparaîtront ici.</div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
