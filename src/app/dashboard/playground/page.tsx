import { listLibraryPhotos } from "@/lib/library";
import PlaygroundShell from "./PlaygroundShell";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const library = await listLibraryPhotos();
  return (
    <div className="px-6 py-8 md:px-10">
      <PlaygroundShell library={library} />
    </div>
  );
}
