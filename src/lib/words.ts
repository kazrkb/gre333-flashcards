import { words1 } from "@/data/words-1";
import { words2 } from "@/data/words-2";
import { words3 } from "@/data/words-3";
import { words4 } from "@/data/words-4";
import { TIPS } from "@/data/tips";
import { sentences1 } from "@/data/sentences-1";
import { sentences2 } from "@/data/sentences-2";
import { sentences3 } from "@/data/sentences-3";
import { sentences4 } from "@/data/sentences-4";

import { bnSentences1 } from "@/data/bn-sentences-1";
import { bnSentences2 } from "@/data/bn-sentences-2";
import { bnSentences3 } from "@/data/bn-sentences-3";
import { bnSentences4 } from "@/data/bn-sentences-4";

const MORE = { ...sentences1, ...sentences2, ...sentences3, ...sentences4 };
const BN_SENTENCES = { ...bnSentences1, ...bnSentences2, ...bnSentences3, ...bnSentences4 };

export type Word = {
  id: string;
  word: string;
  pos: string;
  en: string;
  bn: string;
  example: string;
  tip: string;
  /** Easy, medium and GRE-level example sentences. {braces} mark other words from the list. */
  sentences: [string, string, string];
  /** Bangla translation of each sentence (shown on request). */
  bnSentences?: [string, string, string];
};

const seen = new Map<string, number>();

export const WORDS: Word[] = [...words1, ...words2, ...words3, ...words4].map(
  ([word, pos, en, bn, example]) => {
    const base = word.toLowerCase();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    const [medium, hard] = MORE[id] ?? [example, example];
    return { id, word, pos, en, bn, example, tip: TIPS[id] ?? "", sentences: [example, medium, hard], bnSentences: BN_SENTENCES[id] };
  },
);

export const WORD_BY_ID = new Map(WORDS.map((w) => [w.id, w]));

/** Regex that matches a word and its simple forms (abate → abated, abates). */
export function stemRegex(word: string, flags = "i") {
  const stem = word.slice(0, Math.max(4, word.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${stem}\\w*`, flags);
}

const formCache = new Map<string, Word | undefined>();
/** Find the list word behind a form used in a sentence, e.g. "placated" → Placate. */
export function wordForForm(form: string): Word | undefined {
  const key = form.toLowerCase();
  if (!formCache.has(key)) {
    formCache.set(
      key,
      WORDS.find((w) => {
        const m = stemRegex(w.word).exec(form);
        return m !== null && m.index === 0 && m[0].length === form.length;
      }),
    );
  }
  return formCache.get(key);
}

/** Sentence without the {braces} used to mark other list words. */
export const plainSentence = (s: string) => s.replace(/[{}]/g, "");

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
