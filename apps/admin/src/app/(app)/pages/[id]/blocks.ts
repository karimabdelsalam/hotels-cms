export type Block =
  | { type: "lede"; props: { text: string } }
  | { type: "heading"; props: { text: string } }
  | { type: "richText"; props: { html: string } }
  | { type: "quote"; props: { text: string; attribution?: string } }
  | { type: "facts"; props: { items: string[] } }
  | { type: "cta"; props: { label: string; href: string } };

export type BlockType = Block["type"];

/** Only what the site can actually render — the editor cannot invent a type. */
export const BLOCK_TYPES: { type: BlockType; label: string; hint: string }[] = [
  { type: "lede", label: "Lede", hint: "Opening paragraph, set larger." },
  { type: "heading", label: "Heading", hint: "A section heading." },
  { type: "richText", label: "Text", hint: "Body copy. Simple HTML is allowed." },
  { type: "quote", label: "Pull quote", hint: "A line set large, with an optional source." },
  { type: "facts", label: "Fact chips", hint: "Short labels in a row." },
  { type: "cta", label: "Button", hint: "A link styled as a button." },
];

export function emptyBlock(type: BlockType): Block {
  switch (type) {
    case "lede":
      return { type, props: { text: "" } };
    case "heading":
      return { type, props: { text: "" } };
    case "richText":
      return { type, props: { html: "" } };
    case "quote":
      return { type, props: { text: "", attribution: "" } };
    case "facts":
      return { type, props: { items: [""] } };
    case "cta":
      return { type, props: { label: "", href: "/" } };
  }
}
