'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { buttonClass } from './primitives';

/** Confirmation dialog for destructive / high-impact actions (WEB_ADMIN §4). */
export function ConfirmDialog({
  triggerLabel,
  triggerVariant = 'secondary',
  title,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  triggerLabel: string;
  triggerVariant?: 'primary' | 'secondary' | 'danger';
  title: string;
  children: (close: () => void) => ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (value: boolean) => {
    onOpenChange?.(value);
    setUncontrolledOpen(value);
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button type="button" className={buttonClass(triggerVariant)} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`${title}-title`}
        onClose={() => setOpen(false)}
        className="m-auto w-full max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="p-5">
          <h2 id={`${title}-title`} className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <div className="mt-3">{open ? children(() => setOpen(false)) : null}</div>
        </div>
      </dialog>
    </>
  );
}

/** Submit button that prevents duplicate submits while pending. */
export function SubmitButton({
  pending,
  children,
  variant = 'primary',
}: {
  pending: boolean;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant)}>
      {pending ? 'Saving…' : children}
    </button>
  );
}
