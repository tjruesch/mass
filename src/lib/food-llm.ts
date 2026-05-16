/**
 * Food-macro autofill via the Claude API (#91, second rework).
 *
 * Given a free-form food name, ask Claude for per-100g macros plus a
 * pantry category. The model picks the category from the closed set
 * the app already uses (`fresh` / `protein` / `dairy` / `pantry`) and
 * returns numbers via tool-use, which gives us a stable JSON shape.
 *
 * Reads the API key from `EXPO_PUBLIC_ANTHROPIC_API_KEY`. Without one
 * the function resolves to `null` and the pantry editor falls back to
 * manual entry — no crash, no error chip.
 *
 * The pantry editor calls `inferFoodMacros(name)` after a short debounce
 * (~600ms of name idle); requests are deduped via an in-memory cache
 * keyed on the normalised name.
 *
 * Caveat: API key is bundled into the client. Acceptable for a
 * single-user local-first app; the key should be sandboxed if this
 * ever ships to multiple users.
 */

import type { PantryCategory } from '@/src/db/schema';

/**
 * Sonnet 4.7 isn't released yet at time of writing — current latest
 * Sonnet is `claude-sonnet-4-6`. Bump this constant once 4.7 ships
 * (the rest of the call signature is forward-compatible).
 */
const MODEL_ID = 'claude-sonnet-4-6';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are a nutrition expert. Given a food name, return its per-100g macros and one category from: fresh, protein, dairy, pantry.

Category guide:
- fresh: fruits, vegetables, fresh herbs.
- protein: meat, poultry, fish, eggs, tofu, tempeh, legumes/beans.
- dairy: milk, yoghurt, cheese, butter, cream, plant-milk.
- pantry: grains, pasta, bread, nuts, seeds, oils, sweeteners, sauces, dry goods, snacks.

Use the set_macros tool with realistic values. If the input isn't recognisably a food, use the tool with 0 for all macros and category 'pantry'.`;

export type InferredMacros = {
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly category: PantryCategory;
};

// In-memory cache keyed on normalised name so a debounced lookup
// followed by the same name doesn't pay the API round-trip twice.
const cache = new Map<string, InferredMacros>();
// Track in-flight requests so concurrent callers for the same key
// share a single fetch — happens whenever a user pauses, types, and
// pauses again before the first call resolves.
const inflight = new Map<string, Promise<InferredMacros | null>>();

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readApiKey(): string | null {
  // Expo bundles EXPO_PUBLIC_* env vars at build time. No expo-constants
  // round-trip needed — the var is statically inlined.
  // eslint-disable-next-line no-undef
  const key = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

export function isFoodLlmEnabled(): boolean {
  return readApiKey() !== null;
}

export async function inferFoodMacros(
  rawName: string,
  opts?: { signal?: AbortSignal },
): Promise<InferredMacros | null> {
  const key = normalise(rawName);
  if (key.length < 3) return null;

  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const existing = inflight.get(key);
  if (existing !== undefined) return existing;

  const apiKey = readApiKey();
  if (apiKey === null) return null;

  const promise = (async (): Promise<InferredMacros | null> => {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        signal: opts?.signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL_ID,
          max_tokens: 256,
          system: SYSTEM_PROMPT,
          tools: [
            {
              name: 'set_macros',
              description:
                "Set the food's per-100g nutrition info and pantry category.",
              input_schema: {
                type: 'object',
                properties: {
                  kcal: {
                    type: 'number',
                    description: 'Energy in kcal per 100 g of edible portion.',
                  },
                  proteinG: {
                    type: 'number',
                    description: 'Protein in grams per 100 g.',
                  },
                  carbsG: {
                    type: 'number',
                    description: 'Carbohydrate in grams per 100 g.',
                  },
                  fatG: {
                    type: 'number',
                    description: 'Fat in grams per 100 g.',
                  },
                  category: {
                    type: 'string',
                    enum: ['fresh', 'protein', 'dairy', 'pantry'],
                  },
                },
                required: ['kcal', 'proteinG', 'carbsG', 'fatG', 'category'],
              },
            },
          ],
          tool_choice: { type: 'tool', name: 'set_macros' },
          messages: [{ role: 'user', content: rawName.trim() }],
        }),
      });

      if (!res.ok) {
        console.warn(
          `[food-llm] API ${res.status}:`,
          await res.text().catch(() => '<unreadable>'),
        );
        return null;
      }

      const body: ClaudeResponse = await res.json();
      const toolBlock = body.content.find(
        (b): b is ClaudeToolUseBlock =>
          b.type === 'tool_use' &&
          (b as ClaudeToolUseBlock).name === 'set_macros',
      );
      if (!toolBlock) {
        console.warn('[food-llm] no tool_use block returned');
        return null;
      }
      const parsed = parseToolInput(toolBlock.input);
      if (parsed === null) {
        console.warn('[food-llm] invalid tool_use payload:', toolBlock.input);
        return null;
      }
      cache.set(key, parsed);
      return parsed;
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return null;
      console.warn('[food-llm] request failed:', err);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

// ─── Anthropic response shape (minimal slice we care about) ───────────────
type ClaudeToolUseBlock = {
  type: 'tool_use';
  name: string;
  input: unknown;
};
type ClaudeContentBlock =
  | ClaudeToolUseBlock
  | { type: 'text'; text: string }
  | { type: string };
type ClaudeResponse = {
  content: ReadonlyArray<ClaudeContentBlock>;
};

function parseToolInput(input: unknown): InferredMacros | null {
  if (typeof input !== 'object' || input === null) return null;
  const i = input as Record<string, unknown>;
  const kcal = numberOr(i.kcal, null);
  const proteinG = numberOr(i.proteinG, 0);
  const carbsG = numberOr(i.carbsG, 0);
  const fatG = numberOr(i.fatG, 0);
  const category = parseCategory(i.category);
  if (kcal === null || category === null) return null;
  return { kcal, proteinG, carbsG, fatG, category };
}

function numberOr<T>(v: unknown, fallback: T): number | T {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  return fallback;
}

function parseCategory(v: unknown): PantryCategory | null {
  if (
    v === 'fresh' ||
    v === 'protein' ||
    v === 'dairy' ||
    v === 'pantry'
  ) {
    return v;
  }
  return null;
}
