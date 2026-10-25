import { THEME_CORNERS, THEME_FONTS, THEME_HEADERS, THEME_LAYOUTS, type AssistantTurn, type ThemeColors, type ThemeStyle } from '@savora/shared';
import { z } from 'zod';

/**
 * Savora's AI features behind one small interface, so the routes don't depend on a vendor and
 * tests can swap in a stand-in. The real implementation goes through OpenRouter, which reaches many
 * model providers with one key; the model is a setting (OPENROUTER_MODEL).
 */
export type AiProvider = {
  readMenu: (input: { files: AiFile[]; currency: string }) => Promise<ReadMenuResult>;
  designThemes: (input: { brand: BrandContext; locale: 'en' | 'ar'; turns: Array<AssistantTurn & { photo?: AiFile | null }> }) => Promise<ThemeDesign>;
};

export type AiFile = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf'; data: Buffer };
export type BrandContext = { nameEn: string; nameAr: string | null; taglineEn: string | null; current: ThemeColors; style: ThemeStyle; hasLogo: boolean; hasCover: boolean };

/** The model declined the request. */
export class AiRefused extends Error {}
/** The answer ran out of room, e.g. an extremely long menu. */
export class AiTooLong extends Error {}
/** Rate limited, overloaded, out of credit or unreachable: worth trying again later. */
export class AiBusy extends Error {}

// ---------- Output shapes ----------

const text = z.string().nullable();
const ReadMenuSchema = z.object({
  currency: text,
  categories: z.array(
    z.object({
      nameEn: text,
      nameAr: text,
      items: z.array(z.object({ nameEn: text, nameAr: text, descriptionEn: text, descriptionAr: text, price: z.number().nullable() })),
    }),
  ),
  notes: z.array(z.string()),
});
export type ReadMenuResult = z.infer<typeof ReadMenuSchema>;

const Colors = z.object({ bg: z.string(), surface: z.string(), primary: z.string(), accent: z.string(), ink: z.string(), muted: z.string() });
const ThemeDesignSchema = z.object({
  reply: z.string(),
  // Numbers of the owner's photos ("Photo 1" is the first one in the conversation), or null.
  logoPhoto: z.number().nullable(),
  coverPhoto: z.number().nullable(),
  options: z.array(
    z.object({
      nameEn: z.string(),
      nameAr: z.string(),
      note: z.string(),
      colors: Colors,
      font: z.enum(THEME_FONTS),
      corners: z.enum(THEME_CORNERS),
      header: z.enum(THEME_HEADERS),
      layout: z.enum(THEME_LAYOUTS),
      boldPrices: z.boolean(),
    }),
  ),
});
export type ThemeDesign = z.infer<typeof ThemeDesignSchema>;

// ---------- Instructions ----------

const READ_MENU = `You turn photos or PDFs of a café or restaurant menu into structured data for Savora, a bilingual English and Arabic QR menu.

- Read every section and item in reading order. Keep the menu's own section names.
- Each name and description has an English and an Arabic version. Keep whatever the menu shows exactly as written, and write the missing language as a short, natural menu translation (Levantine menu conventions in Arabic, for example "لاتيه بالهيل" for Cardamom Latte). Leave a description null when the menu has none. Do not invent dishes, descriptions or prices.
- price is the number shown, in the menu's main currency unit: 18 for ₪18, 2.5 for 2.50. When an item lists several sizes, make one item per size with the size in the name, such as "Latte (large)". When no price is visible, use null.
- currency is the ISO code when a symbol or word is visible (₪ or شيكل is ILS, JD or دينار is JOD, $ is USD), otherwise null.
- notes holds up to three short English notes about anything you could not read or had to assume. Use an empty list when there is nothing to say.`;

const designInstructions = (b: BrandContext, locale: 'en' | 'ar') => `You are Savora's Theme assistant. You design the whole look of a café's bilingual (English and Arabic) guest menu, which guests read on their phones: colours, typeface, header, corners, dish layout, and which of the owner's photos to use as the logo or the header photo.

The owner leads the design. Do what they ask, in their words or by example, and decide only what they leave open.

The place: ${b.nameEn}${b.nameAr ? ` (${b.nameAr})` : ''}${b.taglineEn ? `, "${b.taglineEn}"` : ''}.
Its current look: colours ${JSON.stringify(b.current)}, style ${JSON.stringify(b.style)}. It ${b.hasLogo ? 'has' : 'has no'} logo and ${b.hasCover ? 'has' : 'has no'} header photo.

Each answer proposes exactly three designs. Each design is complete:
- colors: bg is the page behind the menu card, surface the card itself, primary is used for prices and filled buttons, accent for small highlights, ink for body text, muted for descriptions. Use #RRGGBB hex. Every design must be readable: ink on bg and on surface at least 4.5:1, muted on surface at least 4.5:1, primary on surface at least 4.5:1, and white, ink or bg on primary at least 4.5:1.
- font, for headings and dish names, in both scripts: "sans" is clean and modern; "serif" is editorial and classic; "rounded" is friendly and playful; "geometric" is a bold Kufi style with strong character.
- corners: "soft" is gently rounded; "round" is very rounded and friendly; "sharp" is crisp and minimal.
- header: "photo" shows the place's header photo at the top; "color" is a band of the primary colour; "plain" has no banner, so the logo and name open the page.
- layout: "list" is rows with small dish photos; "cards" shows every dish photo large, for photogenic food; "compact" is text only, like a printed menu, for long menus or a classic feel.
- boldPrices is true when prices should stand out.
- nameEn and nameAr: two or three evocative words in each language.

How to choose:
- Follow every explicit choice the owner made in all three designs (if they ask for a compact layout, all three are compact). Vary only what they left open, so the three are clearly different.
- Keep the place's identity (its current primary colour and style) unless the owner asks to move away from it.
- When the owner refines an earlier design ("make the prices bolder", "darker"), return the refined design first and two close variations.

The owner's photos are labelled "Photo 1", "Photo 2" and so on, in the order they were shared.
- logoPhoto is the number of a photo to use as the place's logo: when the owner asks for it, or clearly shares their logo to replace the current one. Otherwise null.
- coverPhoto is the number of a photo to show at the top of the menu: when the owner asks for it as the header or cover. Use header "photo" in all three designs then. Otherwise null.
- A logo or header photo you set stays applied for the rest of the conversation; return null for it in later answers unless the owner asks for another one.
- Take colours from a logo or photo the owner shares, and say briefly what you took and what you did with each photo. The owner never sees the photo numbers: say "your logo" or "the photo of your space", not "Photo 1".

If the owner asks for something a menu theme can't change (prices, dishes, opening hours, animations), say so in one short sentence and design the rest.

reply and note are written in the language of the owner's latest message (Arabic or English, in a natural, friendly register); when that isn't clear, in ${locale === 'ar' ? 'Arabic' : 'English'}. reply is at most three short sentences, each note one short line on what makes that design different. nameEn is always English and nameAr always Arabic.`;

// ---------- OpenRouter ----------

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5';

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'file'; file: { filename: string; file_data: string } };
type Message = { role: 'system' | 'user' | 'assistant'; content: string | Part[] };

const dataUrl = (f: AiFile) => `data:${f.mediaType};base64,${f.data.toString('base64')}`;
const part = (f: AiFile, i: number): Part =>
  f.mediaType === 'application/pdf' ? { type: 'file', file: { filename: `menu-${i + 1}.pdf`, file_data: dataUrl(f) } } : { type: 'image_url', image_url: { url: dataUrl(f) } };

/** Strict JSON Schema for OpenRouter's structured outputs, from the same zod schema we validate with. */
function jsonSchema(name: string, schema: z.ZodType) {
  const { $schema: _drop, ...body } = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  return { type: 'json_schema', json_schema: { name, strict: true, schema: body } };
}

/** Calls OpenRouter with structured output. Only endpoints that honour the schema are used
 *  (provider.require_parameters), and the answer is validated again here before anyone sees it. */
export function openRouterProvider(apiKey: string, opts: { model?: string; referer?: string; fetch?: typeof fetch } = {}): AiProvider {
  const model = opts.model || DEFAULT_MODEL;
  const doFetch = opts.fetch ?? fetch;

  async function call<T>(messages: Message[], name: string, schema: z.ZodType<T>): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          // Optional attribution OpenRouter shows in its dashboards.
          ...(opts.referer ? { 'http-referer': opts.referer } : {}),
          'x-title': 'Savora',
        },
        body: JSON.stringify({ model, messages, max_tokens: 16000, response_format: jsonSchema(name, schema), provider: { require_parameters: true } }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      throw new AiBusy(e instanceof Error ? e.message : 'unreachable');
    }
    // 402: out of credit; 408/429: slow down; 5xx: provider trouble. All worth trying again later.
    if (res.status === 402 || res.status === 408 || res.status === 429 || res.status >= 500) throw new AiBusy(`openrouter ${res.status}`);
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } }>;
    } | null;
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body?.error?.message ?? 'request failed'}`);
    const choice = body?.choices?.[0];
    if (!choice) throw new AiBusy('no answer');
    if (choice.message?.refusal || choice.finish_reason === 'content_filter') throw new AiRefused(choice.message?.refusal ?? 'content_filter');
    if (choice.finish_reason === 'length') throw new AiTooLong();
    let parsed: unknown;
    try {
      parsed = JSON.parse(choice.message?.content ?? '');
    } catch {
      throw new AiBusy('unparsed');
    }
    const checked = schema.safeParse(parsed);
    if (!checked.success) throw new AiBusy('off-schema');
    return checked.data;
  }

  return {
    readMenu: ({ files, currency }) =>
      call(
        [
          { role: 'system', content: READ_MENU },
          { role: 'user', content: [...files.map(part), { type: 'text', text: `The location's currency is ${currency}. Read this menu.` }] },
        ],
        'menu',
        ReadMenuSchema,
      ),

    designThemes: ({ brand, locale, turns }) => {
      // Photos are numbered in the order they were shared; the answer refers to them by number.
      let n = 0;
      return call(
        [
          { role: 'system', content: designInstructions(brand, locale) },
          // Earlier proposals go back as compact JSON so the assistant can refine what was picked.
          ...turns.map((t): Message =>
            t.role === 'user'
              ? { role: 'user', content: [...(t.photo ? [{ type: 'text', text: `Photo ${++n}:` } as Part, part(t.photo, 0)] : []), { type: 'text', text: t.text }] }
              : {
                  role: 'assistant',
                  content: JSON.stringify({
                    reply: t.text,
                    options: t.options.map(({ nameEn, nameAr, colors, font, corners, header, layout, boldPrices }) => ({ nameEn, nameAr, colors, font, corners, header, layout, boldPrices })),
                  }),
                },
          ),
        ],
        'theme_options',
        ThemeDesignSchema,
      );
    },
  };
}
