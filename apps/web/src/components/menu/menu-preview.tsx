/* eslint-disable @next/next/no-img-element -- photos are pre-sized WebP thumbnails from the API */
import { fill, formatPrice, type Locale, type MenuCategory, type MenuItem } from '@savora/shared';
import { descriptionOf, primaryName } from '@/lib/menu-text';
import type { EditorText } from './menu-editor';

type Spot = { item: MenuItem; categoryId: string };
const index = (cats: MenuCategory[]) => new Map(cats.flatMap((c) => c.items.map((item): [string, Spot] => [item.id, { item, categoryId: c.id }])));
const sameDish = (a: MenuItem, b: MenuItem) =>
  a.nameEn === b.nameEn &&
  a.nameAr === b.nameAr &&
  a.descriptionEn === b.descriptionEn &&
  a.descriptionAr === b.descriptionAr &&
  a.priceMinor === b.priceMinor &&
  (a.photo?.id ?? null) === (b.photo?.id ?? null);

/** Plain sentences for what the owner changed since the last save, in the order they read best:
 *  categories first, then dishes. */
export function describeChanges(saved: MenuCategory[], current: MenuCategory[], t: EditorText, locale: Locale): string[] {
  const name = (x: { nameEn: string | null; nameAr: string | null }) => primaryName(x, locale) || '—';
  const out: string[] = [];
  const savedCats = new Map(saved.map((c) => [c.id, c]));
  const currentCats = new Map(current.map((c) => [c.id, c]));

  for (const c of current) {
    const before = savedCats.get(c.id);
    if (!before) out.push(fill(t.changeAddedCategory, { name: name(c) }));
    else if (before.nameEn !== c.nameEn || before.nameAr !== c.nameAr) out.push(fill(t.changeRenamedCategory, { from: name(before), name: name(c) }));
  }
  for (const c of saved) if (!currentCats.has(c.id)) out.push(fill(t.changeRemovedCategory, { name: name(c) }));
  const kept = (list: MenuCategory[]) => list.filter((c) => savedCats.has(c.id) && currentCats.has(c.id)).map((c) => c.id);
  if (kept(saved).join() !== kept(current).join()) out.push(t.changeReorderedCategories);

  const before = index(saved);
  const after = index(current);
  for (const [id, { item, categoryId }] of after) {
    const was = before.get(id);
    if (!was) {
      out.push(fill(t.changeAddedItem, { name: name(item) }));
      continue;
    }
    if (was.categoryId !== categoryId) out.push(fill(t.changeMovedItem, { name: name(item), category: name(currentCats.get(categoryId)!) }));
    if (!sameDish(was.item, item)) out.push(fill(t.changeEditedItem, { name: name(item) }));
    if (was.item.available !== item.available) out.push(fill(item.available ? t.changeShowed : t.changeHid, { name: name(item) }));
  }
  // A dish that went with its category is already covered by "Removed the … category".
  for (const [id, { item, categoryId }] of before) if (!after.has(id) && currentCats.has(categoryId)) out.push(fill(t.changeRemovedItem, { name: name(item) }));
  for (const c of current) {
    const was = savedCats.get(c.id);
    if (!was) continue;
    const stay = (items: MenuItem[]) => items.filter((i) => before.get(i.id)?.categoryId === c.id && after.get(i.id)?.categoryId === c.id).map((i) => i.id);
    if (stay(was.items).join() !== stay(c.items).join()) out.push(fill(t.changeReordered, { category: name(c) }));
  }
  return out;
}

/** The menu as guests will get it once these changes are saved and published: only dishes on show,
 *  only categories with some, in a phone-sized column. */
export function GuestPreview({
  categories,
  currency,
  brand,
  t,
  locale,
}: {
  categories: MenuCategory[];
  currency: string;
  brand: { name: string; tagline: string | null };
  t: EditorText;
  locale: Locale;
}) {
  const shown = categories.map((c) => ({ ...c, items: c.items.filter((i) => i.available) })).filter((c) => c.items.length);
  return (
    <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[24px] border border-line bg-surface shadow-card">
      <div className="bg-[#1f1f1f] px-5 pt-6 pb-5 text-white">
        <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-brand-fill text-title-m font-bold">
          {brand.name.slice(0, 1)}
        </span>
        <p className="mt-3 text-heading-s font-semibold">{brand.name}</p>
        {brand.tagline && <p className="mt-0.5 text-caption text-white/70">{brand.tagline}</p>}
      </div>
      <div className="max-h-[52dvh] overflow-y-auto px-5 pb-6">
        {shown.length === 0 ? (
          <p className="py-10 text-center text-caption text-muted">{t.previewEmpty}</p>
        ) : (
          shown.map((c) => (
            <section key={c.id} className="pt-5">
              <h3 className="border-b border-line pb-2 text-title-m font-semibold">{primaryName(c, locale)}</h3>
              <ul>
                {c.items.map((i, n) => (
                  <li key={i.id} className={`flex items-center gap-3 py-3 ${n < c.items.length - 1 ? 'border-b border-dashed border-line' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-s font-semibold">{primaryName(i, locale)}</p>
                      {descriptionOf(i, locale) && <p className="mt-0.5 text-caption text-muted">{descriptionOf(i, locale)}</p>}
                      <span dir="ltr" className="mt-1.5 inline-block rounded-md bg-brand-soft px-2 py-0.5 font-mono text-caption font-semibold text-brand">
                        {formatPrice(i.priceMinor, currency)}
                      </span>
                    </div>
                    {i.photo && <img src={i.photo.thumbUrl} alt="" width={64} height={64} loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
