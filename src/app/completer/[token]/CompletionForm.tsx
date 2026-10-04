"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import PhotoAnalyzer, { type LibraryPhoto } from "@/components/PhotoAnalyzer";
import type { AnalyzedPhoto } from "@/components/PhotoAnalysisCard";
import { completeRequest } from "@/lib/actions/completion";
import { AddressInput } from "@/app/demande/AddressInput";
import { BrandPanel, Bouton, Cadre, Erreur, Manque, Titre, delai } from "@/app/demande/cadre";
import { Bloc, CarteChoix, Field, Icone, TextInput, YesNo, type NomIcone } from "@/app/demande/ui";
import {
  ListeMeubles,
  MODES_VOLUME,
  SaisieVolume,
  volumeDe,
  type ListItem,
  type VolumeMode,
} from "@/app/demande/volume";

type Addr = {
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  etage: number | null;
  ascenseur: boolean | null;
};

type Data = {
  client_nom: string | null;
  client_email: string | null;
  client_tel: string | null;
  date_souhaitee: string | null;
  volume_m3: number | null;
  depart: Addr;
  arrivee: Addr;
};

/** L'ascenseur en trois états : oui, non, ou pas encore dit. */
type AddrState = { adresse: string; code_postal: string; ville: string; etage: string; ascenseur: "oui" | "non" | "" };

function toState(a: Addr): AddrState {
  return {
    adresse: a.adresse ?? "",
    code_postal: a.code_postal ?? "",
    ville: a.ville ?? "",
    etage: a.etage != null ? String(a.etage) : "",
    ascenseur: a.ascenseur == null ? "" : a.ascenseur ? "oui" : "non",
  };
}

/**
 * La page « Complétez votre demande ».
 *
 * Le client y arrive par le lien d'un message : il manque une ville ou un
 * volume pour chiffrer. Elle reprend la coque du formulaire de devis — le
 * même panneau, les mêmes cartes, la même barre d'action — pour qu'il
 * retrouve l'écran qu'il a quitté, et non un formulaire de secours.
 *
 * Ce qui manque est demandé en premier ; ce qui est déjà connu reste
 * modifiable en dessous.
 */
export default function CompletionForm({
  token,
  library,
  data,
}: {
  token: string;
  library: LibraryPhoto[];
  data: Data;
}) {
  // Ce qui manquait à l'ouverture de la page : c'est ce qu'on demande.
  const manque = {
    depart: !data.depart.ville,
    arrivee: !data.arrivee.ville,
    // Un volume nul n'en est pas un : il a été semé à zéro faute de mieux.
    volume: data.volume_m3 == null || data.volume_m3 <= 0,
  };

  const [nom, setNom] = useState(data.client_nom ?? "");
  const [tel, setTel] = useState(data.client_tel ?? "");
  const [date, setDate] = useState(data.date_souhaitee ? data.date_souhaitee.slice(0, 10) : "");

  const [depart, setDepart] = useState<AddrState>(toState(data.depart));
  const [arrivee, setArrivee] = useState<AddrState>(toState(data.arrivee));
  const patchDepart = (p: Partial<AddrState>) => setDepart((s) => ({ ...s, ...p }));
  const patchArrivee = (p: Partial<AddrState>) => setArrivee((s) => ({ ...s, ...p }));

  const [mode, setMode] = useState<VolumeMode>("explicit");
  const [explicitVolume, setExplicitVolume] = useState("");
  const [items, setItems] = useState<ListItem[]>([]);
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const volume = volumeDe(mode, explicitVolume, items, photos);

  // Les points à compléter, et où ils en sont.
  const points: { cle: string; label: string; fait: boolean }[] = [
    ...(manque.depart ? [{ cle: "depart", label: "Ville de départ", fait: depart.ville.trim().length > 0 }] : []),
    ...(manque.arrivee ? [{ cle: "arrivee", label: "Ville d'arrivée", fait: arrivee.ville.trim().length > 0 }] : []),
    ...(manque.volume ? [{ cle: "volume", label: "Volume à déménager", fait: volume != null && volume > 0 }] : []),
  ];
  const restant = points.filter((p) => !p.fait);
  const etat = (cle: string) => points.find((p) => p.cle === cle)?.fait ?? false;

  const addrPayload = (a: AddrState) => ({
    ville: a.ville || undefined,
    adresse: a.adresse || undefined,
    code_postal: a.code_postal || undefined,
    etage: a.etage === "" ? null : Number(a.etage),
    ascenseur: a.ascenseur === "" ? undefined : a.ascenseur === "oui",
  });

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await completeRequest(token, {
        volume_m3: manque.volume ? volume : null,
        volume_method: volume != null && manque.volume ? mode : null,
        photos: mode === "ai" && manque.volume ? (photos as never) : undefined,
        items: mode === "list" && manque.volume ? items : undefined,
        client: { nom, tel },
        depart: addrPayload(depart),
        arrivee: addrPayload(arrivee),
        date_souhaitee: date,
      });
      if (!r.ok) throw new Error(r.error ?? "Erreur");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <Merci volume={manque.volume ? volume : data.volume_m3} email={data.client_email} />;

  const prenom = (data.client_nom ?? "").trim().split(/\s+/)[0] ?? "";
  const volumeConnu = manque.volume ? volume : data.volume_m3;
  const trajet =
    depart.ville.trim() && arrivee.ville.trim()
      ? `${depart.ville.trim()} → ${arrivee.ville.trim()}`
      : depart.ville.trim() || arrivee.ville.trim() || null;
  const modeActif = MODES_VOLUME.find((m) => m.key === mode) ?? MODES_VOLUME[0];
  let rang = 0;
  const suivant = () => rang++ * 70;

  return (
    <Cadre
      panneau={
        <BrandPanel
          milieu={<Points points={points} />}
          recap={[
            ["Trajet", trajet],
            ["Volume", volumeConnu != null && volumeConnu > 0 ? `${volumeConnu} m³` : null],
            ["Période", date ? dateLisible(date) : null],
          ]}
        />
      }
      etiquette={restant.length ? `${restant.length} à compléter` : "Tout est prêt"}
      progression={points.length ? 12 + ((points.length - restant.length) / points.length) * 88 : 100}
      barre={
        <>
          <div className="min-w-0 flex-1">
            {restant.length ? (
              <Manque>Il manque : {restant.map((p) => p.label.toLowerCase()).join(", ")}</Manque>
            ) : (
              <p className="text-right text-[12.5px] text-ink-soft sm:text-left">
                Tout y est — vous pouvez valider votre demande.
              </p>
            )}
          </div>
          <Bouton onClick={submit} disabled={restant.length > 0 || submitting}>
            {submitting ? "Envoi…" : "Valider ma demande"}
          </Bouton>
        </>
      }
    >
      <Titre
        pastille={restant.length ? restant.length : <Icone nom="check" taille={11} trait={3.4} />}
        texte={restant.length ? "à compléter" : "Tout est prêt"}
        eyebrow="Votre demande"
        avant={prenom ? `${prenom}, ` : ""}
        accent={prenom ? "complétez" : "Complétez"}
        apres=" votre demande"
        sub="Il ne manque que quelques informations pour établir votre estimation. Cela vous prendra moins de deux minutes."
      />

      <div className="space-y-5">
        {/* ── Ce qui manque, d'abord ── */}
        {manque.depart && (
          <BlocAdresse
            icone="pin"
            titre="Votre adresse de départ"
            sous="La ville suffit pour calculer la distance ; l'adresse précise affine l'estimation."
            v={depart}
            on={patchDepart}
            delai={suivant()}
            etiquette={{ texte: etat("depart") ? "Renseigné" : "À compléter", fait: etat("depart") }}
            villeRequise
          />
        )}
        {manque.arrivee && (
          <BlocAdresse
            icone="maison"
            titre="Votre adresse d'arrivée"
            sous="La ville suffit pour calculer la distance ; l'adresse précise affine l'estimation."
            v={arrivee}
            on={patchArrivee}
            delai={suivant()}
            etiquette={{ texte: etat("arrivee") ? "Renseigné" : "À compléter", fait: etat("arrivee") }}
            villeRequise
          />
        )}
        {manque.volume && (
          <>
            <div className="reveal grid gap-3 sm:grid-cols-3" style={delai(suivant())}>
              {MODES_VOLUME.map((m) => (
                <CarteChoix
                  key={m.key}
                  active={mode === m.key}
                  onClick={() => setMode(m.key)}
                  icone={m.icone}
                  titre={m.titre}
                  texte={m.texte}
                />
              ))}
            </div>
            <div key={mode}>
              <Bloc
                icone={modeActif.icone}
                titre="Votre volume à déménager"
                sous={modeActif.texte}
                delai={suivant()}
                etiquette={{ texte: etat("volume") ? "Renseigné" : "À compléter", fait: etat("volume") }}
              >
                {mode === "explicit" && <SaisieVolume valeur={explicitVolume} onChange={setExplicitVolume} />}
                {mode === "list" && <ListeMeubles items={items} onChange={setItems} />}
                {mode === "ai" && <PhotoAnalyzer library={library} photos={photos} onChange={setPhotos} />}
              </Bloc>
            </div>
          </>
        )}

        {/* ── Ce qui est déjà connu, modifiable ── */}
        <Bloc
          icone="user"
          titre="Vos informations"
          sous="Déjà renseignées — corrigez-les si besoin."
          delai={suivant()}
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom">
                <TextInput icone="user" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" />
              </Field>
              <Field label="Téléphone">
                <TextInput icone="tel" type="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="06 12 34 56 78" autoComplete="tel" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {data.client_email && (
                <Field label="E-mail" hint="non modifiable">
                  <TextInput icone="mail" value={data.client_email} readOnly className="bg-subtle text-ink-soft" />
                </Field>
              )}
              <Field label="Date souhaitée" hint="facultatif">
                <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            {!manque.volume && (
              <p className="flex items-center gap-2.5 rounded-[18px] bg-subtle px-4 py-3 text-[14px]">
                <Icone nom="carton" taille={17} className="shrink-0 text-ink-soft" />
                <span>
                  Volume déjà estimé : <span className="font-semibold">{data.volume_m3} m³</span>
                </span>
              </p>
            )}
          </div>
        </Bloc>

        {!manque.depart && (
          <BlocAdresse icone="pin" titre="Votre adresse de départ" sous="Déjà renseignée — corrigez-la si besoin." v={depart} on={patchDepart} delai={suivant()} />
        )}
        {!manque.arrivee && (
          <BlocAdresse icone="maison" titre="Votre adresse d'arrivée" sous="Déjà renseignée — corrigez-la si besoin." v={arrivee} on={patchArrivee} delai={suivant()} />
        )}
      </div>

      {error && <Erreur>{error}</Erreur>}
    </Cadre>
  );
}

/** « 2026-11-15 » devient « 15 novembre 2026 ». */
function dateLisible(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Dans le panneau : ce qu'il reste à donner, coché à mesure que c'est fait. */
function Points({ points }: { points: { cle: string; label: string; fait: boolean }[] }) {
  if (points.length === 0)
    return (
      <p className="max-w-[22ch] text-[15px] leading-relaxed text-white/75">
        Votre demande est complète : vérifiez vos informations, puis validez.
      </p>
    );
  return (
    <div>
      <p className="eyebrow text-white/55">Il nous manque</p>
      <ol className="mt-5 space-y-4">
        {points.map((p, i) => (
          <li key={p.cle} className="flex items-center gap-4">
            <span
              className={`flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-[background-color,color,box-shadow] duration-300 ${
                p.fait
                  ? "bg-brand text-[#1b1a18]"
                  : "border border-white/28 bg-[#22211e] text-white/70"
              }`}
            >
              {p.fait ? <Icone nom="check" taille={13} trait={3.2} className="coche-pop" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-[14px] leading-tight ${p.fait ? "text-white/85" : "font-semibold text-white"}`}>
                {p.label}
              </span>
              <span className="mt-1 block text-[11.5px] leading-tight text-white/50">
                {p.fait ? "Renseigné" : "À compléter"}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Une adresse : la rue, la ville, l'étage et l'ascenseur. */
function BlocAdresse({
  icone,
  titre,
  sous,
  v,
  on,
  delai: retard,
  etiquette,
  villeRequise = false,
}: {
  icone: NomIcone;
  titre: string;
  sous: string;
  v: AddrState;
  on: (p: Partial<AddrState>) => void;
  delai: number;
  etiquette?: { texte: string; fait?: boolean };
  villeRequise?: boolean;
}) {
  return (
    <Bloc icone={icone} titre={titre} sous={sous} delai={retard} etiquette={etiquette}>
      <div className="space-y-5">
        <Field label="Adresse" hint="facultatif">
          <AddressInput
            kind="address"
            value={v.adresse}
            placeholder="12 rue de la République, Paris"
            onChange={(x) => on({ adresse: x })}
            onSelect={(p) => on({ adresse: p.label, ville: p.ville, code_postal: p.code_postal })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Field label="Code postal">
            <TextInput value={v.code_postal} onChange={(e) => on({ code_postal: e.target.value })} placeholder="69003" inputMode="numeric" />
          </Field>
          <Field label={villeRequise ? "Ville *" : "Ville"} hint="choisissez dans la liste">
            <AddressInput
              kind="municipality"
              value={v.ville}
              placeholder="Lyon"
              onChange={(x) => on({ ville: x })}
              onSelect={(p) => on({ ville: p.ville, code_postal: p.code_postal })}
            />
          </Field>
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <Field label="Étage" hint="0 = RDC">
            <TextInput type="number" min={0} value={v.etage} onChange={(e) => on({ etage: e.target.value.replace(/[^\d]/g, "") })} placeholder="0" />
          </Field>
          <Field groupe label="Ascenseur ?">
            <YesNo value={v.ascenseur} onChange={(x) => on({ ascenseur: x })} />
          </Field>
        </div>
      </div>
    </Bloc>
  );
}

/** L'écran de fin : sur le décor de la vitrine, comme la confirmation d'un devis. */
function Merci({ volume, email }: { volume: number | null; email: string | null }) {
  return (
    <div className="grain relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#1b1a18] px-6 py-16">
      <div aria-hidden className="absolute inset-0">
        <Image src="/login-interieur.jpg" alt="" fill priority sizes="100vw" className="ken-burns object-cover" />
        <div className="absolute inset-0 bg-[#1b1a18]/70" />
        <div className="absolute inset-0 bg-linear-to-b from-[#1b1a18]/85 via-[#1b1a18]/40 to-[#1b1a18]/95" />
        <div
          className="halo drift absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2"
          style={{ "--halo": "rgba(245,208,51,0.2)" } as CSSProperties}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg text-center">
        <div className="reveal mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand text-[#1b1a18] shadow-[0_0_0_10px_rgba(245,208,51,0.18)]">
          <Icone nom="check" taille={28} trait={3} className="coche-pop" />
        </div>
        <h1 className="font-serif reveal mt-7 text-balance text-[40px] text-white sm:text-[52px]" style={delai(80)}>
          Merci, c&apos;est <span className="gradient-flow-light">complet</span>
        </h1>
        <p className="reveal mx-auto mt-4 max-w-[44ch] text-[15.5px] leading-relaxed text-white/75" style={delai(160)}>
          Votre demande est complétée{volume != null && volume > 0 ? ` (~${volume} m³)` : ""}.{" "}
          {email
            ? "Votre estimation vous est envoyée par e-mail, et nos experts reviennent vers vous très vite."
            : "Nos experts reviennent vers vous très vite."}
        </p>
        <a
          href="tel:+33169103520"
          className="reveal mt-8 inline-flex h-12 items-center gap-2.5 rounded-full border border-white/30 px-6 text-[14.5px] font-semibold text-white transition hover:border-white/70 hover:bg-white/10"
          style={delai(240)}
        >
          <Icone nom="tel" taille={15} />
          01 69 10 35 20
        </a>
      </div>
    </div>
  );
}
