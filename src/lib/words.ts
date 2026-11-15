import { words1 } from "@/data/words-1";
import { words2 } from "@/data/words-2";
import { words3 } from "@/data/words-3";
import { words4 } from "@/data/words-4";
import { TIPS } from "@/data/tips";

export type Word = {
  id: string;
  word: string;
  pos: string;
  en: string;
  bn: string;
  example: string;
  tip: string;
};

const seen = new Map<string, number>();

export const WORDS: Word[] = [...words1, ...words2, ...words3, ...words4].map(
  ([word, pos, en, bn, example]) => {
    const base = word.toLowerCase();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    return { id, word, pos, en, bn, example, tip: TIPS[id] ?? "" };
  },
);

export const WORD_BY_ID = new Map(WORDS.map((w) => [w.id, w]));

export function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    synth.speak(u);
  } catch {
    /* speech not supported */
  }
}
