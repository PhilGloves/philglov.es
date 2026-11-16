/**
 * Valid front matter in the forms a laptop file may use (SO-01, decision 0027), shared by the unit tests (content
 * check, line reader against Astro's parser) and the Worker tests (open, edit and publish against the GitHub
 * stand-in). `editable` says whether the phone editor can keep the file exactly; when not, it refuses to open it.
 */
export const VARIANTS: Record<string, { lines: string[]; editable: boolean }> = {
  "the guide's own example, inline comments": {
    lines: [
      'title: "Walking in Rome"',
      "date: 2026-10-21",
      "lang: en # language of THIS file",
      "originalLang: en # language it was first written in",
      'description: "One sentence for search results."',
      "comments: true",
    ],
    editable: true,
  },
  "quoted date": {
    lines: [
      "title: Walking in Rome",
      'date: "2026-10-21"',
      "lang: en",
      "originalLang: en",
      "description: A walk beside the river.",
      "comments: true",
    ],
    editable: true,
  },
  "single quotes": {
    lines: [
      "title: 'Rome, at last: it''s here'",
      "date: 2026-10-21",
      "lang: 'en'",
      "originalLang: 'en'",
      "description: 'A walk # beside the river.'",
      "comments: true",
    ],
    editable: true,
  },
  "comments: false with a comment, a comment on the title, a comment line and an old tags list": {
    lines: [
      "# written on the train",
      "title: Walking in Rome # private note",
      "date: 2026-10-21 # the day of the walk",
      "lang: en",
      "originalLang: en",
      "description: A walk beside the river.",
      "tags:",
      "  - travel",
      "comments: false # comments closed",
    ],
    editable: true,
  },
  "double quotes with escapes": {
    lines: [
      'title: "Città \\"vecchia\\" \\u2014 at dusk"',
      "date: 2026-10-21",
      'lang: "en"',
      'originalLang: "en"',
      'description: "Back\\\\slash and a tab\\there."',
      "comments: True",
    ],
    editable: true,
  },
  "folded title and description": {
    lines: [
      "title: >-",
      "  Walking in Rome,",
      "  slowly",
      "description: >-",
      "  A walk beside",
      "  the river.",
      "date: 2026-10-21",
      "lang: en",
      "originalLang: en",
      "comments: false",
    ],
    editable: false,
  },
  "a title over two lines in plain style": {
    lines: ["title: Walking in", "  Rome", "date: 2026-10-21", "lang: en", "originalLang: en", "description: A walk."],
    editable: false,
  },
  "a title YAML reads as a number": {
    lines: ["title: 1984", "date: 2026-10-21", "lang: en", "originalLang: en", "description: A year."],
    editable: false,
  },
  "folded language values": {
    lines: [
      "title: Walking in Rome",
      "date: 2026-10-21",
      "lang: >-",
      "  en",
      "originalLang: |-",
      "  en",
      "description: A walk.",
    ],
    editable: true,
  },
};
