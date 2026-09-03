import type { ReactNode } from "react";

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Simple centered modal dialog for create/edit forms across the admin console. */
export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm px-2 py-1 text-on-surface-variant hover:bg-surface-container"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
