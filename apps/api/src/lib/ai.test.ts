import { describe, expect, it } from 'vitest';
import { AiBusy, AiRefused, AiTooLong, DEFAULT_MODEL, openRouterProvider } from './ai';

// A stand-in for the network: records the request, answers with whatever the test sets.
function fakeFetch(answer: { status?: number; body: unknown }) {
  const calls: Array<{ url: string; init: RequestInit & { headers: Record<string, string> } }> = [];
  const fn = (async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls, sent: () => JSON.parse(String(calls[0]!.init.body)) };
}

const menu = { currency: 'ILS', categories: [{ nameEn: 'Coffee', nameAr: 'قهوة', items: [{ nameEn: 'Latte', nameAr: 'لاتيه', descriptionEn: null, descriptionAr: null, price: 18 }] }], notes: [] };
const ok = (content: unknown, finish = 'stop') => ({ body: { choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }] } });
const files = [
  { mediaType: 'image/jpeg' as const, data: Buffer.from('jpeg-bytes') },
  { mediaType: 'application/pdf' as const, data: Buffer.from('%PDF-1.4') },
];

describe('OpenRouter provider', () => {
  it('sends photos and PDFs with a strict schema, and returns the checked answer', async () => {
    const f = fakeFetch(ok(menu));
    const ai = openRouterProvider('sk-or-test', { referer: 'https://savora.menu', fetch: f.fn });
    expect(await ai.readMenu({ files, currency: 'ILS' })).toEqual(menu);

    expect(f.calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(f.calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer sk-or-test', 'http-referer': 'https://savora.menu', 'x-title': 'Savora' });
    const body = f.sent();
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'menu', strict: true, schema: { type: 'object', additionalProperties: false } } });
    expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
    expect(body.messages[0].role).toBe('system');
    const parts = body.messages[1].content;
    expect(parts[0]).toEqual({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}` } });
    expect(parts[1]).toMatchObject({ type: 'file', file: { filename: 'menu-2.pdf', file_data: expect.stringMatching(/^data:application\/pdf;base64,/) } });
    expect(parts[2]).toMatchObject({ type: 'text' });
  });

  it('uses the configured model', async () => {
    const f = fakeFetch(ok(menu));
    await openRouterProvider('k', { model: 'anthropic/claude-haiku-5.5', fetch: f.fn }).readMenu({ files, currency: 'ILS' });
    expect(f.sent().model).toBe('anthropic/claude-haiku-5.5');
  });

  it('turns provider trouble into errors the screens can explain', async () => {
    const read = (answer: Parameters<typeof fakeFetch>[0]) => openRouterProvider('k', { fetch: fakeFetch(answer).fn }).readMenu({ files, currency: 'ILS' });
    await expect(read({ status: 429, body: { error: { message: 'slow down' } } })).rejects.toBeInstanceOf(AiBusy);
    await expect(read({ status: 402, body: { error: { message: 'no credit' } } })).rejects.toBeInstanceOf(AiBusy);
    await expect(read({ status: 503, body: {} })).rejects.toBeInstanceOf(AiBusy);
    await expect(read(ok(menu, 'length'))).rejects.toBeInstanceOf(AiTooLong);
    await expect(read({ body: { choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I can’t help with that.' } }] } })).rejects.toBeInstanceOf(AiRefused);
    await expect(read({ body: { choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] } })).rejects.toBeInstanceOf(AiBusy);
    // Valid JSON that doesn't match the schema never reaches the screens.
    await expect(read(ok({ currency: 'ILS' }))).rejects.toBeInstanceOf(AiBusy);
    // A bad request is a bug on our side, not something to retry.
    await expect(read({ status: 400, body: { error: { message: 'bad schema' } } })).rejects.toThrow('OpenRouter 400: bad schema');
  });

  it('sends the assistant conversation with earlier options as JSON', async () => {
    const design = { reply: 'Three directions.', options: [] };
    const f = fakeFetch(ok(design));
    const ai = openRouterProvider('k', { fetch: f.fn });
    await ai.designThemes({
      brand: { nameEn: 'Salt & Stem', nameAr: null, taglineEn: null, current: { bg: '#F5F5F5', surface: '#FFFFFF', primary: '#DB1A1A', accent: '#D9A441', ink: '#242424', muted: '#6E6E6E' } },
      locale: 'ar',
      turns: [
        { role: 'user', text: 'warmer', photo: { mediaType: 'image/webp', data: Buffer.from('w') } },
        { role: 'assistant', text: 'Here', options: [{ nameEn: 'Dawn', nameAr: 'فجر', noteEn: '', noteAr: '', colors: { bg: '#000000', surface: '#111111', primary: '#FF0000', accent: '#00FF00', ink: '#FFFFFF', muted: '#AAAAAA' }, font: 'sans', boldPrices: false }] },
        { role: 'user', text: 'darker' },
      ],
    });
    const m = f.sent().messages;
    expect(m.map((x: { role: string }) => x.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(m[0].content).toContain('written in Arabic');
    expect(m[1].content[0].image_url.url).toMatch(/^data:image\/webp;base64,/);
    expect(JSON.parse(m[2].content).options[0].nameEn).toBe('Dawn');
    expect(f.sent().response_format.json_schema.name).toBe('theme_options');
  });
});
