"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { analyserFichier, importerLignes } from "../actions";
import type { Feuille } from "../fichiers";
import {
  appliquerCorrespondance,
  CHAMPS,
  cleDoublon,
  devinerCorrespondance,
  estVide,
  LIGNE_VIDE,
  nbReconnus,
  verifierLigne,
  type Champ,
} from "../saisie";
import type { LigneSaisie } from "../types";
import { Picto } from "./Picto";
import d from "./dispatch.module.css";
import s from "./importeur.module.css";

/*
 * L'import des clients d'un conteneur, en trois temps : la source (fichier
 * CSV ou Excel déposé, ou saisie à la main), la correspondance des colonnes
 * du fichier avec les champs du dispatch, puis la vérification ligne à ligne
 * dans une grille modifiable. Les erreurs se lisent en clair et se corrigent
 * sur place ; le serveur revérifie tout avant d'écrire.
 */

type Fichier = { nom: string; format: "csv" | "excel"; feuilles: Feuille[] };
const COLONNES: (keyof LigneSaisie)[] = ["client", "ville", "pays", "volume", "remarques", "dossier", "telephone"];
const TITRES: Record<keyof LigneSaisie, string> = {
  client: "Client",
  ville: "Ville",
  pays: "Pays",
  volume: "Volume (m³)",
  remarques: "Remarques",
  dossier: "Dossier CRM",
  telephone: "Téléphone",
};
const lettre = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`);
const vides = (n: number) => Array.from({ length: n }, () => ({ ...LIGNE_VIDE }));

export default function Importeur({
  planId,
  planNom,
  capaciteMax,
  refs,
  existants,
  manuel,
}: {
  planId: number;
  planNom: string;
  capaciteMax: number;
  /** Les références de dossiers du CRM, en majuscules, avec le nom du client. */
  refs: [string, string][];
  /** « client|ville » des clients déjà dans le plan, pour signaler les doublons. */
  existants: string[];
  manuel: boolean;
}) {
  const router = useRouter();
  const [source, setSource] = useState<"fichier" | "manuel">(manuel ? "manuel" : "fichier");
  const [fichier, setFichier] = useState<Fichier | null>(null);
  const [feuille, setFeuille] = useState(0);
  const [titres, setTitres] = useState(true);
  const [corr, setCorr] = useState<Record<Champ, number> | null>(null);
  const [lignes, setLignes] = useState<LigneSaisie[]>(() => (manuel ? vides(6) : []));
  const [seulementErreurs, setSeulementErreurs] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [lecture, demarrerLecture] = useTransition();
  const [envoi, demarrerEnvoi] = useTransition();

  const dossiers = useMemo(() => new Map(refs), [refs]);
  const deja = useMemo(() => new Set(existants), [existants]);

  /* ── Les lignes du fichier, selon la feuille, les titres et la correspondance ── */
  const recalculer = (f: Fichier, i: number, avecTitres: boolean, c: Record<Champ, number>) => {
    const brutes = f.feuilles[i]?.lignes ?? [];
    setLignes(brutes.slice(avecTitres ? 1 : 0).map((l) => appliquerCorrespondance(l, c)).filter((l) => !estVide(l)));
  };
  const choisirFeuille = (f: Fichier, i: number) => {
    const entetes = f.feuilles[i]?.lignes[0] ?? [];
    const devine = devinerCorrespondance(entetes);
    const avecTitres = nbReconnus(devine) >= 2;
    // Sans titres reconnus, on propose l'ordre du modèle : client, ville, pays, volume, remarques.
    const c = avecTitres ? devine : ({ client: 0, ville: 1, pays: 2, destination: -1, volume: 3, remarques: 4, dossier: -1, telephone: -1 } as Record<Champ, number>);
    setFeuille(i);
    setTitres(avecTitres);
    setCorr(c);
    recalculer(f, i, avecTitres, c);
  };

  const lire = (f: File | undefined) => {
    if (!f) return;
    setErreur(null);
    demarrerLecture(async () => {
      const donnees = new FormData();
      donnees.set("fichier", f);
      const r = await analyserFichier(donnees);
      if (!r.ok || !r.donnees) {
        setErreur(r.ok ? "Fichier illisible." : r.erreur);
        return;
      }
      const lu = r.donnees;
      setFichier(lu);
      setSource("fichier");
      // La première feuille qui a des lignes sous ses titres.
      const i = Math.max(0, lu.feuilles.findIndex((x) => x.lignes.length > 1));
      choisirFeuille(lu, i);
    });
  };

  /* ── La vérification ── */
  const verdicts = useMemo(() => {
    const vus = new Map<string, number>();
    return lignes.map((l, i) => {
      if (estVide(l)) return null;
      const cle = cleDoublon(l);
      const doublon = deja.has(cle) || (vus.has(cle) && vus.get(cle) !== i);
      if (!vus.has(cle)) vus.set(cle, i);
      return verifierLigne(l, { capaciteMax, dossiers, doublon });
    });
  }, [lignes, deja, capaciteMax, dossiers]);
  const pleines = verdicts.filter((v) => v != null);
  const pretes = lignes.filter((_, i) => verdicts[i] && verdicts[i]!.erreurs.length === 0);
  const aCorriger = pleines.filter((v) => v!.erreurs.length > 0).length;
  const avertis = pleines.filter((v) => v!.erreurs.length === 0 && v!.avertissements.length > 0).length;
  const volume = Math.round(verdicts.reduce((n, v) => n + (v && !v.erreurs.length ? (v.volume ?? 0) : 0), 0) * 10) / 10;

  const modifier = (i: number, k: keyof LigneSaisie, v: string) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  /** Coller un bloc copié d'Excel (tabulations, retours à la ligne) le répartit dans la grille à partir de la cellule. */
  const coller = (i: number, k: keyof LigneSaisie, e: React.ClipboardEvent<HTMLInputElement>) => {
    const texte = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(texte.trim())) return;
    e.preventDefault();
    const bloc = texte.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((r) => r.split("\t"));
    const depart = COLONNES.indexOf(k);
    setLignes((ls) => {
      const suite = [...ls];
      bloc.forEach((r, di) => {
        const l = { ...(suite[i + di] ?? LIGNE_VIDE) };
        r.forEach((v, dj) => {
          const champ = COLONNES[depart + dj];
          if (champ) l[champ] = v.trim();
        });
        suite[i + di] = l;
      });
      return suite;
    });
  };

  const importer = () =>
    demarrerEnvoi(async () => {
      setErreurEnvoi(null);
      const entetes = fichier?.feuilles[feuille]?.lignes[0] ?? [];
      const correspondance =
        source === "fichier" && corr
          ? Object.fromEntries(
              Object.entries(corr)
                .filter(([, i]) => i >= 0)
                .map(([champ, i]) => [champ, titres ? entetes[i] || `Colonne ${lettre(i)}` : `Colonne ${lettre(i)}`]),
            )
          : null;
      const r = await importerLignes(planId, {
        source: source === "manuel" || !fichier ? "manuel" : fichier.format,
        fichier: source === "fichier" ? (fichier?.nom ?? null) : null,
        correspondance,
        lignes: pretes,
      });
      if (!r.ok) return setErreurEnvoi(r.erreur);
      router.push(`/conteneurs/dispatch/${planId}?importe=${r.donnees?.importees ?? pretes.length}`);
    });

  const brutes = fichier?.feuilles[feuille]?.lignes ?? [];
  const entetes = brutes[0] ?? [];
  const exemple = brutes[titres ? 1 : 0] ?? [];
  const afficher = lignes.map((l, i) => ({ l, i, v: verdicts[i] })).filter((x) => !seulementErreurs || (x.v && x.v.erreurs.length > 0));
  const grilleVisible = source === "manuel" || (fichier && corr);

  return (
    <div className={`${d.racine} ${s.etapes}`}>
      {/* ── 1. La source ── */}
      <section className={s.etape}>
        <div className={s.etapeTete}>
          <span className={s.numero}>1</span>
          <div>
            <h2>D&apos;où viennent les clients ?</h2>
            <p>Un fichier du groupeur ou de l&apos;agent, ou une saisie à la main dans le tableau.</p>
          </div>
        </div>
        <div className={s.sources}>
          <label
            className={`${s.depot} ${survol ? s.survol : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              lire(e.dataTransfer.files[0]);
            }}
          >
            <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => lire(e.target.files?.[0])} />
            <span className={s.icone}>
              <Picto nom={lecture ? "horloge" : "importer"} taille={24} />
            </span>
            <b>{lecture ? "Lecture du fichier…" : "Déposez un fichier CSV ou Excel"}</b>
            <small>ou cliquez pour le choisir · .xlsx, .csv (séparateur ; ou ,) · 10 Mo au plus</small>
          </label>
          <div className={s.manuel}>
            <b>Pas de fichier ?</b>
            <span>Saisissez les clients dans le tableau, ou collez-y directement un bloc copié depuis Excel.</span>
            <div className={d.actions}>
              <button
                type="button"
                className={source === "manuel" ? d.boutonPlein : d.bouton}
                onClick={() => {
                  setSource("manuel");
                  setFichier(null);
                  setCorr(null);
                  setLignes((ls) => (ls.length && !fichier ? ls : vides(6)));
                }}
              >
                <Picto nom="crayon" taille={16} /> Saisir à la main
              </button>
              <a className={d.bouton} href="/api/dispatch/modele">
                <Picto nom="tableur" taille={16} /> Modèle Excel
              </a>
            </div>
          </div>
        </div>
        {fichier && (
          <div className={s.fichier}>
            <Picto nom={fichier.format === "excel" ? "tableur" : "importer"} taille={16} />
            <b>{fichier.nom}</b>
            <span>
              {fichier.format === "excel" ? "Excel" : "CSV"} · {Math.max(0, brutes.length - (titres ? 1 : 0))} ligne{brutes.length - (titres ? 1 : 0) > 1 ? "s" : ""}
            </span>
            {fichier.feuilles.length > 1 && (
              <select value={feuille} onChange={(e) => choisirFeuille(fichier, Number(e.target.value))} style={{ width: "auto", padding: "6px 10px" }} aria-label="Feuille du classeur">
                {fichier.feuilles.map((f, i) => (
                  <option key={i} value={i}>
                    Feuille « {f.nom} » · {f.lignes.length} lignes
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {erreur && (
          <p className={d.erreur} style={{ marginTop: 14 }}>
            {erreur}
          </p>
        )}
      </section>

      {/* ── 2. La correspondance des colonnes ── */}
      {source === "fichier" && fichier && corr && (
        <section className={s.etape}>
          <div className={s.etapeTete}>
            <span className={s.numero}>2</span>
            <div>
              <h2>Correspondance des colonnes</h2>
              <p>Reconnue d&apos;après les titres du fichier ; corrigez-la si besoin. Les champs marqués * sont obligatoires.</p>
            </div>
          </div>
          <label className={d.case} style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={titres}
              onChange={(e) => {
                setTitres(e.target.checked);
                recalculer(fichier, feuille, e.target.checked, corr);
              }}
            />
            <span>La première ligne contient les titres des colonnes</span>
          </label>
          <div className={s.correspondance}>
            {CHAMPS.map((c) => {
              const i = corr[c.cle];
              const manque = c.requis && i < 0;
              return (
                <div key={c.cle} className={manque ? s.manque : ""}>
                  <label htmlFor={`corr-${c.cle}`}>
                    {c.nom} {c.requis && <em>*</em>}
                  </label>
                  <select
                    id={`corr-${c.cle}`}
                    value={i}
                    onChange={(e) => {
                      const n = { ...corr, [c.cle]: Number(e.target.value) };
                      setCorr(n);
                      recalculer(fichier, feuille, titres, n);
                    }}
                  >
                    <option value={-1}>— Ignorer —</option>
                    {entetes.map((t, k) => (
                      <option key={k} value={k}>
                        {lettre(k)} · {titres ? t || "(sans titre)" : `colonne ${lettre(k)}`}
                      </option>
                    ))}
                  </select>
                  <small>{i >= 0 && exemple[i] ? `ex. ${exemple[i]}` : c.aide}</small>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 3. La vérification ── */}
      {grilleVisible && (
        <section className={s.etape}>
          <div className={s.etapeTete}>
            <span className={s.numero}>{source === "fichier" ? 3 : 2}</span>
            <div>
              <h2>{source === "fichier" ? "Vérification avant import" : "Saisie des clients"}</h2>
              <p>Chaque cellule se modifie. Une ligne en erreur n&apos;est pas importée ; un avertissement n&apos;empêche rien.</p>
            </div>
          </div>
          <div className={s.compteurs}>
            <span className={`${s.compteur} ${s.ok}`}>
              <Picto nom="coche" taille={13} /> {pretes.length} prête{pretes.length > 1 ? "s" : ""}
            </span>
            {aCorriger > 0 && (
              <span className={`${s.compteur} ${s.ko}`}>
                <Picto nom="alerte" taille={13} /> {aCorriger} à corriger
              </span>
            )}
            {avertis > 0 && <span className={`${s.compteur} ${s.avis}`}>{avertis} avec avertissement</span>}
            <span className={d.espace} />
            {aCorriger > 0 && (
              <label className={d.case}>
                <input type="checkbox" checked={seulementErreurs} onChange={(e) => setSeulementErreurs(e.target.checked)} />
                <span>Afficher seulement les lignes à corriger</span>
              </label>
            )}
          </div>
          <div className={s.grille}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>#</th>
                  {COLONNES.map((k) => (
                    <th key={k}>
                      {TITRES[k]}
                      {(k === "client" || k === "volume") && " *"}
                    </th>
                  ))}
                  <th>État</th>
                  <th aria-label="Supprimer" />
                </tr>
              </thead>
              <tbody>
                {afficher.map(({ l, i, v }) => (
                  <tr key={i} className={v && v.erreurs.length ? s.erreurLigne : ""}>
                    <td>{i + 1}</td>
                    {COLONNES.map((k) => {
                      const faux = v?.erreurs.some((x) => x.champ === k);
                      const douteux = v?.avertissements.some((x) => x.champ === k);
                      return (
                        <td key={k} style={{ minWidth: k === "remarques" ? 220 : k === "client" ? 190 : k === "pays" ? 160 : k === "volume" ? 90 : 130 }}>
                          <input
                            type="text"
                            value={l[k]}
                            inputMode={k === "volume" ? "decimal" : undefined}
                            className={faux ? s.fausse : douteux ? s.douteuse : ""}
                            aria-label={`${TITRES[k]}, ligne ${i + 1}`}
                            aria-invalid={faux || undefined}
                            onChange={(e) => modifier(i, k, e.target.value)}
                            onPaste={(e) => coller(i, k, e)}
                          />
                        </td>
                      );
                    })}
                    <td className={s.statut}>
                      {!v ? (
                        <span style={{ color: "#a7a3b8" }}>Ligne vide</span>
                      ) : v.erreurs.length ? (
                        v.erreurs.map((x, n) => (
                          <span key={n} className={s.rouge}>
                            <Picto nom="alerte" taille={12} />
                            {x.texte}
                          </span>
                        ))
                      ) : (
                        <>
                          <span className={s.vert}>
                            <Picto nom="coche" taille={12} /> Prête
                          </span>
                          {v.avertissements.map((x, n) => (
                            <span key={n} className={s.orange}>
                              {x.texte}
                            </span>
                          ))}
                          {l.dossier.trim() && dossiers.get(l.dossier.trim().toUpperCase()) && (
                            <span style={{ color: "#0369a1" }}>
                              <Picto nom="lien" taille={12} /> {dossiers.get(l.dossier.trim().toUpperCase())}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <button type="button" className={s.suppr} aria-label={`Supprimer la ligne ${i + 1}`} onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}>
                        <Picto nom="corbeille" taille={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {afficher.length === 0 && (
                  <tr>
                    <td colSpan={COLONNES.length + 3} style={{ padding: 30, textAlign: "center", color: "#77738f" }}>
                      {seulementErreurs ? "Plus aucune ligne à corriger." : "Aucune ligne : ajoutez-en une, ou collez un bloc copié d'Excel."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={s.sousGrille}>
            <div className={d.actions}>
              <button type="button" className={`${d.bouton} ${d.petit}`} onClick={() => setLignes((ls) => [...ls, { ...LIGNE_VIDE }])}>
                <Picto nom="plus" taille={14} /> Ajouter une ligne
              </button>
              <button type="button" className={`${d.bouton} ${d.petit}`} onClick={() => setLignes((ls) => [...ls, ...vides(5)])}>
                + 5 lignes
              </button>
            </div>
            <small style={{ color: "#77738f", fontSize: 12 }}>Astuce : copiez des cellules dans Excel et collez-les dans la première colonne voulue.</small>
          </div>
        </section>
      )}

      {grilleVisible && (
        <div className={s.barreImport}>
          <p>
            {pretes.length ? (
              <>
                <b>
                  {pretes.length} client{pretes.length > 1 ? "s" : ""} · {String(volume).replace(".", ",")} m³
                </b>{" "}
                {pretes.length > 1 ? "seront ajoutés" : "sera ajouté"} à « {planNom} », dans la colonne « À répartir ».
                {aCorriger > 0 && ` ${aCorriger} ligne${aCorriger > 1 ? "s" : ""} à corriger ne ${aCorriger > 1 ? "seront" : "sera"} pas importée${aCorriger > 1 ? "s" : ""}.`}
              </>
            ) : (
              "Aucune ligne prête à importer pour l'instant."
            )}
            {erreurEnvoi && <span style={{ display: "block", color: "#fecdd3", marginTop: 4 }}>{erreurEnvoi}</span>}
          </p>
          <button type="button" className={d.bouton} onClick={() => router.push(`/conteneurs/dispatch/${planId}`)} style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}>
            Annuler
          </button>
          <button type="button" className={d.boutonPlein} disabled={envoi || pretes.length === 0} onClick={importer}>
            <Picto nom="importer" taille={16} /> {envoi ? "Import…" : `Importer ${pretes.length} client${pretes.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
