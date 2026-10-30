import { getPlaythrough } from "@/backend";
import { Book } from "../../book/Book";
import { orNotFound, pagePlayer } from "../../viewer";

export const dynamic = "force-dynamic";

// The book, open at one playthrough: the address Claude hands out keeps opening the right page. Hints only when asked (?hints=1).
export default async function PlaythroughPage({ params, searchParams }: PageProps<"/p/[id]">) {
  const p = await pagePlayer();
  const t = await orNotFound(getPlaythrough(p, (await params).id));
  return <Book player={p} at={t.id} reveal={(await searchParams).hints === "1" ? "hint" : "none"} />;
}
