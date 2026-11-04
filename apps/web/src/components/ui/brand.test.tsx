import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OdometerReadout } from './OdometerReadout';
import { StatusBadge } from './StatusBadge';

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('OdometerReadout', () => {
  it('zero-pads into digit cells with only the last digit in orange', () => {
    wrap(<OdometerReadout value={84217} unit="mi" />);
    const cells = [...screen.getByTestId('odometer-cells').children];
    expect(cells.map((c) => c.textContent).join('')).toBe('084217');
    expect(cells.at(-1)?.className).toContain('bg-orange');
    expect(cells.at(-1)?.className).toContain('text-on-orange');
    expect(cells.slice(0, -1).every((c) => c.className.includes('bg-readout'))).toBe(true);
  });

  it('gives screen readers the formatted value, not the cells', () => {
    wrap(<OdometerReadout value={84217} unit="mi" />);
    expect(screen.getByText('84,217 mi')).toHaveClass('sr-only');
    expect(screen.getByTestId('odometer-cells')).toHaveAttribute('aria-hidden', 'true');
  });

  it('grows past the minimum width for big readings', () => {
    wrap(<OdometerReadout value={1234567} unit="km" />);
    expect(screen.getByTestId('odometer-cells').children).toHaveLength(7);
  });
});

describe('StatusBadge', () => {
  it.each([
    ['overdue', 'bg-red-soft', 'text-red'],
    ['due_soon', 'bg-yellow-soft', 'text-yellow'],
    ['upcoming', 'bg-surface-sunken', 'text-ink-muted'],
  ] as const)('%s uses its brand colours and keeps the words', (status, bg, fg) => {
    render(<StatusBadge status={status}>Oil change · 312 mi</StatusBadge>);
    const badge = screen.getByText('Oil change · 312 mi');
    expect(badge).toHaveClass(bg, fg);
  });
});
