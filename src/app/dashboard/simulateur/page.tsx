import SimulateurClient from "./SimulateurClient";

export const metadata = { title: "Simulateur — Bailly" };

export default function SimulateurPage() {
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Outils</div>
        <h1 className="mt-1 font-serif text-4xl">Simulateur de chiffrage</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Le moteur qui chiffre les demandes, en direct. Même grille, même calcul :
          ce qui sort d&apos;ici est ce que le client recevra.
        </p>
      </header>
      <SimulateurClient />
    </div>
  );
}
