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
import { nativeApp } from "./native";

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

// ---------- Pronunciation: the device's own voice (no recordings) ----------
// Android app: Android's text-to-speech engine (usually Google's), via the app bridge.
// Browser: the Web Speech API. Both work offline when the voice is installed on the device.

/** Male or female voice, chosen by the learner (saved on this device). Male by default. */
export type VoiceGender = "male" | "female";
const K_VOICE = "gre333.voice.v3"; // v3: device voices, male by default
export function getVoiceGender(): VoiceGender {
  try {
    return localStorage.getItem(K_VOICE) === '"female"' ? "female" : "male";
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
  chosen = undefined;
}

// Best-sounding British voices first: Microsoft "Natural" (Edge), Apple Premium/Enhanced, Google UK English
// (Chrome), then standard ones. Apple's novelty voices only if nothing else exists.
const VOICE_NAMES: Record<VoiceGender, RegExp[]> = {
  male: [/Ryan.*Natural|Thomas.*Natural|Natural.*Ryan/i, /Daniel.*(Premium|Enhanced)/i, /Arthur.*(Premium|Enhanced)/i, /Google UK English Male/i, /Daniel/i, /Arthur/i, /Ryan/i, /George/i, /Oliver/i, /\bMale\b/i],
  female: [/(Sonia|Libby|Maisie|Bella|Hollie).*Natural|Natural.*(Sonia|Libby)/i, /(Serena|Kate|Martha|Stephanie).*(Premium|Enhanced)/i, /Google UK English Female/i, /Serena/i, /Kate/i, /Martha/i, /Stephanie/i, /Libby/i, /Sonia/i, /Hazel/i, /Susan/i, /\bFemale\b/i],
};
// Good voices with another English accent: better than a novelty British voice when no proper British one exists.
const OTHER_ENGLISH: Record<VoiceGender, RegExp[]> = {
  male: [/Guy.*Natural|Andrew.*Natural|Brian.*Natural/i, /Google US English Male/i, /Rishi/i, /Aaron/i, /Lee\b/i, /David/i, /Mark\b/i, /Alex\b/i],
  female: [/Aria.*Natural|Jenny.*Natural|Emma.*Natural|Natasha.*Natural/i, /Moira/i, /Karen/i, /Tessa/i, /Samantha/i, /Google US English\b/i, /Zira/i],
};
const NOVELTY: Record<VoiceGender, RegExp[]> = {
  male: [/Reed/i, /Eddy/i, /Rocko/i, /Grandpa/i],
  female: [/Flo\b/i, /Shelley/i, /Sandy/i, /Grandma/i],
};

let chosen: SpeechSynthesisVoice | null | undefined;
function browserVoice(): SpeechSynthesisVoice | null {
  if (chosen !== undefined) return chosen;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null; // not loaded yet (or hidden by the browser): try again next time
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const gb = en.filter((v) => /^en[-_]GB/i.test(v.lang));
  const g = getVoiceGender();
  const other: VoiceGender = g === "male" ? "female" : "male";
  const pick = (list: SpeechSynthesisVoice[], patterns: RegExp[]) => {
    for (const p of patterns) {
      const v = list.find((x) => p.test(x.name));
      if (v) return v;
    }
    return undefined;
  };
  // Proper British voice of the chosen gender → proper English voice of that gender (other accent) →
  // novelty British voice of that gender → any British voice not of the other gender → any English voice.
  const novelty = (v: SpeechSynthesisVoice) => [...NOVELTY.male, ...NOVELTY.female].some((p) => p.test(v.name));
  chosen =
    pick(gb, VOICE_NAMES[g]) ??
    pick(en, OTHER_ENGLISH[g]) ??
    pick(gb, NOVELTY[g]) ??
    gb.find((v) => !novelty(v) && !VOICE_NAMES[other].some((p) => p.test(v.name))) ??
    gb[0] ??
    en[0] ??
    null;
  return chosen;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => (chosen = undefined));
}

/** Name of the voice this device will use, or null if none was found. */
export function currentVoiceName(): string | null {
  try {
    if (nativeApp?.voiceName) return nativeApp.voiceName(getVoiceGender()) || null;
    return browserVoice()?.name.replace(/\s*\(.*\)$/, "") ?? null;
  } catch {
    return null;
  }
}

/** Say a word aloud in British English. The default rate is a little slow so it's easy to catch; 0.5 is very slow. */
export function speak(text: string, rate = 0.75) {
  try {
    if (nativeApp?.speak?.(text, getVoiceGender(), rate)) return; // Android app
  } catch {
    /* older app version: fall through */
  }
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    const voice = browserVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = rate;
    synth.speak(u);
  } catch {
    /* speech not supported */
  }
}
