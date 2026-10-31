import { getPlaythrough } from "@/backend";
import { Book } from "../../book/Book";
import { orNotFound, pagePlayer } from "../../viewer";

export const dynamic = "force-dynamic";

// The book, open at one playthrough: the address Claude hands out keeps opening the right page. What it shows follows the playthrough's
// spoiler setting (ADR 0016).
export default async function PlaythroughPage({ params }: PageProps<"/p/[id]">) {
  const p = await pagePlayer();
  const t = await orNotFound(getPlaythrough(p, (await params).id));
  return <Book player={p} at={t.id} />;
}
