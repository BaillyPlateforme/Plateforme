import { entrerDemo, reinitialiserDemo, voirEmailDemo } from "@/lib/actions/espace-client";
import { estDemo, profilsDemoOuverts } from "@/lib/espace-client/config";
import { estProfilDemo, PROFILS_DEMO } from "@/lib/espace-client/seed";
import { Icone } from "./Icone";

/**
 * Le bouton rond « Démo » de la micro démo, en bas à gauche : il bascule
 * entre les profils A à D et, en mémoire, remet la démonstration à zéro. Il
 * n'existe qu'avec les raccourcis des profils fictifs, et seulement dans
 * l'espace d'un profil fictif ; chaque bascule repasse par un vrai lien
 * d'accès, journalisé.
 */
export function BoutonDemo({ reference, email, fictif }: { reference: string; email: string; fictif: boolean }) {
  if (!profilsDemoOuverts() || !fictif || !estProfilDemo(email)) return null;
  return (
    <details className="demo">
      <summary aria-label="Changer de profil de démonstration">
        <span className="demo-fab">
          <Icone nom="demo" />
        </span>
      </summary>
      <div className="demo-panel">
        <h3>Profils de démonstration</h3>
        <p>Chaque profil illustre une règle du brief : rubriques masquées, étapes propres à l&apos;international, dossier terminé.</p>
        {PROFILS_DEMO.map((p) => (
          <form key={p.lettre} action={entrerDemo}>
            <input type="hidden" name="email" value={p.email} />
            <input type="hidden" name="reference" value={p.reference} />
            <button className={`demo-opt${p.reference === reference ? " is-current" : ""}`}>
              <span className="l">{p.lettre}</span>
              <span>
                <strong>{p.titre}</strong>
                <small>{p.detail}</small>
              </span>
              {p.reference === reference ? <span className="badge todo plain">Actif</span> : <span />}
            </button>
          </form>
        ))}
        <div className="demo-foot">
          {estDemo() ? (
            <form action={reinitialiserDemo}>
              <button>Réinitialiser la démo</button>
            </form>
          ) : (
            <span />
          )}
          <form action={voirEmailDemo}>
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="reference" value={reference} />
            <button style={{ color: "var(--muted)", fontWeight: 500 }}>Revoir l&apos;e-mail d&apos;accès</button>
          </form>
        </div>
      </div>
    </details>
  );
}
