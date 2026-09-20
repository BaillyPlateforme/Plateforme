import SimulateurClient from "./SimulateurClient";

export const metadata = { title: "Simulateur — Bailly" };

export default function SimulateurPage() {
  return (
    <div className="px-6 py-8 md:px-10">
      <SimulateurClient />
    </div>
  );
}
