/** One Word Smart word (unlocked after the GRE 333). */
export type WsEntry = {
  id: string;
  word: string;
  /** Which book it comes from: "WS1", "WS2" or "WS1+WS2". */
  src: string;
  pos: string;
  /** Simple English meaning. */
  en: string;
  /** Bangla meaning. */
  bn: string;
  /** Easy, medium and GRE-level example sentences. {braces} mark other words from the lists. */
  s: [string, string, string];
  /** Bangla translation of each sentence, with the English word in brackets. */
  sbn: [string, string, string];
  /** Short memory tip: word root or memory trick. */
  tip: string;
};
