import {
  type ColumnMap,
  type FuelUnit,
  type OdometerUnit,
  type RecordKind,
  type SheetPlan,
  SPREADSHEET_FIELDS,
  type SpreadsheetField,
  type SpreadsheetPlan,
  type VehiclePlan,
} from '@axlebook/shared';
import { parseVehicleText } from './vehicle-text';
import { detectHeaderRow, headersOf, type Sheet } from './workbook';

export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

type Target = SpreadsheetField | 'vehicle' | 'kind';

/**
 * Header spellings, squashed. `exact` must equal the header; `contains` may appear anywhere.
 * Order matters: earlier fields claim a header first ("price per gallon" is a price, not a volume).
 */
const MATCHERS: [Target, { exact: string[]; contains: string[]; not?: RegExp }][] = [
  [
    'vehicle',
    {
      exact: [
        'vehicle',
        'car',
        'truck',
        'bike',
        'auto',
        'automobile',
        'unit',
        'unitnumber',
        'unitno',
        'vin',
        'vehiclename',
        'whichcar',
        'machine',
        'sled',
        'rig',
        'ride',
        'tractor',
        'trailer',
        'equipment',
        'asset',
        'fleetnumber',
        'truckno',
        'trucknumber',
        'carname',
      ],
      contains: ['vehicle'],
    },
  ],
  [
    'kind',
    {
      exact: ['kind', 'type', 'recordtype', 'entrytype', 'entry', 'logtype', 'servicetype2'],
      contains: ['recordtype', 'entrytype'],
    },
  ],
  [
    'pricePerUnit',
    {
      exact: [
        'priceperunit',
        'unitprice',
        'ppg',
        'ppl',
        'pricegal',
        'pricel',
        'priceliter',
        'pricelitre',
        'pricepergallon',
        'priceperliter',
        'priceperlitre',
        'pricekwh',
        'rate',
        'gasprice',
        'fuelprice',
        'pumpprice',
      ],
      contains: ['priceper', 'pergal', 'perlit', 'perkwh', 'unitprice'],
    },
  ],
  [
    'fuelVolume',
    {
      exact: [
        'gallons',
        'gal',
        'gals',
        'liters',
        'litres',
        'l',
        'ltr',
        'ltrs',
        'volume',
        'fuelvolume',
        'fuelconsumed',
        'fuelamount',
        'qty',
        'quantity',
        'kwh',
        'energy',
        'kwhadded',
        'fuel',
        'fuelgal',
        'fuelgallons',
        'fuelliters',
        'fuellitres',
        'amountfilled',
        'filled',
      ],
      contains: ['gallon', 'litre', 'liter', 'kwh', 'volume'],
    },
  ],
  [
    'date',
    {
      exact: [
        'date',
        'day',
        'when',
        'servicedate',
        'filldate',
        'fillupdate',
        'datefilled',
        'dateofservice',
        'datetime',
        'timestamp',
      ],
      contains: ['date'],
    },
  ],
  [
    'odometer',
    {
      exact: [
        'odometer',
        'odo',
        'mileage',
        'miles',
        'mi',
        'km',
        'kms',
        'kilometers',
        'kilometres',
        'reading',
        'odometerreading',
        'hours',
        'hrs',
        'enginehours',
        'hourmeter',
        'hobbs',
        'meter',
        'totalmiles',
        'currentmiles',
        'odometermi',
        'odometerkm',
      ],
      contains: ['odometer', 'mileage', 'enginehour', 'hourmeter'],
      not: /trip|driven|since|distance|per|avg|average|mpg|economy/,
    },
  ],
  [
    'cost',
    {
      exact: [
        'cost',
        'total',
        'totalcost',
        'amount',
        'price',
        'paid',
        'spent',
        'totalprice',
        'charge',
        'charges',
        'totalpaid',
        'amountpaid',
        'expense',
        'usd',
        'eur',
        'gbp',
        'cad',
        'aud',
        'bill',
        'invoice',
        'sum',
        'costusd',
      ],
      contains: ['cost', 'total', 'amount', 'paid', 'price'],
      not: /per(mile|km|mi|gal|l)|mpg|average|avg/,
    },
  ],
  [
    'title',
    {
      exact: [
        'title',
        'description',
        'desc',
        'service',
        'item',
        'items',
        'work',
        'workdone',
        'job',
        'task',
        'maintenance',
        'what',
        'details',
        'servicedone',
        'repair',
        'servicetype',
        'summary',
        'whatwasdone',
        'whatidid',
        'whatdone',
        'performed',
        'workperformed',
        'action',
      ],
      contains: ['description', 'service', 'work', 'task', 'job', 'repair', 'maint', 'what'],
    },
  ],
  [
    'notes',
    {
      exact: ['notes', 'note', 'comments', 'comment', 'remarks', 'memo', 'info', 'additionalinfo'],
      contains: ['note', 'comment', 'remark'],
    },
  ],
  ['tags', { exact: ['tags', 'tag', 'labels', 'label'], contains: [] }],
  [
    'isFull',
    {
      exact: ['full', 'fulltank', 'isfull', 'filltofull', 'isfilltofull', 'tankfull', 'topped'],
      contains: ['full'],
    },
  ],
  [
    'missedPrevious',
    {
      exact: ['missed', 'missedprevious', 'missedfuelup', 'missedfill', 'skipped'],
      contains: ['missed'],
    },
  ],
  [
    'station',
    {
      exact: [
        'station',
        'gasstation',
        'location',
        'where',
        'place',
        'stop',
        'truckstop',
        'fuelstation',
        'brand',
      ],
      contains: ['station'],
    },
  ],
  [
    'grade',
    {
      exact: ['grade', 'octane', 'fuelgrade', 'fueltype', 'ron', 'gastype'],
      contains: ['octane', 'grade'],
    },
  ],
  [
    'expenseCategory',
    { exact: ['category', 'expensecategory', 'expensetype', 'cat'], contains: ['category'] },
  ],
];

/** Columns that are worked out from other columns; never imported as notes. */
const COMPUTED =
  /mpg|l100|kml|kmpl|economy|trip|driven|distance|average|avg|percent|permile|perkm|days|^id$|^no$|^#$|^row|running|cumulative|ytd|balance/;

/** Words that describe the kind of log rather than the vehicle ("Tacoma Fuel Log" → "Tacoma"). */
const GENERIC =
  /^(sheet\d*|data|log|logs|logbook|book|fuel|gas|fillups?|fill|ups|mpg|service|services|servicing|maintenance|maint|repairs?|expenses?|costs?|records?|history|upgrades?|mods?|modifications?|all|main|tracker|tracking|vehicle|vehicles|car|cars|my|the|and|of|export|import|copy|final|new|old|v\d+|\d{4}-\d{2}-\d{2}|table\d*|list|entries|spreadsheet|workbook|untitled|master|sheet|tab)$/i;

const KIND_WORDS: [RegExp, RecordKind][] = [
  [/fuel|gas|petrol|diesel|fill|mpg|charg|kwh|refuel|top ?up/i, 'fuel'],
  [/repair|fix|broke|replace|recall/i, 'repair'],
  [/upgrade|mod\b|mods|modification|accessor|install|aftermarket/i, 'upgrade'],
  [
    /expense|tax|insur|regist|licen|tag renewal|parking|toll|loan|payment|fee|fine|ticket|wash|permit|ifta|2290|irp|dmv/i,
    'expense',
  ],
  [
    /service|maint|oil|tire|tyre|rotat|inspect|brake|filter|fluid|tune|belt|coolant|battery|wiper|alignment|pm-?[abc]?\b/i,
    'service',
  ],
];

/** The record kind a free-text value suggests ("Gas" → fuel, "Insurance" → expense), or null. */
export function kindOf(value: string): RecordKind | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (['service', 'repair', 'upgrade', 'fuel', 'expense'].includes(v)) return v as RecordKind;
  for (const [re, kind] of KIND_WORDS) if (re.test(v)) return kind;
  return null;
}

/** Map headers to fields. Each header is used once; each field takes the first good header. */
export function matchColumns(headers: string[]): Partial<Record<Target, string>> {
  const out: Partial<Record<Target, string>> = {};
  const used = new Set<string>();
  const sq = headers.map((h) => ({ h, s: squash(h), raw: h.toLowerCase() }));
  for (const pass of ['exact', 'contains'] as const) {
    for (const [field, m] of MATCHERS) {
      if (out[field]) continue;
      const hit = sq.find(({ h, s, raw }) => {
        if (used.has(h) || !s) return false;
        if (m.not?.test(s)) return false;
        if (pass === 'exact') return m.exact.includes(s);
        // "$/gal", "€/L", "Cost / kWh": a money column per unit is a price per unit.
        if (field === 'pricePerUnit' && /\/\s*(gal|l|ltr|litre|liter|kwh)\b/.test(raw)) return true;
        return m.contains.some((c) => s.includes(c));
      });
      if (hit) {
        out[field] = hit.h;
        used.add(hit.h);
      }
    }
  }
  return out;
}

const DMY_HINT = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/;

/** "dmy" if some date only makes sense day-first, "mdy" if month-first, else the fallback. */
export function detectDateOrder(values: string[], fallback: 'mdy' | 'dmy'): 'mdy' | 'dmy' {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = DMY_HINT.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    else if (Number(m[2]) > 12) mdy++;
  }
  if (dmy > mdy) return 'dmy';
  if (mdy > dmy) return 'mdy';
  return fallback;
}

export function odometerUnitFrom(header: string | null | undefined): OdometerUnit | null {
  if (!header) return null;
  const h = header.toLowerCase();
  if (/\b(hours?|hrs?|hobbs|hour ?meter)\b/.test(h) || /enginehour|hourmeter/.test(squash(h)))
    return 'hr';
  if (/\b(km|kms|kilomet(er|re)s?)\b/.test(h)) return 'km';
  if (/\b(mi|miles?|mileage)\b/.test(h)) return 'mi';
  return null;
}

export function fuelUnitFrom(...headers: (string | null | undefined)[]): FuelUnit | null {
  for (const header of headers) {
    if (!header) continue;
    const h = header.toLowerCase();
    if (/kwh/.test(h)) return 'kwh';
    if (/imp(erial)?\.? ?gal|uk ?gal/.test(h)) return 'gal_uk';
    if (/\b(l|ltrs?|lit(er|re)s?)\b|\/\s*l\b/.test(h)) return 'l';
    if (/gal/.test(h)) return 'gal_us';
  }
  return null;
}

/** Strip log-type words from a sheet or file name; what's left (if anything) names a vehicle. */
export function vehicleWordsIn(name: string): string | null {
  // Hyphens join names ("Ski-Doo", "CR-V") unless they separate log words ("civic-fuel-log").
  const words = name
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .split(/[\s_–—.()[\]]+/)
    .flatMap((w) =>
      w.includes('-') && w.split('-').some((p) => GENERIC.test(p)) ? w.split('-') : [w],
    )
    .filter((w) => w !== '' && w !== '-' && !GENERIC.test(w));
  return words.length ? words.join(' ') : null;
}

function sheetKindFromName(name: string): RecordKind | null {
  return kindOf(name.replace(/log|records?|history|sheet/gi, ''));
}

export interface ExistingVehicle {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  nickname: string | null;
  unitNumber: string | null;
  vin: string | null;
  category: VehiclePlan['category'];
  odometerUnit: OdometerUnit;
  fuelUnit: FuelUnit;
  fuelType: VehiclePlan['fuelType'];
}

/** An existing vehicle this key clearly refers to, if exactly one fits. */
export function matchExisting(key: string, vehicles: ExistingVehicle[]): ExistingVehicle | null {
  const k = squash(key);
  if (!k) return null;
  const p = parseVehicleText(key);
  const hits = vehicles.filter((v) => {
    if (v.nickname && squash(v.nickname) === k) return true;
    if (v.vin && key.toUpperCase().includes(v.vin.toUpperCase())) return true;
    if (
      v.unitNumber &&
      /\d/.test(v.unitNumber) &&
      new RegExp(`(^|\\D)${v.unitNumber.replace(/\D/g, '')}(\\D|$)`).test(key)
    )
      return true;
    if (p.model && squash(p.model) === squash(v.model)) {
      // Two different trims ("EX" vs "Si") are two different cars; "EX" vs "EX-L" may be one.
      const a = squash(p.trim ?? '');
      const b = squash(v.trim ?? '');
      const trimsDiffer = a !== '' && b !== '' && !a.startsWith(b) && !b.startsWith(a);
      return !trimsDiffer && (!p.year || p.year === v.year) && (!p.make || p.make === v.make);
    }
    return squash(`${v.year}${v.make}${v.model}`) === k || squash(`${v.make}${v.model}`) === k;
  });
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

export interface PlanOptions {
  fileName: string;
  existing: ExistingVehicle[];
  defaultUnits: { odometerUnit: OdometerUnit; fuelUnit: FuelUnit; dateOrder: 'mdy' | 'dmy' };
}

function emptyColumns(): ColumnMap {
  return Object.fromEntries(SPREADSHEET_FIELDS.map((f) => [f, null])) as ColumnMap;
}

const colIndex = (headers: string[], name: string | null) =>
  name == null ? -1 : headers.indexOf(name);

/** Data rows (after the header) for a sheet plan. */
export function bodyRows(sheet: Sheet, plan: Pick<SheetPlan, 'headerRow'>) {
  return sheet.rows.slice(plan.headerRow + 1);
}

/** The vehicle key each row belongs to, carrying a blank vehicle cell down from the row above. */
export function rowKeys(sheet: Sheet, plan: SheetPlan, fileName: string): string[] {
  const headers = headersOf(sheet.rows, plan.headerRow);
  const vi = colIndex(headers, plan.vehicleColumn);
  const fallback = plan.vehicleKey ?? sheetFallbackKey(sheet.name, fileName);
  let last = '';
  return bodyRows(sheet, plan).map((r) => {
    if (vi < 0) return fallback;
    const v = (r[vi] ?? '').trim();
    if (v) last = v;
    return last || fallback;
  });
}

export function sheetFallbackKey(sheetName: string, fileName: string): string {
  return vehicleWordsIn(sheetName) ?? vehicleWordsIn(fileName) ?? 'Vehicle';
}

/** Distinct vehicle keys across the included sheets, first spelling wins. */
export function vehicleKeys(sheets: Sheet[], plans: SheetPlan[], fileName: string): string[] {
  const seen = new Map<string, string>();
  for (const plan of plans) {
    if (!plan.include) continue;
    const sheet = sheets.find((s) => s.name === plan.sheet);
    if (!sheet) continue;
    for (const k of rowKeys(sheet, plan, fileName))
      if (!seen.has(squash(k))) seen.set(squash(k), k);
  }
  return [...seen.values()].slice(0, 100);
}

/** A starting plan for one sheet, worked out from its headers and values. */
export function planSheet(sheet: Sheet, opts: PlanOptions): SheetPlan {
  const headerRow = detectHeaderRow(sheet.rows);
  const headers = headersOf(sheet.rows, headerRow);
  const body = sheet.rows.slice(headerRow + 1);
  const m = matchColumns(headers);
  const values = (h: string | undefined) => {
    const i = h == null ? -1 : headers.indexOf(h);
    return i < 0 ? [] : body.map((r) => (r[i] ?? '').trim()).filter((v) => v !== '');
  };

  // A "Category"/"Type" column holding Fuel/Service/Repair is the kind column, not expense category.
  if (!m.kind && m.expenseCategory) {
    const vals = values(m.expenseCategory);
    const kinds = vals.filter((v) => kindOf(v) && kindOf(v) !== 'expense').length;
    if (vals.length && kinds / vals.length >= 0.5) {
      m.kind = m.expenseCategory;
      delete m.expenseCategory;
    }
  }
  // A kind column must hold few distinct values; otherwise it's probably a description.
  if (m.kind) {
    const distinct = new Set(values(m.kind).map((v) => v.toLowerCase()));
    if (distinct.size > 25) {
      if (!m.title) m.title = m.kind;
      delete m.kind;
    }
  }
  // A vehicle column with a single value is just a label for the whole sheet; fine either way.
  const columns = emptyColumns();
  for (const f of SPREADSHEET_FIELDS) columns[f] = m[f] ?? null;

  const kindValues = m.kind
    ? [...new Map(values(m.kind).map((v) => [v.toLowerCase(), v])).values()]
        .slice(0, 40)
        .map((v) => ({
          value: v,
          kind: kindOf(v) ?? 'service',
        }))
    : [];

  let defaultKind: RecordKind = sheetKindFromName(sheet.name) ?? 'service';
  if (!sheetKindFromName(sheet.name) && columns.fuelVolume && !columns.title) defaultKind = 'fuel';

  const mapped = new Set(Object.values(m).filter(Boolean));
  const extraNoteColumns = headers
    .filter((h) => !mapped.has(h) && !COMPUTED.test(squash(h)) && !/^column \d+$/i.test(h))
    .filter((h) => values(h).length > 0)
    .slice(0, 8);

  const hasDates = columns.date != null && values(columns.date).length > 0;
  return {
    sheet: sheet.name,
    include:
      hasDates &&
      !/^(summary|chart|charts|dashboard|stats|statistics|totals?|lookup|lists?|settings|instructions|readme|notes|about|info)$/i.test(
        sheet.name.trim(),
      ),
    headerRow,
    vehicleColumn: m.vehicle ?? null,
    vehicleKey: null,
    kindColumn: m.kind ?? null,
    kindValues,
    defaultKind,
    columns,
    extraNoteColumns,
    dateOrder: detectDateOrder(values(columns.date ?? undefined), opts.defaultUnits.dateOrder),
  };
}

/** Vehicle details for a key: an existing vehicle if one matches, otherwise parsed from the text. */
export function planVehicle(
  key: string,
  sheets: Sheet[],
  plans: SheetPlan[],
  opts: PlanOptions,
): VehiclePlan {
  const singleExisting = opts.existing.length === 1 && key === 'Vehicle' ? opts.existing[0] : null;
  const existing = matchExisting(key, opts.existing) ?? singleExisting ?? null;
  if (existing) {
    return {
      key,
      existingVehicleId: existing.id,
      category: existing.category,
      year: existing.year,
      make: existing.make,
      model: existing.model,
      trim: existing.trim,
      nickname: existing.nickname,
      odometerUnit: existing.odometerUnit,
      fuelUnit: existing.fuelUnit,
      fuelType: existing.fuelType,
    };
  }
  const p = parseVehicleText(key);
  // Units come from the headers of the sheets this vehicle appears in.
  let odometerUnit: OdometerUnit | null = null;
  let fuelUnit: FuelUnit | null = null;
  for (const plan of plans) {
    if (!plan.include) continue;
    const sheet = sheets.find((s) => s.name === plan.sheet);
    if (!sheet || !rowKeys(sheet, plan, opts.fileName).some((k) => squash(k) === squash(key)))
      continue;
    odometerUnit ??= odometerUnitFrom(plan.columns.odometer);
    fuelUnit ??= fuelUnitFrom(
      plan.columns.fuelVolume,
      plan.columns.pricePerUnit,
      plan.columns.cost,
    );
  }
  if (p.fuelType === 'electric') fuelUnit ??= 'kwh';
  if (fuelUnit === 'kwh' && !p.fuelType) p.fuelType = 'electric';
  odometerUnit ??= fuelUnit === 'l' ? 'km' : opts.defaultUnits.odometerUnit;
  fuelUnit ??= odometerUnit === 'km' ? 'l' : opts.defaultUnits.fuelUnit;
  return {
    key,
    existingVehicleId: null,
    category: p.category,
    year: p.year,
    make: p.make,
    model: p.model,
    trim: p.trim,
    nickname: p.nickname,
    odometerUnit,
    fuelUnit,
    fuelType: p.fuelType ?? (fuelUnit === 'kwh' ? 'electric' : 'gasoline'),
  };
}

/** The whole plan, without any AI: header matching, value sniffing and vehicle-name parsing. */
export function matchPlan(sheets: Sheet[], opts: PlanOptions): SpreadsheetPlan {
  const plans = sheets.map((s) => planSheet(s, opts));
  return { sheets: plans, vehicles: completeVehicles(sheets, plans, [], opts) };
}

/**
 * One vehicle entry per key the sheet plans produce: entries already given (by the AI or the
 * user) are kept, missing ones are worked out.
 */
export function completeVehicles(
  sheets: Sheet[],
  plans: SheetPlan[],
  given: VehiclePlan[],
  opts: PlanOptions,
): VehiclePlan[] {
  const byKey = new Map(given.map((v) => [squash(v.key), v]));
  return vehicleKeys(sheets, plans, opts.fileName).map((key) => {
    const g = byKey.get(squash(key));
    return g ? { ...g, key } : planVehicle(key, sheets, plans, opts);
  });
}
