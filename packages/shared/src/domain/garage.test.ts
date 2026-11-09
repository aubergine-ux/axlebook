import { describe, expect, it } from 'vitest';
import { DEFAULT_GARAGE_PREFS, moveInOrder, parseViewPrefs, sortGarage } from './garage';

const v = (
  id: number,
  over: Partial<Parameters<typeof sortGarage>[0][number]> = {},
): Parameters<typeof sortGarage>[0][number] => ({
  id,
  year: 2010,
  make: 'Make',
  model: `M${id}`,
  nickname: null,
  createdAt: `2026-01-0${id}T00:00:00.000Z`,
  currentOdometer: null,
  costToDate: 0,
  nextReminder: null,
  ...over,
});

const ids = (list: { id: number }[]) => list.map((x) => x.id);

describe('parseViewPrefs', () => {
  const defaults = { garage: DEFAULT_GARAGE_PREFS, showTips: true };

  it('falls back to defaults for empty, broken or invalid JSON', () => {
    expect(parseViewPrefs(null)).toEqual(defaults);
    expect(parseViewPrefs('{nope')).toEqual(defaults);
    expect(parseViewPrefs('[1]')).toEqual(defaults);
    expect(parseViewPrefs('{"garage":{"sort":"sideways"},"showTips":"no"}')).toEqual(defaults);
  });

  it('fills gaps and keeps fields in display order without duplicates', () => {
    const p = parseViewPrefs(
      '{"garage":{"layout":"list","fields":["cost","odometer","cost"]},"showTips":false}',
    );
    expect(p).toEqual({
      garage: { ...DEFAULT_GARAGE_PREFS, layout: 'list', fields: ['odometer', 'cost'] },
      showTips: false,
    });
  });
});

describe('sortGarage', () => {
  const list = [
    v(1, { nickname: 'Zed', year: 2015, currentOdometer: 100, costToDate: 5 }),
    v(2, { nickname: 'alpha', year: 2020, costToDate: 50 }),
    v(3, { nickname: 'Mid', year: 2018, currentOdometer: 900, costToDate: 5 }),
  ];

  it('sorts by name, year, odometer, cost and date added', () => {
    expect(ids(sortGarage(list, { sort: 'name', order: [] }))).toEqual([2, 3, 1]);
    expect(ids(sortGarage(list, { sort: 'year', order: [] }))).toEqual([2, 3, 1]);
    expect(ids(sortGarage(list, { sort: 'odometer', order: [] }))).toEqual([3, 1, 2]);
    // Ties keep the incoming order.
    expect(ids(sortGarage(list, { sort: 'cost', order: [] }))).toEqual([2, 1, 3]);
    expect(ids(sortGarage(list, { sort: 'added', order: [] }))).toEqual([3, 2, 1]);
  });

  it('puts the most urgent reminder first', () => {
    const due = [
      v(1),
      v(2, { nextReminder: { status: 'upcoming', dueDate: '2026-02-01' } }),
      v(3, { nextReminder: { status: 'overdue', dueDate: null } }),
      v(4, { nextReminder: { status: 'upcoming', dueDate: '2026-01-15' } }),
    ];
    expect(ids(sortGarage(due, { sort: 'due', order: [] }))).toEqual([3, 4, 2, 1]);
  });

  it('follows a custom order and puts unlisted vehicles last', () => {
    expect(ids(sortGarage(list, { sort: 'custom', order: [3, 1] }))).toEqual([3, 1, 2]);
    expect(ids(sortGarage(list, { sort: 'custom', order: [] }))).toEqual([1, 2, 3]);
  });
});

describe('moveInOrder', () => {
  it('moves an id up or down and ignores moves past either end', () => {
    expect(moveInOrder([1, 2, 3], 3, -1)).toEqual([1, 3, 2]);
    expect(moveInOrder([1, 2, 3], 1, 1)).toEqual([2, 1, 3]);
    expect(moveInOrder([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveInOrder([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
  });
});
