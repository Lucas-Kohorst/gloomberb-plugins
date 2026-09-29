import { OPTIC_ODDS_PREFERRED_BOOKS } from "./types";

export interface ActiveBook {
  id: string;
  name?: string;
}

function tokens(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function bookMatches(book: ActiveBook, preferred: string): boolean {
  const needle = tokens(preferred);
  if (!needle) return false;
  if (tokens(book.id) === needle) return true;
  if (book.name && tokens(book.name) === needle) return true;
  return false;
}

export function pickBookBasket(activeBooks: ActiveBook[]): string[] {
  const remaining = [...activeBooks];
  const selected: string[] = [];

  for (const preferred of OPTIC_ODDS_PREFERRED_BOOKS) {
    if (selected.length >= 5) break;
    const index = remaining.findIndex((book) => bookMatches(book, preferred));
    if (index < 0) continue;
    const [book] = remaining.splice(index, 1);
    if (book) selected.push(book.id);
  }

  for (const book of remaining) {
    if (selected.length >= 5) break;
    if (selected.includes(book.id)) continue;
    selected.push(book.id);
  }

  return selected;
}
