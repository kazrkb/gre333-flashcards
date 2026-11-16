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

// Most natural-sounding British voices first: Microsoft "Natural"/neural (Edge), Apple Premium/Enhanced,
// Google UK English (Chrome), then standard ones. Apple's basic robotic voices only if nothing else exists.
const UK_VOICES: RegExp[] = [/Ryan.*Natural|Thomas.*Natural|Natural.*Ryan/i, /Daniel.*(Premium|Enhanced)/i, /Arthur.*(Premium|Enhanced)/i, /Google UK English Male/i, /Daniel/i, /Arthur/i, /Ryan/i, /George/i, /Oliver/i, /\bMale\b/i];
const ROBOTIC: RegExp[] = [/Reed/i, /Eddy/i, /Rocko/i, /Grandpa/i];

/** The British English voice to use on this device: a male one when possible, to match the recordings. */
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
  ukVoice = pick(UK_VOICES) ?? pick(ROBOTIC) ?? gb[0] ?? null;
  return ukVoice;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => (ukVoice = undefined));
}

let player: HTMLAudioElement | null = null;
let textIndex: { size: number; map: Map<string, string> } | null = null;
function idForText(text: string): string | undefined {
  if (!textIndex || textIndex.size !== WORD_BY_ID.size) {
    const map = new Map<string, string>();
    for (const w of WORD_BY_ID.values()) if (!map.has(w.word.toLowerCase())) map.set(w.word.toLowerCase(), w.id);
    textIndex = { size: WORD_BY_ID.size, map };
  }
  return textIndex.map.get(text.trim().toLowerCase());
}

/**
 * Say a word aloud in British English. List words play their natural recording (male British voice);
 * anything else (or a recording that can't load) uses the device's British voice.
 * The default rate is a little slow so it's easy to catch; 0.5 is very slow.
 */
export function speak(text: string, rate = 0.75) {
  const id = idForText(text);
  if (id && typeof Audio !== "undefined") {
    try {
      window.speechSynthesis?.cancel();
      player?.pause();
      const audio = new Audio(`/audio/m/${encodeURIComponent(id)}.mp3`);
      audio.playbackRate = Math.max(0.5, rate / 0.75); // the recordings are already slightly slowed
      let fellBack = false;
      const fallback = () => {
        if (fellBack) return;
        fellBack = true;
        speakWithDevice(text, rate);
      };
      audio.onerror = fallback;
      player = audio;
      audio.play().catch(fallback);
      return;
    } catch {
      /* fall through to the device voice */
    }
  }
  speakWithDevice(text, rate);
}

function speakWithDevice(text: string, rate: number) {
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
