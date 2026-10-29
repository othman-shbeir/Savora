import { cx } from '@/lib/cx';

/** A grey placeholder bar or block. */
export function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={cx('block animate-pulse rounded-lg bg-surface-2', className)} style={style} />;
}

const box = 'rounded-[20px] border border-line bg-surface p-6 shadow-card';

/** What a workspace page looks like while its data is on the way: shown the moment a link is
 *  clicked (it is prefetched with the route), then swapped for the real page. Each shape roughly
 *  matches its page so nothing jumps when the content arrives. */
export function PageSkeleton({ label, shape = 'cards' }: { label: string; shape?: 'overview' | 'editor' | 'chart' | 'form' | 'cards' }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Bone className="h-3 w-24" />
      <Bone className="mt-3.5 h-9 w-72 max-w-full" />
      <Bone className="mt-3 h-4 w-[28rem] max-w-full" />

      {shape === 'overview' && (
        <>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={box}>
                <Bone className="h-3 w-20" />
                <Bone className="mt-4 h-8 w-16" />
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Rows n={4} />
            <div className={box}>
              <Bone className="h-40 w-full rounded-xl" />
            </div>
          </div>
        </>
      )}

      {shape === 'editor' && (
        <>
          <div className="mt-7 h-[260px] animate-pulse rounded-[20px] bg-[#1f1f1f]" aria-hidden />
          <div className="mt-6 flex gap-2">
            {[0, 1, 2].map((i) => (
              <Bone key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>
          <div className="mt-4">
            <Rows n={5} thumbs />
          </div>
        </>
      )}

      {shape === 'chart' && (
        <>
          <div className={cx(box, 'mt-7')}>
            <Bone className="h-3 w-28" />
            <div className="mt-6 flex h-48 items-end gap-2">
              {[40, 65, 50, 80, 55, 90, 70, 45, 75, 60, 85, 50].map((h, i) => (
                <Bone key={i} className="flex-1 rounded-md" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={box}>
                <Bone className="h-3 w-20" />
                <Bone className="mt-4 h-7 w-24" />
              </div>
            ))}
          </div>
        </>
      )}

      {shape === 'form' && (
        <div className="mt-7 grid max-w-3xl gap-4">
          {[4, 3].map((n, i) => (
            <div key={i} className={box}>
              <Bone className="h-5 w-40" />
              {Array.from({ length: n }, (_, j) => (
                <div key={j} className="mt-5">
                  <Bone className="h-3 w-24" />
                  <Bone className="mt-2 h-11 w-full rounded-xl" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {shape === 'cards' && (
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={box}>
              <Bone className="h-32 w-full rounded-xl" />
              <Bone className="mt-4 h-4 w-32" />
              <Bone className="mt-2 h-3 w-48 max-w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Rows({ n, thumbs }: { n: number; thumbs?: boolean }) {
  return (
    <div className={cx(box, 'grid gap-5')}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          {thumbs && <Bone className="size-14 shrink-0 rounded-xl" />}
          <span className="min-w-0 flex-1">
            <Bone className="h-4 w-40 max-w-full" />
            <Bone className="mt-2 h-3 w-64 max-w-full" />
          </span>
          <Bone className="h-6 w-14 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
