'use client';

import { useId, type ComponentProps } from 'react';
import { cx } from '@/lib/cx';

type FieldProps = ComponentProps<'input'> & { label: string; hint?: string; error?: string };

/** Labelled text input. The hint or error is announced to screen readers via aria-describedby. */
export function Field({ label, hint, error, className, id, type, dir, ...rest }: FieldProps) {
  const auto = useId();
  // Emails, links and phone numbers always read left to right, even on an Arabic page.
  const fieldDir = dir ?? (type === 'email' || type === 'url' || type === 'tel' ? 'ltr' : undefined);
  const inputId = id ?? auto;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cx('grid content-start gap-1.5', className)}>
      <label htmlFor={inputId} className="text-caption font-medium text-ink-2">
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        dir={fieldDir}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'h-11 rounded-[11px] border bg-surface px-3.5 text-body-s text-ink outline-none transition-shadow placeholder:text-muted',
          'focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]',
          error ? 'border-brand' : 'border-line-2',
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-caption text-brand">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const control =
  'rounded-[11px] border bg-surface px-3.5 text-body-s text-ink outline-none transition-shadow placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]';

/** Multi-line companion to Field, same label/hint/error behaviour. */
export function TextArea({ label, hint, error, className, id, ...rest }: ComponentProps<'textarea'> & { label: string; hint?: string; error?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={cx('grid content-start gap-1.5', className)}>
      <label htmlFor={inputId} className="text-caption font-medium text-ink-2">
        {label}
      </label>
      <textarea
        id={inputId}
        rows={2}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cx(control, 'min-h-[68px] resize-y py-2.5', error ? 'border-brand' : 'border-line-2')}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-caption text-brand">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Select({ label, className, id, children, ...rest }: ComponentProps<'select'> & { label: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={cx('grid content-start gap-1.5', className)}>
      <label htmlFor={inputId} className="text-caption font-medium text-ink-2">
        {label}
      </label>
      <select id={inputId} className={cx(control, 'h-11 border-line-2 pe-8')} {...rest}>
        {children}
      </select>
    </div>
  );
}
