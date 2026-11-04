import type { FuelType, VehicleCategory } from '../schemas/vehicles';
import type { OdometerUnit } from './units';

/**
 * Built-in maintenance schedules by vehicle type. These are typical intervals for normal
 * use, a sensible starting point that works with no AI at all. Owners should check the
 * manual for their exact vehicle (the local AI can tailor these when it's turned on).
 *
 * Distances are in miles and converted for kilometre vehicles; vehicles on an hour meter
 * use `hours` where an item has it.
 */
export interface MaintenanceTemplateItem {
  id: string;
  title: string;
  months?: number;
  miles?: number;
  hours?: number;
  /** Lowercase words that identify a record that did this job. */
  keywords: string[];
  /** Words that, if present, mean a record is NOT this job (e.g. "cabin" for engine air filter). */
  exclude?: string[];
  notes?: string;
  /** Only for these powertrains. */
  only?: ('combustion' | 'diesel' | 'electric')[];
}

const ice: MaintenanceTemplateItem['only'] = ['combustion', 'diesel'];

const CAR: MaintenanceTemplateItem[] = [
  {
    id: 'oil',
    title: 'Oil and filter change',
    miles: 5000,
    months: 6,
    keywords: ['oil'],
    exclude: ['diff', 'gear', 'transmission', 'fork'],
    only: ice,
    notes: 'Many modern synthetics allow 7,500–10,000 mi; follow your oil life monitor or manual.',
  },
  { id: 'rotation', title: 'Tire rotation', miles: 6000, months: 6, keywords: ['rotat'] },
  {
    id: 'brakes',
    title: 'Brake inspection',
    miles: 12000,
    months: 12,
    keywords: ['brake', 'pad', 'rotor'],
    exclude: ['fluid'],
  },
  {
    id: 'engine-air',
    title: 'Engine air filter',
    miles: 15000,
    months: 24,
    keywords: ['air filter', 'engine filter'],
    exclude: ['cabin'],
    only: ice,
  },
  { id: 'cabin-air', title: 'Cabin air filter', miles: 15000, months: 12, keywords: ['cabin'] },
  { id: 'brake-fluid', title: 'Brake fluid flush', months: 36, keywords: ['brake fluid'] },
  { id: 'wipers', title: 'Wiper blades', months: 12, keywords: ['wiper'] },
  { id: 'battery', title: 'Battery test', months: 12, keywords: ['battery'], only: ice },
  {
    id: 'coolant',
    title: 'Coolant replacement',
    miles: 60000,
    months: 60,
    keywords: ['coolant', 'antifreeze'],
  },
  {
    id: 'transmission',
    title: 'Transmission fluid',
    miles: 60000,
    keywords: ['transmission', 'atf', 'cvt fluid'],
    only: ice,
  },
  {
    id: 'differential',
    title: 'Differential and transfer case fluid',
    miles: 30000,
    keywords: ['diff', 'transfer case', 'gear oil'],
    notes: 'Trucks and AWD/4WD vehicles.',
  },
  {
    id: 'belt',
    title: 'Drive belt inspection',
    miles: 60000,
    months: 60,
    keywords: ['belt'],
    only: ice,
  },
  {
    id: 'plugs',
    title: 'Spark plugs',
    miles: 100000,
    keywords: ['spark plug', 'plugs'],
    only: ['combustion'],
  },
  {
    id: 'fuel-filter',
    title: 'Fuel filter',
    miles: 15000,
    months: 12,
    keywords: ['fuel filter'],
    only: ['diesel'],
  },
  {
    id: 'ev-coolant',
    title: 'Battery coolant check',
    months: 48,
    keywords: ['battery coolant', 'coolant'],
    only: ['electric'],
  },
  { id: 'registration', title: 'Registration renewal', months: 12, keywords: ['registration'] },
];

const MOTORCYCLE: MaintenanceTemplateItem[] = [
  {
    id: 'oil',
    title: 'Oil and filter change',
    miles: 4000,
    months: 12,
    hours: 50,
    keywords: ['oil'],
    exclude: ['fork', 'chain'],
  },
  {
    id: 'chain-lube',
    title: 'Chain clean and lube',
    miles: 500,
    months: 1,
    hours: 10,
    keywords: ['chain'],
    exclude: ['adjust', 'slack', 'replace'],
    notes: 'More often in rain or dust.',
  },
  {
    id: 'chain-adjust',
    title: 'Chain slack check and adjust',
    miles: 1000,
    months: 3,
    hours: 20,
    keywords: ['chain adjust', 'slack'],
  },
  { id: 'tires', title: 'Tire inspection', miles: 3000, months: 6, keywords: ['tire', 'tyre'] },
  {
    id: 'brakes',
    title: 'Brake pad inspection',
    miles: 6000,
    months: 12,
    keywords: ['brake', 'pad'],
    exclude: ['fluid'],
  },
  { id: 'brake-fluid', title: 'Brake fluid', months: 24, keywords: ['brake fluid'] },
  { id: 'air', title: 'Air filter', miles: 12000, months: 24, keywords: ['air filter'] },
  { id: 'plugs', title: 'Spark plugs', miles: 8000, months: 24, keywords: ['spark plug', 'plugs'] },
  {
    id: 'coolant',
    title: 'Coolant',
    months: 24,
    keywords: ['coolant'],
    notes: 'Liquid-cooled bikes.',
  },
  { id: 'valves', title: 'Valve clearance check', miles: 15000, keywords: ['valve'] },
  { id: 'fork', title: 'Fork oil', miles: 15000, months: 24, keywords: ['fork'] },
  {
    id: 'storage',
    title: 'Winter storage prep (battery tender, fuel stabilizer)',
    months: 12,
    keywords: ['storage', 'winteriz', 'stabil'],
  },
];

const DIRTBIKE: MaintenanceTemplateItem[] = [
  {
    id: 'air',
    title: 'Clean and oil air filter',
    hours: 2,
    miles: 100,
    months: 1,
    keywords: ['air filter'],
    notes: 'Every ride in dusty conditions.',
  },
  {
    id: 'preride',
    title: 'Pre-ride check (spokes, bolts, tire pressure)',
    hours: 2,
    keywords: ['pre-ride', 'spoke', 'bolt check'],
  },
  {
    id: 'chain',
    title: 'Chain clean and lube',
    hours: 2,
    miles: 100,
    keywords: ['chain'],
    exclude: ['replace'],
  },
  {
    id: 'oil',
    title: 'Engine oil change',
    hours: 10,
    miles: 500,
    months: 6,
    keywords: ['oil'],
    exclude: ['fork', 'chain', 'air filter'],
    notes: 'Four-strokes. Two-strokes: transmission oil every 15–20 hours.',
  },
  { id: 'oil-filter', title: 'Oil filter', hours: 20, keywords: ['oil filter'] },
  { id: 'valves', title: 'Valve clearance check', hours: 15, keywords: ['valve'] },
  { id: 'plug', title: 'Spark plug', hours: 30, keywords: ['spark plug', 'plug'] },
  { id: 'sprockets', title: 'Sprocket and chain wear check', hours: 10, keywords: ['sprocket'] },
  {
    id: 'suspension',
    title: 'Fork and shock service',
    hours: 40,
    months: 12,
    keywords: ['fork', 'shock', 'suspension'],
  },
  {
    id: 'top-end',
    title: 'Top-end rebuild (piston and rings)',
    hours: 100,
    keywords: ['top end', 'top-end', 'piston'],
    notes: 'Roughly half that for race two-strokes.',
  },
  { id: 'brake-fluid', title: 'Brake fluid', months: 12, keywords: ['brake fluid'] },
  { id: 'coolant', title: 'Coolant', months: 12, keywords: ['coolant'] },
];

const ATV: MaintenanceTemplateItem[] = [
  {
    id: 'oil',
    title: 'Engine oil and filter',
    hours: 50,
    miles: 1000,
    months: 6,
    keywords: ['oil'],
    exclude: ['diff', 'gear'],
  },
  {
    id: 'air',
    title: 'Air filter clean',
    hours: 20,
    miles: 500,
    months: 3,
    keywords: ['air filter'],
  },
  { id: 'belt', title: 'CVT drive belt inspection', hours: 50, miles: 1000, keywords: ['belt'] },
  {
    id: 'grease',
    title: 'Grease suspension and driveline',
    hours: 25,
    miles: 500,
    months: 3,
    keywords: ['grease', 'lube'],
  },
  {
    id: 'cv',
    title: 'CV boots and tie rods inspection',
    hours: 25,
    miles: 500,
    keywords: ['cv', 'boot', 'tie rod'],
  },
  {
    id: 'gear-oil',
    title: 'Differential and gear case oil',
    hours: 100,
    miles: 2000,
    months: 12,
    keywords: ['diff', 'gear oil', 'gear case'],
  },
  {
    id: 'plug',
    title: 'Spark plug',
    hours: 100,
    miles: 2000,
    months: 12,
    keywords: ['spark plug', 'plug'],
  },
  { id: 'brake-fluid', title: 'Brake fluid', months: 24, keywords: ['brake fluid'] },
  { id: 'coolant', title: 'Coolant', months: 24, keywords: ['coolant'] },
  {
    id: 'storage',
    title: 'Storage prep (battery tender, fuel stabilizer)',
    months: 12,
    keywords: ['storage', 'winteriz', 'stabil'],
  },
];

const SNOWMOBILE: MaintenanceTemplateItem[] = [
  {
    id: 'preseason',
    title: 'Pre-season inspection',
    months: 12,
    keywords: ['pre-season', 'preseason', 'tune'],
  },
  {
    id: 'belt',
    title: 'Drive belt inspection',
    miles: 500,
    hours: 15,
    months: 12,
    keywords: ['belt'],
    notes: 'Carry a spare.',
  },
  { id: 'track', title: 'Track tension and alignment', miles: 500, hours: 15, keywords: ['track'] },
  { id: 'grease', title: 'Grease suspension', miles: 500, hours: 15, keywords: ['grease', 'lube'] },
  {
    id: 'hyfax',
    title: 'Hyfax (slide) inspection',
    miles: 1000,
    hours: 30,
    keywords: ['hyfax', 'slide'],
  },
  {
    id: 'carbides',
    title: 'Carbides and skis inspection',
    miles: 1000,
    hours: 30,
    keywords: ['carbide', 'ski'],
  },
  {
    id: 'chaincase',
    title: 'Chaincase oil',
    miles: 1000,
    months: 12,
    keywords: ['chaincase', 'chain case'],
  },
  {
    id: 'clutch',
    title: 'Clutch clean and inspection',
    miles: 1500,
    hours: 40,
    keywords: ['clutch'],
  },
  {
    id: 'oil',
    title: 'Engine oil (four-stroke)',
    miles: 2000,
    hours: 50,
    months: 12,
    keywords: ['oil'],
    exclude: ['chaincase', 'chain case', 'injection'],
  },
  { id: 'plugs', title: 'Spark plugs', months: 12, keywords: ['spark plug', 'plug'] },
  { id: 'coolant', title: 'Coolant', months: 24, keywords: ['coolant'] },
  {
    id: 'storage',
    title: 'Summer storage (fogging, fuel stabilizer)',
    months: 12,
    keywords: ['storage', 'fog', 'stabil'],
  },
];

const SEMI: MaintenanceTemplateItem[] = [
  {
    id: 'pm-a',
    title: 'PM-A: oil, filters and chassis lube',
    miles: 25000,
    months: 6,
    keywords: ['pm-a', 'pm a', 'oil'],
    exclude: ['diff', 'transmission'],
    notes: 'Extended-drain programs often run 40,000–50,000 mi.',
  },
  {
    id: 'chassis-lube',
    title: 'Chassis lube',
    miles: 12500,
    months: 3,
    keywords: ['grease', 'chassis lube', 'lube'],
  },
  {
    id: 'brakes',
    title: 'Brake adjustment and inspection',
    miles: 12500,
    months: 3,
    keywords: ['brake', 'slack adjuster'],
  },
  {
    id: 'fifth-wheel',
    title: 'Fifth wheel lube and inspection',
    miles: 10000,
    months: 1,
    keywords: ['fifth wheel', '5th wheel'],
  },
  {
    id: 'tires',
    title: 'Tire tread and pressure check',
    miles: 12500,
    months: 3,
    keywords: ['tire', 'tread'],
  },
  {
    id: 'pm-b',
    title: 'PM-B: fuel filters and air dryer check',
    miles: 50000,
    months: 12,
    keywords: ['pm-b', 'pm b', 'fuel filter'],
  },
  {
    id: 'air-dryer',
    title: 'Air dryer cartridge',
    miles: 100000,
    months: 12,
    keywords: ['air dryer', 'dryer'],
  },
  { id: 'coolant-test', title: 'Coolant test (ELC)', months: 12, keywords: ['coolant'] },
  {
    id: 'pm-c',
    title: 'PM-C: full service',
    miles: 150000,
    months: 24,
    keywords: ['pm-c', 'pm c'],
  },
  { id: 'def-filter', title: 'DEF filter', miles: 200000, months: 24, keywords: ['def'] },
  { id: 'dpf', title: 'DPF cleaning', miles: 250000, months: 24, keywords: ['dpf', 'particulate'] },
  {
    id: 'transmission',
    title: 'Transmission fluid',
    miles: 250000,
    months: 36,
    keywords: ['transmission'],
  },
  { id: 'differential', title: 'Differential oil', miles: 250000, months: 36, keywords: ['diff'] },
  {
    id: 'valves',
    title: 'Overhead (valve) adjustment',
    miles: 500000,
    keywords: ['overhead', 'valve'],
  },
  { id: 'dot', title: 'DOT annual inspection', months: 12, keywords: ['dot', 'annual inspection'] },
  {
    id: '2290',
    title: 'HVUT Form 2290',
    months: 12,
    keywords: ['2290', 'hvut'],
    notes: 'Federal heavy vehicle use tax, due by August 31.',
  },
  { id: 'irp', title: 'IRP registration renewal', months: 12, keywords: ['irp', 'registration'] },
  { id: 'ifta', title: 'IFTA quarterly return', months: 3, keywords: ['ifta'] },
];

const TRAILER: MaintenanceTemplateItem[] = [
  {
    id: 'brakes',
    title: 'Brake adjustment and inspection',
    miles: 12500,
    months: 3,
    keywords: ['brake'],
  },
  {
    id: 'tires',
    title: 'Tire tread and pressure check',
    miles: 12500,
    months: 3,
    keywords: ['tire', 'tread'],
  },
  {
    id: 'air-lines',
    title: 'Air lines and gladhands',
    months: 6,
    keywords: ['air line', 'gladhand'],
  },
  { id: 'landing-gear', title: 'Landing gear lube', months: 6, keywords: ['landing gear'] },
  {
    id: 'kingpin',
    title: 'Kingpin and upper coupler inspection',
    months: 6,
    keywords: ['kingpin', 'king pin', 'coupler'],
  },
  {
    id: 'bearings',
    title: 'Wheel bearings and seals',
    miles: 50000,
    months: 12,
    keywords: ['bearing', 'seal', 'hub'],
  },
  {
    id: 'reefer',
    title: 'Reefer unit service',
    months: 12,
    keywords: ['reefer'],
    notes: 'Roughly every 1,500–2,000 unit hours.',
  },
  { id: 'dot', title: 'DOT annual inspection', months: 12, keywords: ['dot', 'annual inspection'] },
  { id: 'registration', title: 'Registration renewal', months: 12, keywords: ['registration'] },
];

export const MAINTENANCE_TEMPLATES: Record<VehicleCategory, MaintenanceTemplateItem[]> = {
  car: CAR,
  motorcycle: MOTORCYCLE,
  dirtbike: DIRTBIKE,
  atv: ATV,
  snowmobile: SNOWMOBILE,
  semi: SEMI,
  trailer: TRAILER,
};

const powertrain = (f: FuelType): 'combustion' | 'diesel' | 'electric' =>
  f === 'electric' ? 'electric' : f === 'diesel' ? 'diesel' : 'combustion';

/** Round converted kilometre intervals to numbers people actually use. */
function niceKm(miles: number): number {
  const km = miles * 1.609344;
  const step = km >= 50000 ? 5000 : km >= 5000 ? 1000 : km >= 1000 ? 500 : 50;
  return Math.max(step, Math.round(km / step) * step);
}

export interface TemplateInterval {
  id: string;
  title: string;
  intervalMonths: number | null;
  /** In the vehicle's own unit (mi, km or hours). */
  intervalDistance: number | null;
  notes: string | null;
  keywords: string[];
  exclude: string[];
}

/** The built-in schedule for a vehicle, in its own units. */
export function scheduleTemplate(v: {
  category: VehicleCategory;
  odometerUnit: OdometerUnit;
  fuelType: FuelType;
}): TemplateInterval[] {
  const pt = powertrain(v.fuelType);
  return MAINTENANCE_TEMPLATES[v.category]
    .filter((i) => !i.only || i.only.includes(pt))
    .map((i) => {
      const distance =
        v.odometerUnit === 'hr'
          ? (i.hours ?? null)
          : i.miles != null
            ? v.odometerUnit === 'km'
              ? niceKm(i.miles)
              : i.miles
            : null;
      return {
        id: i.id,
        title: i.title,
        intervalMonths: i.months ?? null,
        intervalDistance: distance,
        notes: i.notes ?? null,
        keywords: i.keywords,
        exclude: i.exclude ?? [],
      };
    })
    .filter((i) => i.intervalMonths != null || i.intervalDistance != null);
}

/** Does a record (title + tags) look like it did this job? */
export function recordMatches(
  item: Pick<TemplateInterval, 'keywords' | 'exclude'>,
  text: string,
): boolean {
  const t = text.toLowerCase();
  return item.keywords.some((k) => t.includes(k)) && !item.exclude.some((k) => t.includes(k));
}
