import SimulateurClient from "./SimulateurClient";

export const metadata = { title: "Simulateur — Bailly" };

export default function SimulateurPage() {
  return (
    <div className="px-5 py-5 md:px-7 md:py-6">
      <SimulateurClient />
    </div>
  );
}
