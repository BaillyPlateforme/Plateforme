import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";

/* Provisoire : le fil de tout ce qui se fait (Tout · Client · Staff) remplace cette page. */
export default function Feed() {
  return (
    <div className="view">
      <Bandeau surtitre="Feed" titre="Feed" texte="Tout ce qui se fait, au fil du temps : les clients, l’équipe, les envois." />
    </div>
  );
}
