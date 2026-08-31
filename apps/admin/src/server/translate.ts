import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Machine translation of UI strings.
 *
 * Two rules govern everything here, and they are enforced by the caller as well
 * as by this module:
 *
 *  1. A string a person has edited is never overwritten. That is a column on
 *     the row (`humanEdited`), not an inference from status.
 *  2. Machine output is always marked as machine output. It is a first draft
 *     for review, never something the site quietly starts saying.
 */

export const TRANSLATION_MODEL = "claude-opus-5";

export type TranslationRequest = {
  path: string; // "booking.checkout.confirm" — carries real context about tone
  source: string;
};

export type TranslationResult =
  | { path: string; ok: true; value: string }
  | { path: string; ok: false; reason: string };

/** ICU placeholders and HTML tags must survive translation exactly. */
const PLACEHOLDER = /\{[^{}]+\}|<[^<>]+>/g;

export function extractPlaceholders(value: string): string[] {
  return (value.match(PLACEHOLDER) ?? []).sort();
}

/**
 * A translation that dropped or invented a placeholder is broken: `{count}`
 * would render literally, or the interpolation would throw. Caught here rather
 * than discovered by a guest.
 */
export function placeholdersMatch(source: string, translated: string): boolean {
  const a = extractPlaceholders(source);
  const b = extractPlaceholders(translated);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export class TranslationUnavailable extends Error {}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new TranslationUnavailable(
      "Automatic translation is not configured. Set ANTHROPIC_API_KEY to enable it.",
    );
  }
  return new Anthropic({ apiKey });
}

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You translate interface strings for the website of Fantazia Hotels, a group of three Red Sea resorts at Marsa Alam, Egypt.

These are short strings shown to guests: buttons, labels, headings, validation messages. Translate them as a native speaker writing for a hotel website would, not literally.

Rules:
- Keep the register warm, plain and confident. Not marketing hype, not stiff officialese.
- Preserve every placeholder exactly as written: {count}, {name}, <b>, </b>. Never translate, reorder within, or drop them.
- Preserve capitalisation conventions appropriate to the target language, not English ones. Arabic has no letter case; German capitalises nouns.
- Keep button and label text short. If the natural translation is much longer than the English, prefer a shorter idiomatic phrasing that fits a button.
- Proper nouns stay untranslated: Fantazia, Sirena, Marsa Alam.
- The key path is given for context only. Never include it in the output.

Return only the translations, in the requested structure.`;

/**
 * Translate a batch in one request. Batching matters: one call for fifty
 * strings gives the model shared context (they belong to the same screen) and
 * costs far less than fifty calls.
 */
export async function translateBatch(
  targetLocale: string,
  targetName: string,
  items: TranslationRequest[],
): Promise<TranslationResult[]> {
  if (items.length === 0) return [];

  const anthropic = client();

  const response = await anthropic.messages.create({
    model: TRANSLATION_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            translations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  value: { type: "string" },
                },
                required: ["path", "value"],
                additionalProperties: false,
              },
            },
          },
          required: ["translations"],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Translate these interface strings from English into ${targetName} (${targetLocale}).

${items.map((i) => `path: ${i.path}\nenglish: ${i.source}`).join("\n\n")}`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  let parsed: { translations?: { path?: string; value?: string }[] };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error("The translation service returned something unreadable.");
  }

  const returned = new Map(
    (parsed.translations ?? [])
      .filter((t): t is { path: string; value: string } =>
        typeof t.path === "string" && typeof t.value === "string",
      )
      .map((t) => [t.path, t.value]),
  );

  return items.map((item): TranslationResult => {
    const value = returned.get(item.path);
    if (value === undefined) {
      return { path: item.path, ok: false, reason: "No translation was returned." };
    }
    if (!value.trim()) {
      return { path: item.path, ok: false, reason: "The translation came back empty." };
    }
    if (!placeholdersMatch(item.source, value)) {
      return {
        path: item.path,
        ok: false,
        reason: `Placeholders changed — expected ${extractPlaceholders(item.source).join(" ") || "none"}.`,
      };
    }
    return { path: item.path, ok: true, value };
  });
}
