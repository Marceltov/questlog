// Name matching: a quest, an item or a game is compared in its `norm` form, so "Venigni's Request", "venigni’s request " and
// "VENIGNI'S REQUEST" are one name. Only exact matches of that form count; anything looser is Claude's to ask about (values V4).
const FOLDS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

export function norm(s: string): string {
  return s
    .normalize("NFC") // decomposed "ü" must fold like "ü", before NFKD would strip its diaeresis
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => FOLDS[c])
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
