import { useId } from "react";

export function Field({ label, error, help, children, required }: { label: string; error?: string; help?: string; children: (id: string, describedBy?: string) => React.ReactNode; required?: boolean }) {
  const id = useId();
  const describedBy = [error ? `${id}-err` : null, help ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} {required && <span className="text-red-700 dark:text-red-400" aria-hidden>*</span>}
      </label>
      {children(id, describedBy)}
      {help && !error && <p id={`${id}-help`} className="help">{help}</p>}
      {error && <p id={`${id}-err`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}
