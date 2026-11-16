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
  /** "gre333" = Barron's 333 (always available); "ws" = Word Smart (unlocked after the 333). */
  deck: "gre333" | "ws";
  /** Word Smart book(s) the word comes from, e.g. "WS1". */
  src?: string;
};

const seen = new Map<string, number>();

/** Barron's 333 high-frequency words. */
export const CORE_WORDS: Word[] = [...words1, ...words2, ...words3, ...words4].map(
  ([word, pos, en, bn, example]) => {
    const base = word.toLowerCase();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    const [medium, hard] = MORE[id] ?? [example, example];
    return {
      id,
      word,
      pos,
      en,
      bn,
      example,
      tip: TIPS[id] ?? "",
      sentences: [example, medium, hard],
      bnSentences: BN_SENTENCES[id],
      deck: "gre333" as const,
    };
  },
);

/**
 * The words the app is working with right now. Before Word Smart is unlocked this is only the 333;
 * after unlocking it also contains the Word Smart words (everything is mixed). The array is updated
 * in place, so every part of the app sees the change.
 */
export const WORDS: Word[] = [...CORE_WORDS];

/** Every word that has been loaded (the 333, plus Word Smart once it's downloaded). */
export const WORD_BY_ID = new Map(CORE_WORDS.map((w) => [w.id, w]));

let wordSmart: Word[] | null = null;

/** Download the Word Smart words (a separate file, fetched only after unlocking). */
export async function loadWordSmart(): Promise<Word[]> {
  if (!wordSmart) {
    const mod = await import("@/data/ws");
    wordSmart = mod.WS_WORDS;
    for (const w of wordSmart) WORD_BY_ID.set(w.id, w);
    formCache.clear();
  }
  return wordSmart;
}

/** Use only the 333, or the 333 + Word Smart mixed together. */
export function setActiveWords(includeWordSmart: boolean) {
  WORDS.length = 0;
  WORDS.push(...CORE_WORDS, ...(includeWordSmart && wordSmart ? wordSmart : []));
  formCache.clear();
}

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
      [...WORD_BY_ID.values()].find((w) => {
        const m = stemRegex(w.word).exec(form);
        return m !== null && m.index === 0 && m[0].length === form.length;
      }),
    );
  }
  return formCache.get(key);
}

/** Sentence without the {braces} used to mark other list words. */
export const plainSentence = (s: string) => s.replace(/[{}]/g, "");

/** Male or female British voice, chosen by the learner (saved in this browser). */
export type VoiceGender = "male" | "female";
const K_VOICE = "gre333.voice.v1";
export function getVoiceGender(): VoiceGender {
  try {
    return localStorage.getItem(K_VOICE) === "\"female\"" ? "female" : "male";
  } catch {
    return "male";
  }
}
export function setVoiceGender(g: VoiceGender) {
  try {
    localStorage.setItem(K_VOICE, JSON.stringify(g));
  } catch {
    /* ignore */
  }
  ukVoice = undefined;
}

// Most natural-sounding British voices first: Microsoft "Natural"/neural (Edge), Apple Premium/Enhanced,
// Google UK English (Chrome), then standard ones. Apple's basic robotic voices only if nothing else exists.
const UK_VOICES: Record<VoiceGender, RegExp[]> = {
  male: [/Ryan.*Natural|Thomas.*Natural|Natural.*Ryan/i, /Daniel.*(Premium|Enhanced)/i, /Arthur.*(Premium|Enhanced)/i, /Google UK English Male/i, /Daniel/i, /Arthur/i, /Ryan/i, /George/i, /Oliver/i, /\bMale\b/i],
  female: [/(Sonia|Libby|Maisie|Bella|Hollie).*Natural|Natural.*(Sonia|Libby)/i, /(Serena|Kate|Martha|Stephanie).*(Premium|Enhanced)/i, /Google UK English Female/i, /Serena/i, /Kate/i, /Martha/i, /Stephanie/i, /Libby/i, /Sonia/i, /Hazel/i, /Susan/i, /\bFemale\b/i],
};
const ROBOTIC: Record<VoiceGender, RegExp[]> = {
  male: [/Reed/i, /Eddy/i, /Rocko/i, /Grandpa/i],
  female: [/Flo\b/i, /Shelley/i, /Sandy/i, /Grandma/i],
};

/** The British English voice to use on this device, matching the chosen gender when possible. */
let ukVoice: SpeechSynthesisVoice | null | undefined;
function britishVoice(): SpeechSynthesisVoice | null {
  if (ukVoice !== undefined) return ukVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null; // voices not loaded yet; try again next time
  const gb = voices.filter((v) => /^en[-_]GB/i.test(v.lang));
  const pick = (patterns: RegExp[]) => {
    for (const p of patterns) {
      const v = gb.find((x) => p.test(x.name));
      if (v) return v;
    }
    return undefined;
  };
  const g = getVoiceGender();
  const other = g === "male" ? "female" : "male";
  // Natural voice of the chosen gender → robotic one of that gender → natural one of the other gender.
  ukVoice = pick(UK_VOICES[g]) ?? pick(ROBOTIC[g]) ?? pick(UK_VOICES[other]) ?? gb[0] ?? null;
  return ukVoice;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => (ukVoice = undefined));
}

/** Name of the voice that will actually speak, or null when the browser hides its voice list. */
export function currentVoiceName(): string | null {
  try {
    return britishVoice()?.name.replace(/\s*\(.*\)$/, "") ?? null;
  } catch {
    return null;
  }
}

/** Say a word aloud in British English. The default is a little slow so it is easy to catch; 0.5 is very slow. */
export function speak(text: string, rate = 0.75) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    const voice = britishVoice();
    if (voice) u.voice = voice;
    u.rate = rate;
    synth.speak(u);
  } catch {
    /* speech not supported */
  }
}
