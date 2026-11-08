import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Bandeau from "@/ui/Bandeau";
import ActionsBandeau from "@/ui/ActionsBandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { Icone } from "@/ui/icones";
import { currentUser } from "@/crm/lib/auth";
import { TYPES } from "@/crm/lib/format";
import FilClient from "@/crm/discussion/FilClient";
import Fil from "@/crm/feed/Fil";
import { filtresDe, lireFeed, paramsDe } from "@/crm/feed/donnees";
import { ficheClient } from "@/crm/clients/donnees";
import { entreprisesPro } from "@/crm/clients/entreprises";
import { emailValide, lienTelephone, nomAffiche, telephoneLisible } from "@/crm/clients/commun";
import { Argent, Demandes, Doublons, Dossiers, Espaces, Identite, RendezVous, Section } from "@/crm/clients/Sections";
import { avisClientDuplique } from "@/crm/duplication/donnees";
import AvisDuplication from "@/crm/duplication/composants/AvisDuplication";
import { ConfirmerDuplicationClient, RenoncerDuplicationClient } from "@/crm/duplication/composants/DupliquerClient";
import { MenuAncres, type Ancre } from "@/app/(interne)/(coque)/dashboard/espace-client/_composants/suivi/MenuAncres";
import s from "@/crm/clients/clients.module.css";

export const dynamic = "force-dynamic";

/*
 * La fiche d'un client (/clients/<id>) : une longue page, ses rubriques au
 * menu de gauche, en ancres (comme le suivi d'un espace client) — identité
 * et contacts, dossiers, devis et factures, espace client, messages,
 * rendez-vous, demandes du site, et l'historique en dernier (son fil se
 * prolonge au défilement).
 *
 * La bande : son nom, son type, son téléphone et son e-mail ; ses gestes
 * (ui/ActionsBandeau) : un nouveau dossier pour lui (la création le rattache
 * d'emblée, ?client=), l'appeler, lui écrire, et dans « ⋯ » modifier sa fiche
 * et le retrouver ailleurs (Feed, historique de son e-mail).
 *
 * Les doublons possibles (même e-mail ou même téléphone) sont signalés en
 * tête, discrètement, avec leurs liens : la fusion n'existe pas encore.
 */

type Params = { modifier?: string; contact?: string; erreur?: string; enregistre?: string; espace?: string; ref?: string; m?: string; dupliquer?: string; duplique?: string };

/** L'instant du rendu (hors du composant : un rendu reste pur). */
const instant = () => Date.now();

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id);
  const f = Number.isSafeInteger(id) && id > 0 ? await ficheClient(id).catch(() => null) : null;
  return { title: f ? `${nomAffiche(f.client)} · Client` : "Client" };
}

export default async function PageClient({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  await currentUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  // La liste des espaces pro n'empêche jamais la fiche de s'ouvrir : sans elle, le rattachement se lit sans se modifier.
  const source = sp.duplique && /^\d+$/.test(sp.duplique) ? Number(sp.duplique) : null;
  const [f, entreprises, duplique] = await Promise.all([
    ficheClient(id),
    entreprisesPro().catch((e) => {
      console.error("Client : lecture des espaces pro impossible", e instanceof Error ? e.message : e);
      return [];
    }),
    // La fiche vient d'être dupliquée (?duplique=<origine>) : son bandeau ramène à la fiche d'origine.
    source ? avisClientDuplique(source) : Promise.resolve(null),
  ]);
  if (!f) notFound();
  const c = f.client;
  const nom = nomAffiche(c);

  // L'historique : le fil du Feed resserré sur ce client (ses dossiers, ses demandes, ses espaces) ; la suite se charge au défilement.
  const paramsFil = { objet: `c${id}` };
  const { filtres } = await filtresDe(paramsDe(paramsFil));
  const fil = await lireFeed(filtres, null, 25).catch((e) => {
    console.error("Client : lecture de l'historique impossible", e instanceof Error ? e.message : e);
    return { evenements: [], suite: null };
  });

  const maintenant = instant();
  const email = emailValide(c.email) ? String(c.email).trim() : null;
  const tel = lienTelephone(c.telephone);
  const tel2 = lienTelephone(c.telephone2);
  // Un client, un espace : son espace client (par son adresse e-mail ou par un de ses dossiers), tous ses dossiers dedans.
  const espaceOuvert = f.espaceClient.length > 0 || f.espaces.length > 0;
  const dansSonEspace = f.espaceClient.reduce((n, e) => n + e.dossiers.length, 0);
  const nonLus = f.espaces.reduce((n, e) => n + e.nonLus, 0);
  const reste = f.dossiers.reduce((a, d) => a + Math.max(0, d.reste), 0);
  const contact = c.societe && (c.prenom || c.nom) ? [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") : null;

  const ancres: Ancre[] = [
    { id: "identite", label: "Identité et contacts", icone: "clients", nombre: f.contacts.length || undefined },
    { id: "dossiers", label: "Dossiers", icone: "parcours", nombre: f.dossiers.length },
    { id: "argent", label: "Devis et factures", icone: "euro", nombre: f.factures.filter((x) => x.reste > 0).length || undefined, ton: reste > 0.5 ? "alerte" : undefined },
    { id: "espace", label: "Espace client", icone: "dossierClient", nombre: dansSonEspace || undefined },
    { id: "messages", label: "Messages", icone: "boite", nombre: nonLus || undefined, ton: nonLus ? "alerte" : undefined },
    { id: "rdv", label: "Rendez-vous", icone: "calendrier", nombre: f.rdvs.length || undefined },
    { id: "demandes", label: "Demandes du site", icone: "globe", nombre: f.demandes.length || undefined },
    { id: "historique", label: "Historique", icone: "fil" },
  ];

  const texte = (
    <span className={s.bandeTexte}>
      {contact && <span>{contact}</span>}
      {telephoneLisible(c.telephone) &&
        (tel ? (
          <a href={tel} title={`Appeler ${nom}`}>
            {telephoneLisible(c.telephone)}
          </a>
        ) : (
          <span>{telephoneLisible(c.telephone)}</span>
        ))}
      {email ? (
        <a href={`mailto:${email}`} title={`Écrire à ${email}`}>
          {email}
        </a>
      ) : (
        c.email && <span>{c.email}</span>
      )}
      {!c.telephone && !c.email && <span>Ni téléphone ni e-mail</span>}
    </span>
  );

  return (
    <div className="view">
      <Bandeau surtitre={`Clients · Client n° ${id}`} titre={nom} texte={texte} etiquettes={[TYPES[c.type] ?? c.type, f.dossiers.length ? null : "Sans dossier"]}>
        <ActionsBandeau
          principale={{ label: "Nouveau dossier", titre: "Nouveau dossier pour ce client : son identité déjà remplie", icone: "plus", href: `/dossiers/nouveau?client=${id}` }}
          icones={[
            !!tel && { label: "Appeler", titre: `Appeler ${nom} · ${telephoneLisible(c.telephone)}`, icone: "telephone", href: tel, nouvelOnglet: false },
            !!email && { label: "Écrire", titre: `Écrire à ${email}`, icone: "courrier", href: `mailto:${email}` },
          ]}
          plus={[
            { label: "Modifier la fiche", aide: "Identité, coordonnées, facturation, notes", icone: "crayon", href: `/clients/${id}?modifier=1#identite` },
            { label: "Dupliquer la fiche", aide: "Un autre contact de la même société : société et facturation reprises", icone: "dupliquer", href: `/clients/${id}?dupliquer=1#identite` },
            !!tel2 && { label: "Appeler l’autre numéro", aide: telephoneLisible(c.telephone2) ?? undefined, icone: "telephone", href: tel2 },
            "-",
            { label: "Tout son historique", aide: "Dans le Feed, ses dossiers, demandes et espaces", icone: "fil", href: `/feed?objet=c${id}` },
            !!email && { label: "Historique de son e-mail", aide: "Ses demandes du site et leurs devis", icone: "globe", href: `/dashboard/clients/${encodeURIComponent(email)}` },
          ]}
        />
      </Bandeau>

      {/* À cheval sur le bas de la bande (rangée `chevauche`, comme le parcours d'un dossier) : la fiche commence plus haut. */}
      <div className={`chevauche ${s.dessus}`}>
        <AvecMenu menu={<MenuAncres titre="Ce client" ancres={ancres} retour={{ href: "/clients", label: "Tous les clients" }} />}>
          <div className={s.fiche}>
            <Identite
              f={f}
              modifier={sp.modifier === "1"}
              contactOuvert={sp.contact === "1"}
              erreur={sp.erreur ?? null}
              espaceOuvert={espaceOuvert}
              entreprises={entreprises}
              // Une fiche tout juste dupliquée : le curseur attend le prénom de la nouvelle personne.
              focusIdentite={!!duplique && sp.modifier === "1"}
              avant={
                <>
                  {duplique && source && (
                    <AvisDuplication
                      titre={`Fiche dupliquée depuis ${duplique.nom}`}
                      texte="Société, facturation (adresse, SIREN, TVA), entreprise et notes reprises. Saisissez l'identité et les coordonnées de ce nouveau contact, puis enregistrez."
                      alerte={!c.nom?.trim() ? `Le nom est obligatoire : tant qu'il n'est pas enregistré, la fiche ne s'appelle que « ${nom} ».` : null}
                      lien={duplique.lien}
                      libelleLien="Fiche d'origine"
                      autre={!c.nom?.trim() && !c.email && !c.telephone ? <RenoncerDuplicationClient id={id} source={source} /> : null}
                    />
                  )}
                  {sp.dupliquer === "1" && !sp.modifier && <ConfirmerDuplicationClient id={id} nom={nom} />}
                  {sp.enregistre === "1" && (
                    <p className={s.flash} role="status">
                      <Icone nom="coche" taille={16} /> Fiche enregistrée.
                    </p>
                  )}
                  <Doublons doublons={f.doublons} />
                </>
              }
            />
            <Dossiers f={f} clientId={id} />
            <Argent f={f} />
            <Espaces f={f} clientId={id} retour={{ espace: sp.espace, ref: sp.ref, m: sp.m }} />

            <Section
              id="messages"
              titre="Messages"
              icone="boite"
              sous={
                espaceOuvert
                  ? `La discussion de ${f.espaces.length > 1 ? "chaque dossier de son espace" : "son espace"} client${nonLus ? ` · ${nonLus} non lu${nonLus > 1 ? "s" : ""}` : ""}`
                  : "La discussion passe par l’espace client"
              }
              actions={
                f.espaces.length > 0 && (
                  <Link href={`/dashboard/espace-client/messages?dossier=${f.espaces[0].id}`} className={s.boutonClair} prefetch={false}>
                    Boîte de réception
                  </Link>
                )
              }
            >
              {f.espaces.length > 0 ? (
                <div className={s.fils}>
                  {f.espaces.map((e) => (
                    <FilClient
                      key={e.id}
                      dossierId={e.id}
                      client={nom}
                      reference={e.ref}
                      liens={[
                        { href: `/dossiers/${e.dossierId}`, libelle: e.ref },
                        { href: `/dashboard/espace-client/messages?dossier=${e.id}`, libelle: "Boîte de réception" },
                      ]}
                    />
                  ))}
                </div>
              ) : (
                <p className={s.videSection}>
                  <Icone nom="boite" taille={18} />
                  <span>Pas de discussion : ce client n’a pas d’espace client. Il s’ouvre depuis un de ses dossiers.</span>
                </p>
              )}
            </Section>

            <RendezVous rdvs={f.rdvs} maintenant={maintenant} />

            <Demandes demandes={f.demandes} email={email} />

            <Section
              id="historique"
              titre="Historique"
              icone="fil"
              sous="Tout ce qui s’est passé sur ses dossiers, ses demandes et ses espaces, du plus récent au plus ancien"
              actions={
                <Link href={`/feed?objet=c${id}`} className={s.boutonClair} prefetch={false}>
                  Ouvrir dans le Feed
                </Link>
              }
            >
              {/* En dernier : la suite du fil se charge quand on approche du bas de la page. */}
              <div className={s.historique}>
                {fil.evenements.length ? (
                  <Fil initial={fil.evenements} suite={fil.suite} params={paramsFil} filtre />
                ) : (
                  <p className={s.videSection}>
                    <Icone nom="fil" taille={18} />
                    <span>Rien encore : chaque geste sur ses dossiers, ses demandes et son espace s’inscrira ici.</span>
                  </p>
                )}
              </div>
            </Section>
          </div>
        </AvecMenu>
      </div>
    </div>
  );
}
