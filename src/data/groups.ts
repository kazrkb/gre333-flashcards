// Words from the list that share a meaning. Learning them together is how the GRE tests vocabulary:
// Sentence Equivalence asks you to pick the TWO words that both complete a sentence.
// `sentences[].answers` lists the group words that fit that sentence (at least two).

export type Group = {
  id: string;
  title: string;
  bn: string;
  words: string[];
  opposite?: string[];
  sentences: { text: string; answers: string[] }[];
};

export const GROUPS: Group[] = [
  {
    id: "stubborn",
    title: "Stubborn",
    bn: "একগুঁয়ে",
    words: ["obdurate", "recalcitrant", "refractory", "intractable", "intransigence", "dogmatic"],
    opposite: ["tractable", "compliant", "malleable"],
    sentences: [
      { text: "The ___ child refused to put on his shoes, no matter how nicely we asked.", answers: ["obdurate", "recalcitrant", "refractory", "intractable"] },
      { text: "Even after hours of talks, the ___ union leader would not accept any offer.", answers: ["obdurate", "recalcitrant", "intractable"] },
    ],
  },
  {
    id: "talkative",
    title: "Talkative",
    bn: "বাচাল",
    words: ["garrulous", "loquacious", "verbose"],
    opposite: ["laconic", "reticent"],
    sentences: [
      { text: "Our ___ neighbor can talk for an hour about the weather.", answers: ["garrulous", "loquacious"] },
      { text: "The ___ old man told the same long story at every family dinner.", answers: ["garrulous", "loquacious"] },
    ],
  },
  {
    id: "quiet",
    title: "Quiet, few words",
    bn: "স্বল্পভাষী",
    words: ["laconic", "reticent", "tacit"],
    opposite: ["garrulous", "loquacious", "verbose"],
    sentences: [
      { text: "He is ___ by nature and rarely says more than a few words.", answers: ["laconic", "reticent"] },
    ],
  },
  {
    id: "calm-someone",
    title: "Calm someone down",
    bn: "শান্ত করা",
    words: ["placate", "mollify", "appease", "propitiate", "assuage", "conciliatory"],
    opposite: ["foment", "goad", "exacerbate"],
    sentences: [
      { text: "The manager tried to ___ the angry customer by offering a free meal.", answers: ["placate", "mollify", "appease", "propitiate"] },
      { text: "Nothing the minister said could ___ the furious crowd.", answers: ["placate", "mollify", "appease"] },
    ],
  },
  {
    id: "lessen",
    title: "Make pain or trouble less",
    bn: "লাঘব করা",
    words: ["alleviate", "mitigate", "assuage", "ameliorate", "attenuate", "abate", "subside"],
    opposite: ["exacerbate"],
    sentences: [
      { text: "The new medicine helped ___ her pain.", answers: ["alleviate", "mitigate", "assuage"] },
      { text: "Planting more trees can ___ the effects of the summer heat.", answers: ["alleviate", "mitigate"] },
      { text: "We stayed inside until the storm began to ___.", answers: ["abate", "subside"] },
    ],
  },
  {
    id: "dishonest",
    title: "Dishonest",
    bn: "অসৎ; মিথ্যাবাদী",
    words: ["mendacious", "disingenuous", "perfidious", "dissemble", "prevaricate", "equivocate", "chicanery"],
    opposite: ["veracious", "guileless", "artless", "probity"],
    sentences: [
      { text: "It was ___ of him to claim that he had never seen the letter.", answers: ["mendacious", "disingenuous"] },
      { text: "When asked directly about the missing money, the treasurer began to ___ instead of giving a clear answer.", answers: ["prevaricate", "equivocate", "dissemble"] },
    ],
  },
  {
    id: "honest",
    title: "Honest and innocent",
    bn: "সরল; সৎ",
    words: ["guileless", "artless", "ingenuous", "veracious", "probity"],
    opposite: ["mendacious", "disingenuous"],
    sentences: [
      { text: "The ___ child told the teacher exactly what had happened, without hiding anything.", answers: ["guileless", "artless", "ingenuous"] },
    ],
  },
  {
    id: "belittle",
    title: "Criticize, belittle",
    bn: "হেয় করা; নিন্দা করা",
    words: ["disparage", "denigrate", "deride", "reproach", "admonish", "castigation", "opprobrium"],
    opposite: ["laud", "venerate", "approbation"],
    sentences: [
      { text: "Instead of giving helpful advice, the critic chose to ___ the young writer's first novel.", answers: ["disparage", "denigrate", "deride"] },
    ],
  },
  {
    id: "angry-speech",
    title: "Angry speech",
    bn: "কটুক্তিপূর্ণ বক্তৃতা",
    words: ["diatribe", "tirade", "harangue", "invective", "vituperative"],
    opposite: ["eulogy"],
    sentences: [
      { text: "The coach delivered a long ___ about the team's lazy defense.", answers: ["diatribe", "tirade", "harangue"] },
    ],
  },
  {
    id: "praise",
    title: "Praise and respect",
    bn: "প্রশংসা ও শ্রদ্ধা",
    words: ["laud", "eulogy", "approbation", "venerate", "reverent", "deference", "piety"],
    opposite: ["disparage", "denigrate", "deride"],
    sentences: [],
  },
  {
    id: "lazy",
    title: "Lazy, low energy",
    bn: "অলস; নিস্তেজ",
    words: ["indolent", "lethargic", "inert", "torpor", "lassitude", "enervate", "flag"],
    opposite: ["ebullient", "alacrity"],
    sentences: [
      { text: "After the huge holiday meal, everyone felt too ___ to go for a walk.", answers: ["lethargic", "indolent"] },
      { text: "A deep ___ came over him in the heat of the afternoon.", answers: ["torpor", "lassitude"] },
    ],
  },
  {
    id: "calm",
    title: "Calm, unmoved",
    bn: "শান্ত; অবিচল",
    words: ["imperturbable", "phlegmatic", "impassive", "stolid", "equanimity"],
    opposite: ["irascible", "volatile"],
    sentences: [
      { text: "Even when the crowd began to shout, the ___ speaker went on in the same quiet voice.", answers: ["imperturbable", "phlegmatic", "impassive", "stolid"] },
    ],
  },
  {
    id: "changeable",
    title: "Changeable",
    bn: "পরিবর্তনশীল; খামখেয়ালি",
    words: ["capricious", "volatile", "whimsical", "vacillate", "oscillate", "irresolute"],
    opposite: ["immutable"],
    sentences: [
      { text: "The ___ weather changed from sunshine to storms several times a day.", answers: ["capricious", "volatile"] },
      { text: "She continued to ___ between the two job offers for weeks.", answers: ["vacillate", "oscillate"] },
    ],
  },
  {
    id: "careful",
    title: "Careful, hard-working",
    bn: "যত্নশীল; পরিশ্রমী",
    words: ["meticulous", "assiduous", "discerning"],
    opposite: ["perfunctory", "desultory"],
    sentences: [
      { text: "She is a ___ researcher who checks every detail of her work twice.", answers: ["meticulous", "assiduous"] },
    ],
  },
  {
    id: "careless",
    title: "Careless, without plan",
    bn: "দায়সারা; এলোমেলো",
    words: ["perfunctory", "desultory", "inadvertently"],
    opposite: ["meticulous", "assiduous"],
    sentences: [
      { text: "The guard gave our bags only a ___ look before waving us through.", answers: ["perfunctory", "desultory"] },
    ],
  },
  {
    id: "pompous",
    title: "Showy, pompous",
    bn: "জাঁকালো; আড়ম্বরপূর্ণ",
    words: ["bombastic", "grandiloquent", "ostentatious", "pedantic", "strut"],
    opposite: ["austere", "ascetic"],
    sentences: [
      { text: "The politician's ___ speech was full of big words but said very little.", answers: ["bombastic", "grandiloquent"] },
    ],
  },
  {
    id: "poverty",
    title: "Poverty",
    bn: "দারিদ্র্য",
    words: ["indigence", "penury"],
    sentences: [
      { text: "Despite years of ___, the family never lost hope.", answers: ["indigence", "penury"] },
    ],
  },
  {
    id: "amount",
    title: "Too little, too much",
    bn: "স্বল্পতা ও প্রাচুর্য",
    words: ["paucity", "plethora", "satiate", "saturate", "inundate"],
    sentences: [],
  },
  {
    id: "money",
    title: "Spending money",
    bn: "খরচ ও সঞ্চয়",
    words: ["frugality", "stint", "abstemious", "prodigal", "gouge"],
    sentences: [],
  },
  {
    id: "hard-to-understand",
    title: "Hard to understand",
    bn: "দুর্বোধ্য",
    words: ["esoteric", "recondite", "convoluted", "ambiguous", "tortuous"],
    opposite: ["lucid"],
    sentences: [
      { text: "The professor's lecture was so ___ that only a few experts in the room could follow it.", answers: ["esoteric", "recondite"] },
    ],
  },
  {
    id: "flattering",
    title: "Flattering, too eager to please",
    bn: "তোষামুদে",
    words: ["obsequious", "fawning", "complaisant", "compliant"],
    sentences: [
      { text: "The ___ assistant agreed with everything the boss said.", answers: ["obsequious", "fawning"] },
    ],
  },
  {
    id: "take-back",
    title: "Take back, reject",
    bn: "প্রত্যাহার; প্রত্যাখ্যান",
    words: ["recant", "repudiate", "rescind", "negate", "gainsay", "dismiss"],
    sentences: [
      { text: "After new evidence came out, the scientist had to publicly ___ his earlier claim.", answers: ["recant", "repudiate"] },
    ],
  },
  {
    id: "support",
    title: "Support, prove",
    bn: "সমর্থন করা; প্রমাণ করা",
    words: ["bolster", "buttress", "substantiate", "document"],
    opposite: ["refute", "discredit"],
    sentences: [
      { text: "She used data from three studies to ___ her argument.", answers: ["bolster", "buttress", "substantiate"] },
    ],
  },
  {
    id: "disprove",
    title: "Disprove",
    bn: "খণ্ডন করা",
    words: ["refute", "discredit", "belie", "negate"],
    opposite: ["substantiate"],
    sentences: [
      { text: "The video from the security camera seemed to ___ his story completely.", answers: ["refute", "discredit"] },
    ],
  },
  {
    id: "sad-song",
    title: "Sad songs and poems",
    bn: "শোকসংগীত",
    words: ["dirge", "elegy", "eulogy", "morose"],
    sentences: [
      { text: "The band played a slow ___ as the coffin was carried out.", answers: ["dirge", "elegy"] },
    ],
  },
  {
    id: "dull",
    title: "Dull, boring",
    bn: "নিরস; গতানুগতিক",
    words: ["banal", "insipid", "soporific", "mundane", "platitude", "derivative"],
    sentences: [
      { text: "The ___ lecture put half the class to sleep.", answers: ["soporific", "insipid", "banal"] },
    ],
  },
  {
    id: "misleading",
    title: "Misleading, false",
    bn: "বিভ্রান্তিকর; ভ্রান্ত",
    words: ["specious", "fallacious", "belie"],
    sentences: [
      { text: "His argument sounded convincing at first, but it was ___ and fell apart under questioning.", answers: ["specious", "fallacious"] },
    ],
  },
  {
    id: "hidden",
    title: "Hidden or resting",
    bn: "সুপ্ত; নিষ্ক্রিয়",
    words: ["dormant", "latent", "quiescent", "inert"],
    sentences: [
      { text: "The volcano has been ___ for centuries, but scientists say it could erupt again.", answers: ["dormant", "quiescent"] },
    ],
  },
  {
    id: "grow",
    title: "Grow and spread",
    bn: "বৃদ্ধি ও বিস্তার",
    words: ["burgeon", "proliferate", "disseminate", "pervasive", "endemic", "diffuse"],
    sentences: [
      { text: "Small coffee shops have begun to ___ all across the city.", answers: ["burgeon", "proliferate"] },
    ],
  },
  {
    id: "block",
    title: "Block or prevent",
    bn: "বাধা দেওয়া",
    words: ["impede", "forestall", "obviate", "deterrent", "occlude", "prohibitive", "proscribe"],
    opposite: ["facilitate"],
    sentences: [],
  },
  {
    id: "bold",
    title: "Bold, shameless",
    bn: "দুঃসাহসী; ধৃষ্ট",
    words: ["audacious", "effrontery", "presumptuous", "maverick"],
    opposite: ["craven", "diffidence"],
    sentences: [],
  },
  {
    id: "fear",
    title: "Fear and shyness",
    bn: "ভয় ও লাজুকতা",
    words: ["craven", "daunt", "diffidence", "wary"],
    opposite: ["audacious"],
    sentences: [],
  },
  {
    id: "learned",
    title: "Wise and learned",
    bn: "জ্ঞানী",
    words: ["erudite", "sage", "connoisseur", "discerning", "pedantic"],
    opposite: ["neophyte", "fledgling"],
    sentences: [],
  },
  {
    id: "beginner",
    title: "Beginner",
    bn: "নবিশ",
    words: ["neophyte", "fledgling", "inchoate"],
    sentences: [],
  },
  {
    id: "enthusiasm",
    title: "Enthusiasm",
    bn: "উৎসাহ",
    words: ["ebullient", "alacrity", "fervor", "zealot", "penchant", "propensity"],
    opposite: ["apathy", "lethargic"],
    sentences: [],
  },
  {
    id: "not-serious",
    title: "Not serious",
    bn: "লঘু; রসিকতাপূর্ণ",
    words: ["facetious", "levity", "whimsical", "fatuous"],
    sentences: [],
  },
  {
    id: "rude",
    title: "Rude, aggressive",
    bn: "অভদ্র; উগ্র",
    words: ["boorish", "truculence", "irascible", "contentious", "caustic", "officious"],
    sentences: [],
  },
  {
    id: "different",
    title: "Different, not matching",
    bn: "ভিন্ন; অসংগত",
    words: ["disparate", "discrete", "discrepancy", "incongruity", "dissonance", "discordant", "anomalous", "aberrant", "diverge"],
    opposite: ["homogeneous", "analogous", "converge"],
    sentences: [
      { text: "His ___ behavior worried the doctors, who had never seen anything like it.", answers: ["anomalous", "aberrant"] },
    ],
  },
  {
    id: "short-lived",
    title: "Short-lived vs lasting",
    bn: "ক্ষণস্থায়ী ও চিরস্থায়ী",
    words: ["ephemeral", "perennial", "immutable", "inherent"],
    sentences: [],
  },
  {
    id: "weaken",
    title: "Weaken or damage",
    bn: "দুর্বল করা",
    words: ["enervate", "impair", "attenuate", "adulterate", "desiccate"],
    opposite: ["enhance", "bolster"],
    sentences: [],
  },
];
