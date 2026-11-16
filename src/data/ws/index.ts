// Word Smart words, loaded on demand after the GRE 333 (see loadWordSmart in lib/words.ts).
import type { Word } from "@/lib/words";
import type { WsEntry } from "./types";
import ws01 from "./ws-01.json";
import ws02 from "./ws-02.json";
import ws03 from "./ws-03.json";
import ws04 from "./ws-04.json";
import ws05 from "./ws-05.json";
import ws06 from "./ws-06.json";
import ws07 from "./ws-07.json";
import ws08 from "./ws-08.json";
import ws09 from "./ws-09.json";
import ws10 from "./ws-10.json";

const PARTS = [ws01, ws02, ws03, ws04, ws05, ws06, ws07, ws08, ws09, ws10] as unknown as WsEntry[][];

export const WS_WORDS: Word[] = PARTS.flat().map((e) => ({
  id: e.id,
  word: e.word,
  pos: e.pos,
  en: e.en,
  bn: e.bn,
  example: e.s[0],
  tip: e.tip,
  sentences: e.s,
  bnSentences: e.sbn,
  deck: "ws" as const,
  src: e.src,
}));
