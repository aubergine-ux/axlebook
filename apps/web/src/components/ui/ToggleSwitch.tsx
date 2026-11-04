import { Switch } from 'react-aria-components';

/** An on/off switch with its label beside it. */
export function ToggleSwitch({
  label,
  isSelected,
  onChange,
}: {
  label: string;
  isSelected: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Switch
      isSelected={isSelected}
      onChange={onChange}
      className="group flex cursor-pointer items-center gap-2 text-label text-ink-muted"
    >
      <span className="flex h-6 w-10 items-center rounded-full border border-line-strong bg-surface-sunken px-0.5 transition-colors group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus group-data-[selected]:border-ink group-data-[selected]:bg-ink">
        <span className="h-4.5 w-4.5 rounded-full bg-surface-raised shadow transition-transform group-data-[selected]:translate-x-4" />
      </span>
      {label}
    </Switch>
  );
}
