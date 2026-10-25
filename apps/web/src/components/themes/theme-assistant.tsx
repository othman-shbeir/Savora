'use client';

/* eslint-disable @next/next/no-img-element -- photo thumbnails are pre-sized WebP files from the API */
import { useRef, useState } from 'react';
import { fill, type AssistantOption, type Locale, type Photo } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { send } from '@/lib/client-api';
import { cx } from '@/lib/cx';
import { Card } from '../ui/card';
import { Icon, ICON, MiniTheme, type Look } from './theme-preview';

type Text = Dictionary['themes'];

/** An assistant option shown in the preview but not saved yet, with any of the owner's photos the
 *  assistant chose as the logo or the header photo. */
export type Draft = Look & { nameEn: string; nameAr: string | null; logo: Photo | null; cover: Photo | null };

type Turn = { role: 'user'; text: string; sent: string; photo: Photo | null } | { role: 'assistant'; text: string; options: AssistantOption[] };

/** The longest conversation sent back each turn; older turns drop off the front. */
const KEEP = 15;

/** A chat that designs three complete looks per request (colours, type, header, corners, layout) and
 *  can use the owner's photos as the logo or header. The conversation lives in the browser and goes
 *  back to the API each turn; every option arrives already checked for contrast. */
export function ThemeAssistant({
  t,
  locale,
  orgId,
  locationId,
  userName,
  placeName,
  canSave,
  draft,
  onPreview,
  onSaved,
}: {
  t: Text;
  locale: Locale;
  orgId: string;
  locationId: string;
  userName: string | null;
  placeName: string;
  canSave: boolean;
  draft: Draft | null;
  onPreview: (d: Draft | null) => void;
  onSaved: (ref: string) => void;
}) {
  const a = t.assistant;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ turn: number; option: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const first = userName?.trim().split(/\s+/)[0];
  const optionName = (o: { nameEn: string; nameAr: string }) => (locale === 'ar' && o.nameAr) || o.nameEn;
  const pickedOption = picked && draft ? (turns[picked.turn] as Extract<Turn, { role: 'assistant' }> | undefined)?.options[picked.option] : undefined;

  function preview(turn: number, option: number, o: AssistantOption) {
    setPicked({ turn, option });
    const { nameEn, nameAr, colors, font, boldPrices, corners, header, layout, logo, cover } = o;
    onPreview({ nameEn, nameAr: nameAr || null, colors, font, boldPrices, corners, header, layout, logo, cover });
  }

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean || thinking) return;
    // The model is told which option the owner is looking at, so "make it bolder" refines that one.
    const sent = pickedOption ? `${clean}\n\n(Currently previewing: ${pickedOption.nameEn})` : clean;
    const next: Turn[] = [...turns, { role: 'user', text: clean, sent, photo }];
    setTurns(next);
    setInput('');
    setPhoto(null);
    setError(null);
    setThinking(true);
    let history = next.slice(-KEEP);
    while (history[0]?.role === 'assistant') history = history.slice(1);
    const res = await send<{ reply: string; options: AssistantOption[]; error?: string }>('POST', `/organizations/${orgId}/themes/assistant`, {
      locationId,
      locale,
      turns: history.map((x) =>
        x.role === 'user'
          ? { role: 'user', text: x.sent, photoId: x.photo?.id ?? null }
          : {
              role: 'assistant',
              text: x.text,
              options: x.options.map(({ nameEn, nameAr, noteEn, noteAr, colors, font, boldPrices, corners, header, layout }) => ({ nameEn, nameAr, noteEn, noteAr, colors, font, boldPrices, corners, header, layout })),
            },
      ),
    });
    setThinking(false);
    if (!res.ok || !res.data) {
      const code = (res.data as { error?: string } | null)?.error;
      setError(res.status === 429 ? a.limit : code === 'ai_busy' ? a.busy : code === 'ai_unavailable' ? a.unavailableTitle : res.status === 422 ? a.declined : t.failed);
      return;
    }
    const reply: Turn = { role: 'assistant', text: res.data.reply, options: res.data.options };
    setTurns([...next, reply]);
    preview(next.length, 0, res.data.options[0]!);
  }

  async function attach(file: File) {
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`/api/organizations/${orgId}/media`, { method: 'POST', body }).catch(() => null);
    setUploading(false);
    if (!res?.ok) return setError(a.photoFailed);
    setPhoto((await res.json()) as Photo);
  }

  async function save(o: AssistantOption) {
    setSaving(true);
    const { nameEn, nameAr, colors, font, boldPrices, corners, header, layout } = o;
    const res = await send<{ ref: string }>('POST', `/organizations/${orgId}/themes`, { nameEn, nameAr: nameAr || null, colors, font, boldPrices, corners, header, layout });
    setSaving(false);
    if (!res.ok || !res.data) return setError(t.failed);
    onSaved(res.data.ref);
  }

  const bot = (children: React.ReactNode, key: string | number) => (
    <li key={key} className="flex items-start gap-2.5">
      <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand">
        <Icon d={ICON.spark} size={15} />
      </span>
      <div className="max-w-[560px] min-w-0 flex-1 rounded-[4px_16px_16px_16px] border border-line bg-surface-2 px-3.5 py-3 rtl:rounded-[16px_4px_16px_16px]">{children}</div>
    </li>
  );
  const lastAssistant = turns.findLastIndex((x) => x.role === 'assistant');

  return (
    <Card className="flex min-h-[560px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-brand-fill text-white">
            <Icon d={ICON.spark} size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-title-s font-semibold">{a.title}</span>
            <span className="block truncate text-caption text-muted">{fill(a.subtitle, { name: placeName })}</span>
          </span>
        </span>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              setPicked(null);
              setError(null);
              onPreview(null);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-line-2 px-3 py-1.5 text-caption font-semibold text-ink-2 hover:bg-surface-2"
          >
            <Icon d={ICON.refresh} size={13} />
            {a.startOver}
          </button>
        )}
      </div>

      <ol aria-live="polite" className="grid content-start gap-3.5 p-5">
        {bot(<p className="text-body-s">{fill(first ? a.hello : a.helloAnon, { name: first ?? '', place: placeName })}</p>, 'hello')}
        {turns.map((turn, ti) =>
          turn.role === 'user' ? (
            <li key={ti} className="flex items-start justify-end gap-2.5">
              <div className="max-w-[440px] rounded-[16px_4px_16px_16px] bg-ink px-3.5 py-3 text-surface rtl:rounded-[4px_16px_16px_16px]">
                <p className="text-body-s whitespace-pre-line">{turn.text}</p>
                {turn.photo && <img src={turn.photo.thumbUrl} alt="" className="mt-2 size-16 rounded-lg object-cover" />}
              </div>
              <span aria-label={a.you} className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#242424] text-caption font-semibold text-white">
                {(first ?? a.you).slice(0, 1).toUpperCase()}
              </span>
            </li>
          ) : (
            bot(
              <>
                <p className="text-body-s">{turn.text}</p>
                {(turn.options[0]?.logo || turn.options[0]?.cover) && (
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {(
                      [
                        [turn.options[0].logo, a.newLogo],
                        [turn.options[0].cover, a.newCover],
                      ] as const
                    ).map(([p, label]) =>
                      p ? (
                        <li key={label} className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface p-1 pe-2.5 text-caption font-semibold">
                          <img src={p.url} alt="" className="size-8 rounded-md bg-white object-contain" />
                          {label}
                        </li>
                      ) : null,
                    )}
                  </ul>
                )}
                <ul className="mt-3 grid gap-2.5 sm:grid-cols-3">
                  {turn.options.map((o, oi) => {
                    const on = Boolean(draft) && picked?.turn === ti && picked.option === oi;
                    const note = locale === 'ar' ? o.noteAr || o.noteEn : o.noteEn || o.noteAr;
                    return (
                      <li key={oi}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => preview(ti, oi, o)}
                          className={cx('block w-full rounded-[14px] bg-surface p-2 pb-3 text-start', on ? 'shadow-[0_0_0_2px_var(--brand)]' : 'border border-line hover:border-line-2')}
                        >
                          <MiniTheme colors={o.colors} height={92} />
                          <span className="mx-1 mt-2 flex items-center justify-between gap-1.5">
                            <span className="truncate text-title-s font-semibold">{optionName(o)}</span>
                            {on ? <span className="shrink-0 rounded-full bg-brand-fill px-2 py-0.5 text-[10px] font-semibold text-white">{a.picked}</span> : <span className="shrink-0 text-[11px] text-muted">{a.pick}</span>}
                          </span>
                          {note && <span className="mx-1 mt-0.5 line-clamp-2 block text-[11px] text-muted">{note}</span>}
                          <span className="mx-1 mt-1 block truncate text-[10px] font-semibold text-ink-2">
                            {t.style.layout[o.layout]} · {t.style.header[o.header]}
                          </span>
                          {o.adjusted && <span className="mx-1 mt-1 block text-[10px] font-semibold text-gold-ink">{a.adjusted}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-ok-soft px-2 py-1 text-[11px] font-semibold text-ok">
                    <Icon d={ICON.check} size={11} strokeWidth={3} />
                    {a.allPass}
                  </span>
                  <span className="text-[11px] text-muted">{a.checkedBoth}</span>
                </p>
                {ti === lastAssistant && canSave && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(() => {
                      const o = picked?.turn === ti && draft ? turn.options[picked.option]! : turn.options[0]!;
                      return (
                        <button type="button" disabled={saving} onClick={() => save(o)} className="inline-flex items-center gap-1.5 rounded-[9px] bg-brand-fill px-3 py-2 text-caption font-semibold text-white disabled:opacity-50">
                          <Icon d={ICON.check} size={12} strokeWidth={3} />
                          {saving ? a.saving : fill(a.save, { name: optionName(o) })}
                        </button>
                      );
                    })()}
                    <button type="button" onClick={() => inputRef.current?.focus()} className="rounded-[9px] border border-line-2 px-3 py-2 text-caption font-semibold hover:bg-surface-2">
                      {a.keepTweaking}
                    </button>
                  </div>
                )}
              </>,
              ti,
            )
          ),
        )}
        {thinking &&
          bot(
            <p className="flex items-center gap-2 text-body-s text-muted">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-brand-fill" />
              {a.thinking}
            </p>,
            'thinking',
          )}
      </ol>

      <div className="mt-auto border-t border-line px-5 pt-3.5 pb-[18px]">
        {error && (
          <p role="alert" className="mb-2.5 rounded-lg bg-gold-soft px-3 py-2 text-caption">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {a.chips.map((c) => (
            <button key={c} type="button" disabled={thinking} onClick={() => ask(c)} className="rounded-full border border-line-2 px-3 py-1.5 text-caption font-semibold text-ink-2 hover:border-ink disabled:opacity-50">
              {c}
            </button>
          ))}
        </div>
        {photo && (
          <div className="mt-2.5 inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 p-1.5 pe-2">
            <img src={photo.thumbUrl} alt="" className="size-9 rounded-md object-cover" />
            <button type="button" onClick={() => setPhoto(null)} aria-label={a.removePhoto} className="grid size-6 place-items-center rounded-md text-muted hover:text-ink">
              <Icon d={ICON.x} size={13} />
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mt-2.5 flex h-12 items-center gap-2.5 rounded-[14px] border border-line-2 bg-surface-2 ps-2 pe-2 focus-within:border-ink"
        >
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label={uploading ? a.uploading : a.attach} title={a.attach} className="grid size-8 place-items-center rounded-lg text-muted hover:text-ink disabled:animate-pulse">
            <Icon d={ICON.clip} size={17} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) attach(f);
            }}
          />
          <label htmlFor="assistant-input" className="sr-only">
            {a.inputLabel}
          </label>
          <input
            id="assistant-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder={a.placeholder}
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-body-s outline-none placeholder:text-[#9a9a9a]"
          />
          <button type="submit" disabled={!input.trim() || thinking} aria-label={a.send} className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-brand-fill text-white disabled:opacity-40">
            <Icon d={ICON.send} size={15} className="rtl:-scale-x-100" />
          </button>
        </form>
      </div>
    </Card>
  );
}
