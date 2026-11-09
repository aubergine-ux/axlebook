import { z } from 'zod';

/** How the garage orders vehicles. `custom` follows the person's own order. */
export const GARAGE_SORTS = ['custom', 'name', 'year', 'odometer', 'due', 'cost', 'added'] as const;
export type GarageSort = (typeof GARAGE_SORTS)[number];

export const GARAGE_LAYOUTS = ['cards', 'compact', 'list'] as const;
export type GarageLayout = (typeof GARAGE_LAYOUTS)[number];

/** Figures a garage card can show, in display order. */
export const GARAGE_FIELDS = [
  'odometer',
  'nextReminder',
  'cost',
  'licensePlate',
  'unitNumber',
  'color',
  'category',
] as const;
export type GarageField = (typeof GARAGE_FIELDS)[number];

/** Per-person garage view. No defaults or transforms here: it is used in request bodies and in Me. */
export const GaragePrefs = z.object({
  sort: z.enum(GARAGE_SORTS),
  layout: z.enum(GARAGE_LAYOUTS),
  fields: z.array(z.enum(GARAGE_FIELDS)).max(GARAGE_FIELDS.length),
  /** Vehicle ids in the person's own order. Vehicles missing from it go last. */
  order: z.array(z.number().int().positive()).max(2000),
});
export type GaragePrefs = z.infer<typeof GaragePrefs>;

export const DEFAULT_GARAGE_PREFS: GaragePrefs = {
  sort: 'custom',
  layout: 'cards',
  fields: ['odometer', 'nextReminder', 'cost'],
  order: [],
};

/** Per-person view preferences, stored together as one JSON column. */
export interface ViewPrefs {
  garage: GaragePrefs;
  /** Show the tips card on vehicle pages. */
  showTips: boolean;
}

/** Reads the stored JSON, falling back to the defaults for anything missing or invalid. */
export function parseViewPrefs(raw: string | null | undefined): ViewPrefs {
  let value: { garage?: unknown; showTips?: unknown } = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') value = parsed;
  } catch {
    // Broken JSON: use the defaults.
  }
  return {
    garage: normalizeGaragePrefs(value.garage),
    showTips: typeof value.showTips === 'boolean' ? value.showTips : true,
  };
}

/** Garage preferences with defaults filled in; anything invalid resets to the defaults. */
export function normalizeGaragePrefs(value: unknown): GaragePrefs {
  if (value == null) return { ...DEFAULT_GARAGE_PREFS };
  const parsed = GaragePrefs.partial().safeParse(value);
  if (!parsed.success) return { ...DEFAULT_GARAGE_PREFS };
  return {
    ...DEFAULT_GARAGE_PREFS,
    ...parsed.data,
    // Keep the fixed display order and drop duplicates.
    ...(parsed.data.fields && {
      fields: GARAGE_FIELDS.filter((f) => parsed.data.fields?.includes(f)),
    }),
  };
}

interface Sortable {
  id: number;
  year: number;
  make: string;
  model: string;
  nickname: string | null;
  createdAt: string;
  currentOdometer: number | null;
  costToDate: number;
  nextReminder: { status: 'upcoming' | 'due_soon' | 'overdue'; dueDate: string | null } | null;
}

const STATUS_RANK = { overdue: 0, due_soon: 1, upcoming: 2 } as const;

/**
 * Orders vehicles for the garage. The input order (the server's: newest year, then make)
 * breaks ties, so every sort is stable and predictable.
 */
export function sortGarage<T extends Sortable>(
  vehicles: readonly T[],
  prefs: Pick<GaragePrefs, 'sort' | 'order'>,
): T[] {
  const base = new Map(vehicles.map((v, i) => [v.id, i]));
  const tie = (a: T, b: T) => (base.get(a.id) ?? 0) - (base.get(b.id) ?? 0);
  const name = (v: T) => (v.nickname ?? `${v.year} ${v.make} ${v.model}`).toLocaleLowerCase();
  const cmp: Record<GarageSort, (a: T, b: T) => number> = {
    custom: (a, b) => {
      const pos = new Map(prefs.order.map((id, i) => [id, i]));
      const pa = pos.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const pb = pos.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return pa - pb;
    },
    name: (a, b) => name(a).localeCompare(name(b)),
    year: (a, b) => b.year - a.year,
    // Vehicles with no reading go last.
    odometer: (a, b) => (b.currentOdometer ?? -1) - (a.currentOdometer ?? -1),
    // Most urgent first: overdue, due soon, upcoming, then nothing scheduled.
    due: (a, b) => {
      const ra = a.nextReminder ? STATUS_RANK[a.nextReminder.status] : 3;
      const rb = b.nextReminder ? STATUS_RANK[b.nextReminder.status] : 3;
      if (ra !== rb) return ra - rb;
      const da = a.nextReminder?.dueDate ?? '9999-12-31';
      const db = b.nextReminder?.dueDate ?? '9999-12-31';
      return da.localeCompare(db);
    },
    cost: (a, b) => b.costToDate - a.costToDate,
    added: (a, b) => b.createdAt.localeCompare(a.createdAt),
  };
  const by = cmp[prefs.sort];
  return [...vehicles].sort((a, b) => by(a, b) || tie(a, b));
}

/** Moves one id in a custom order, starting from the order currently on screen. */
export function moveInOrder(ids: readonly number[], id: number, delta: number): number[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
