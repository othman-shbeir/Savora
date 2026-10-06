import { getDictionary } from '../../dictionaries';

/** Unknown guest link: usually a typo or an old printed code. */
export default async function GuestMenuNotFound() {
  const t = (await getDictionary()).guest;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
      <div>
        <p aria-hidden className="text-display leading-none font-bold text-brand">404</p>
        <h1 className="mt-4 text-heading-m font-semibold">{t.missingTitle}</h1>
        <p className="mx-auto mt-2 max-w-xs text-body-m text-muted">{t.missingBody}</p>
      </div>
    </main>
  );
}
