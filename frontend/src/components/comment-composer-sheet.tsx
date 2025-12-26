'use client';

import { useEffect, useRef } from 'react';

interface CommentComposerSheetProps {
  open: boolean;
  value: string;
  submitting?: boolean;
  replyLabel?: string | null;
  cursorPosition?: number | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CommentComposerSheet({
  open,
  value,
  submitting,
  replyLabel,
  cursorPosition,
  onChange,
  onClose,
  onSubmit
}: CommentComposerSheetProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const pos = cursorPosition ?? el.value.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    }
  }, [open, cursorPosition]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-900/50"
        aria-label="Close comment composer"
        onClick={onClose}
        disabled={submitting}
      />
      <div className="relative w-full max-w-2xl rounded-t-2xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">New comment</h3>
          <button
            type="button"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
            onClick={onClose}
            disabled={submitting}
          >
            Close
          </button>
        </div>
        {replyLabel && <p className="mt-1 text-xs text-slate-500">Replying to {replyLabel}</p>}
        <textarea
          ref={textareaRef}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write a comment"
          className="mt-3 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-900 focus:border-slate-400 focus:outline-none"
          disabled={submitting}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSubmit}
            disabled={submitting || value.trim().length === 0}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
