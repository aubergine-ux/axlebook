import { type ReactNode, useId } from 'react';
import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  FieldError,
  Input,
  Label,
  Text,
  TextArea,
} from 'react-aria-components';

const labelClass = 'text-label';
const hintClass = 'text-caption text-ink-muted';
const errorClass = 'text-caption font-semibold text-red';
export const controlClass =
  'min-h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-body text-ink placeholder:text-ink-muted data-[invalid]:border-red data-[focused]:outline-2 data-[focused]:outline-offset-2 data-[focused]:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

interface CommonProps {
  label: string;
  description?: string;
  /** Translated error message; marks the field invalid when set. */
  error?: string;
}

type TextFieldProps = CommonProps &
  Omit<AriaTextFieldProps, 'isInvalid' | 'children'> & {
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    placeholder?: string;
    className?: string;
    inputClassName?: string;
  };

export function TextField({
  label,
  description,
  error,
  inputMode,
  placeholder,
  className,
  inputClassName,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField
      {...props}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className={`flex flex-col gap-1 ${className ?? ''}`}
    >
      <Label className={labelClass}>{label}</Label>
      <Input
        inputMode={inputMode}
        placeholder={placeholder}
        className={`${controlClass} ${inputClassName ?? ''}`}
      />
      {description && !error && (
        <Text slot="description" className={hintClass}>
          {description}
        </Text>
      )}
      <FieldError className={errorClass}>{error}</FieldError>
    </AriaTextField>
  );
}

export function TextAreaField({
  label,
  description,
  error,
  className,
  rows = 4,
  ...props
}: CommonProps &
  Omit<AriaTextFieldProps, 'isInvalid' | 'children'> & { className?: string; rows?: number }) {
  return (
    <AriaTextField
      {...props}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className={`flex flex-col gap-1 ${className ?? ''}`}
    >
      <Label className={labelClass}>{label}</Label>
      <TextArea rows={rows} className={`${controlClass} py-2`} />
      {description && !error && (
        <Text slot="description" className={hintClass}>
          {description}
        </Text>
      )}
      <FieldError className={errorClass}>{error}</FieldError>
    </AriaTextField>
  );
}

/**
 * Native <select>: best on phones (OS picker), fully accessible. Label, hint and
 * error are wired up with aria attributes.
 */
export function SelectField<T extends string>({
  label,
  description,
  error,
  value,
  onChange,
  options,
  className,
  name,
}: CommonProps & {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  name?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [description && !error ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') ||
          undefined
        }
        className={`${controlClass} aria-[invalid=true]:border-red`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {description && !error && (
        <p id={hintId} className={hintClass}>
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className={errorClass}>
          {error}
        </p>
      )}
    </div>
  );
}

export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6">
      <legend className="px-1 text-heading font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
