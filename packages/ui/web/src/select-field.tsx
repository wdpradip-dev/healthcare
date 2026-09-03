import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}

/** Labeled select input, styled to match TextField. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, id, className = "", children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-on-surface">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={Boolean(error)}
        className={`h-11 rounded-sm border bg-surface px-3 text-sm text-on-surface outline-none transition-colors focus:border-primary ${
          error ? "border-error" : "border-outline"
        } ${className}`}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
});
