import { Book } from "./book/Book";
import { pagePlayer } from "./viewer";

export const dynamic = "force-dynamic";

// The book, open at its contents.
export default async function Home() {
  return <Book player={await pagePlayer()} at={null} />;
}
