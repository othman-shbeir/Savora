import Link from 'next/link';
import type { Locale } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { Logo } from '../ui/logo';
import { DishRow, Icon, LangPill, SAMPLE_EN } from './parts';

type Text = Dictionary['landing'];

/** "Your menu deserves more than a PDF": the squinted-at PDF next to the live menu that replaces it. */
export function Closing({ l, start, startLabel, exampleHref }: { l: Text; start: string; startLabel: string; exampleHref: string | null }) {
  return (
    <section aria-labelledby="closing-h" className="mx-auto max-w-[1240px] px-5 pb-20 sm:px-8">
      <div className="relative grid items-center gap-12 overflow-hidden rounded-[32px] bg-[#1c1c1c] px-6 py-14 sm:px-16 sm:py-[70px] lg:grid-cols-[minmax(0,1fr)_440px]">
        <span aria-hidden className="absolute -end-24 -bottom-48 size-[520px] rounded-full bg-[rgb(219_26_26/0.16)]" />
        <span aria-hidden className="absolute -end-10 -bottom-32 size-[400px] rounded-full border border-white/8" />
        <div className="relative">
          <p className="text-[11px] font-semibold tracking-[0.11em] text-[#d9a441] uppercase rtl:tracking-normal">{l.closingOverline}</p>
          <h2 id="closing-h" className="mt-4 max-w-[470px] text-[clamp(32px,4vw,44px)] leading-[1.14] font-semibold tracking-[-0.025em] text-[#f5f5f5] rtl:leading-[1.35] rtl:tracking-normal">
            {l.closingTitle}
          </h2>
          <p className="mt-4 max-w-[492px] text-[15px] leading-[1.65] text-[#a6a6a6]">{l.closingBody}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={start} className="inline-flex h-[51px] items-center gap-2.5 rounded-xl bg-brand-fill px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgb(219_26_26/0.35)] transition-colors hover:bg-brand-fill-hover">
              {startLabel}
              <Icon name="arrow-white-lg" size={18} className="rtl:-scale-x-100" />
            </Link>
            {exampleHref && (
              <Link href={exampleHref} className="inline-flex h-[51px] items-center rounded-xl border border-white/20 px-6 text-[15px] font-semibold text-[#f5f5f5] transition-colors hover:border-white/50">
                {l.ctaExample}
              </Link>
            )}
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
            {l.closingTicks.map((c) => (
              <li key={c} className="flex items-center gap-2 text-[12px] text-[#cfcfcf]">
                <span className="grid size-5 place-items-center rounded-full bg-[rgb(255_77_77/0.16)]">
                  <Icon name="check-red-light" size={11} />
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div aria-hidden className="relative mx-auto h-[300px] w-[440px] max-w-full origin-top scale-[0.8] sm:scale-100" dir="ltr">
          <div className="absolute top-0 left-0 h-[292px] w-[224px] rounded-[20px] border border-white/9 bg-white/5 p-[18px]">
            <p className="flex items-center gap-2.5">
              <span className="grid size-[30px] place-items-center rounded-lg bg-white/8">
                <Icon name="file" size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[#e6e6e6]">{l.pdfName}</span>
                <span className="block text-[10px] text-[#969696]">{l.pdfMeta}</span>
              </span>
            </p>
            <div className="mt-5 grid gap-2.5">
              {[92, 84, 70, 78, 0, 88, 80, 62, 76, 50].map((w, i) => (w ? <span key={i} className="block h-[6px] rounded-full bg-white/12" style={{ width: `${w}%` }} /> : <span key={i} className="h-1" />))}
            </div>
            <p className="absolute bottom-5 left-[18px] text-[11px] text-[#969696]">{l.pdfCaption}</p>
          </div>
          <span className="absolute top-[124px] left-[148px] grid size-11 place-items-center rounded-full bg-[#ff4d4d] shadow-[0_0_0_6px_#1c1c1c]">
            <Icon name="arrow-white-lg" size={18} />
          </span>
          <div lang="en" className="absolute top-9 left-[170px] z-10 w-[270px] rounded-[20px] bg-white p-[18px] pb-3 shadow-[0_24px_50px_rgb(0_0_0/0.45)]">
            <div className="flex items-center gap-2.5">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-full border border-[#db1a1a] text-[13px] font-bold text-[#db1a1a]">S</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-[1.4] font-semibold text-[#242424]">Salt &amp; Stem</span>
                <span className="block text-[11px] leading-[1.4] text-[#6b6b6b]">Good coffee, slow mornings.</span>
              </span>
              <span className="flex items-center gap-1 rounded-full bg-[#e9f3ed] px-2 py-0.5 text-[10px] font-semibold text-[#2b774f]">
                <span className="size-1.5 rounded-full bg-current" />
                Live
              </span>
            </div>
            <div className="mt-3 flex justify-between border-b border-[#e7e7e7] pb-1.5">
              <span className="text-[10px] font-semibold tracking-[0.1em] text-[#db1a1a] uppercase">House favorites</span>
              <span className="font-arabic text-[11px] text-[#6b6b6b]">المفضلة لدينا</span>
            </div>
            {SAMPLE_EN.map((d, i) => (
              <DishRow key={d.name} dish={d} compact last={i === SAMPLE_EN.length - 1} />
            ))}
            <p className="mt-1 flex items-center justify-between border-t border-[#e7e7e7] pt-2.5 text-[11px] text-[#6b6b6b]">
              Updated 2 min ago
              <LangPill active="en" />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Logo and line, the section links, then the small print. */
export function Footer({ l, locale, signedIn }: { l: Text; locale: Locale; signedIn: boolean }) {
  return (
    <footer className="mx-auto max-w-[1240px] px-5 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-6 border-t border-line py-7">
        <div className="flex items-center gap-5">
          <Logo width={90} />
          <span aria-hidden className="h-6 w-px bg-line-2" />
          <span className="text-[13px] text-muted">{l.footerLine}</span>
        </div>
        <nav aria-label={l.footerLabel} className="flex flex-wrap gap-x-8 gap-y-2 text-[14px] font-medium text-ink-2">
          <a href="#examples" className="hover:text-ink">
            {l.nav.examples}
          </a>
          <a href="#how" className="hover:text-ink">
            {l.nav.how}
          </a>
          <a href="#pricing" className="hover:text-ink">
            {l.nav.pricing}
          </a>
          <Link href={signedIn ? `/${locale}/app` : `/${locale}/sign-in`} className="hover:text-ink">
            {signedIn ? l.nav.workspace : l.nav.signIn}
          </Link>
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 pb-10 text-[12px] text-muted">
        <span className="flex gap-5">
          <span>© {new Date().getFullYear()} Savora</span>
          <Link href={`/${locale}/privacy`} className="hover:text-ink">
            {l.privacy}
          </Link>
          <Link href={`/${locale}/terms`} className="hover:text-ink">
            {l.terms}
          </Link>
        </span>
        <span>{l.audience}</span>
      </div>
    </footer>
  );
}
