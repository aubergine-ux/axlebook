import { addDays, addMonths, type RecordInput, today } from '@axlebook/shared';
import type { DB } from '../db/connection';
import type { User } from '../db/schema';
import { hashPassword } from '../lib/crypto';
import { getSetting, setSetting } from '../lib/settings';
import { nowIso } from '../lib/time';
import type { RecordService } from '../modules/records/service';

/** Small deterministic PRNG so every demo instance looks the same. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const between = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();
const milli = (n: number) => Math.round(n * 1000);

interface Profile {
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim: string;
    color: string;
    vin: string;
    license_plate: string;
    purchase_date: string;
    purchase_price: number;
    notes: string;
  };
  startOdo: number;
  milesPerDay: [number, number];
  mpg: [number, number];
  fill: [number, number];
  seed: number;
  /** Next registration due date, relative to today. */
  registrationDue: (today: string) => string;
  registrationCost: number;
  services: {
    everyMonths: number;
    title: string;
    cost: [number, number];
    tags: string[];
    notes?: string;
  }[];
  oneOffs: {
    monthsAgo: number;
    kind: 'repair' | 'upgrade' | 'service';
    title: string;
    cost: number;
    tags: string[];
    notes: string;
  }[];
}

const TACOMA: Profile = {
  vehicle: {
    year: 2015,
    make: 'Toyota',
    model: 'Tacoma',
    trim: 'SR5 Double Cab',
    color: 'Silver Sky',
    vin: '3TMLU4EN5FM172204',
    license_plate: '8XKL204',
    purchase_date: '2019-06-14',
    purchase_price: milli(24_500),
    notes:
      'Bought from the original owner with full dealer records. Timing chain, so no belt service.',
  },
  startOdo: 58_420,
  milesPerDay: [22, 38],
  mpg: [17.6, 20.8],
  fill: [13.5, 18.2],
  seed: 2015,
  registrationDue: (t) => addMonths(t, 8),
  registrationCost: 248,
  services: [
    {
      everyMonths: 5,
      title: 'Oil and filter change',
      cost: [58, 72],
      tags: ['oil', 'maintenance'],
      notes: 'Mobil 1 0W-20, Toyota filter 04152-YZZA6.',
    },
    { everyMonths: 10, title: 'Tire rotation and balance', cost: [25, 35], tags: ['tires'] },
    {
      everyMonths: 15,
      title: 'Engine and cabin air filters',
      cost: [42, 55],
      tags: ['filters', 'maintenance'],
    },
  ],
  oneOffs: [
    {
      monthsAgo: 26,
      kind: 'service',
      title: 'Front brake pads and rotors',
      cost: 412.9,
      tags: ['brakes'],
      notes: 'Rotors were under minimum thickness. Akebono pads.',
    },
    {
      monthsAgo: 19,
      kind: 'upgrade',
      title: 'Bilstein 5100 shocks, all four',
      cost: 689.0,
      tags: ['suspension', 'upgrade'],
      notes: 'Front set at the second notch for a small lift.',
    },
    {
      monthsAgo: 11,
      kind: 'repair',
      title: 'Rear leaf spring shackle and bushings',
      cost: 286.4,
      tags: ['suspension', 'repair'],
      notes: 'Clunk over bumps traced to a worn driver-side shackle.',
    },
    {
      monthsAgo: 4,
      kind: 'service',
      title: 'Differential and transfer case fluid',
      cost: 164.0,
      tags: ['fluids', 'maintenance'],
      notes: '75W-85 front, 75W-85 transfer case, 75W-90 rear.',
    },
  ],
};

const CIVIC: Profile = {
  vehicle: {
    year: 2018,
    make: 'Honda',
    model: 'Civic',
    trim: 'EX',
    color: 'Aegean Blue',
    vin: '19XFC2F79JE018842',
    license_plate: '7RMD318',
    purchase_date: '2021-03-02',
    purchase_price: milli(18_900),
    notes: 'Daily commuter. 1.5T CVT.',
  },
  startOdo: 36_150,
  milesPerDay: [26, 34],
  mpg: [31.2, 36.4],
  fill: [8.6, 10.9],
  seed: 2018,
  registrationDue: (t) => addDays(t, 58),
  registrationCost: 186,
  services: [
    {
      everyMonths: 7,
      title: 'Oil and filter change',
      cost: [49, 62],
      tags: ['oil', 'maintenance'],
      notes: '0W-20 full synthetic, Honda filter 15400-PLM-A02.',
    },
    { everyMonths: 7, title: 'Tire rotation', cost: [20, 28], tags: ['tires'] },
    { everyMonths: 24, title: 'Brake fluid flush', cost: [95, 110], tags: ['brakes', 'fluids'] },
  ],
  oneOffs: [
    {
      monthsAgo: 21,
      kind: 'service',
      title: 'CVT fluid change',
      cost: 139.5,
      tags: ['fluids', 'maintenance'],
      notes: 'Honda HCF-2.',
    },
    {
      monthsAgo: 9,
      kind: 'repair',
      title: 'AC condenser replacement',
      cost: 742.8,
      tags: ['ac', 'repair'],
      notes: 'Rock strike leak, a known weak spot on this generation. Recharged with R-1234yf.',
    },
    {
      monthsAgo: 2,
      kind: 'service',
      title: 'New tires: Michelin CrossClimate 2',
      cost: 768.0,
      tags: ['tires'],
      notes: '215/50R17, mounted and balanced.',
    },
  ],
};

async function seedVehicle(db: DB, records: RecordService, owner: User, p: Profile, end: string) {
  const r = rng(p.seed);
  const ts = nowIso();
  const v = await db
    .insertInto('vehicles')
    .values({
      ...p.vehicle,
      owner_id: owner.id,
      odometer_unit: 'mi',
      fuel_unit: 'gal_us',
      fuel_type: 'gasoline',
      created_at: ts,
      updated_at: ts,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const start = addMonths(end, -30);
  // Odometer as a function of date: steady daily mileage with some noise.
  const odoAt: Map<string, number> = new Map();
  let odo = p.startOdo;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    odo += between(r, p.milesPerDay[0], p.milesPerDay[1]);
    odoAt.set(d, Math.round(odo));
  }
  const odometerOn = (d: string) => odoAt.get(d) ?? Math.round(odo);
  const create = (input: RecordInput) => records.create(owner, v.id, input);

  // Fuel: fill when ~300–380 mi have passed; one partial fill and one missed fill-up.
  let lastFillOdo = p.startOdo;
  let n = 0;
  for (let d = addDays(start, 2); d <= end; d = addDays(d, 1)) {
    const now = odometerOn(d);
    if (now - lastFillOdo < between(r, 280, 380)) continue;
    n++;
    const mpg = between(r, p.mpg[0], p.mpg[1]);
    const partial = n === 23;
    const missed = n === 41;
    const gallons = partial
      ? 6.2
      : Math.min(p.fill[1], Math.max(p.fill[0], (now - lastFillOdo) / mpg));
    const price = between(r, 3.19, 3.89);
    await create({
      kind: 'fuel',
      date: d,
      odometer: now,
      cost: 0,
      tags: [],
      fuel: {
        volume: milli(Math.round(gallons * 1000) / 1000),
        pricePerUnit: milli(Math.round(price * 1000) / 1000),
        isFull: !partial,
        missedPrevious: missed,
        grade: 'Regular 87',
        station: ['Costco', 'Shell', 'Chevron', 'Arco'][Math.floor(r() * 4)] ?? 'Costco',
      },
      notes: partial
        ? 'Topped off before a road trip; not a full tank.'
        : missed
          ? 'Forgot to log the last fill-up.'
          : null,
    });
    lastFillOdo = now;
  }

  // Recurring services.
  for (const s of p.services) {
    for (let m = 1; m <= 30; m += s.everyMonths) {
      const d = addMonths(start, m);
      if (d > end) break;
      await create({
        kind: 'service',
        date: d,
        odometer: odometerOn(d),
        title: s.title,
        cost: milli(Math.round(between(r, s.cost[0], s.cost[1]) * 100) / 100),
        tags: s.tags,
        notes: s.notes ?? null,
      });
    }
  }
  for (const o of p.oneOffs) {
    const d = addMonths(end, -o.monthsAgo);
    await create({
      kind: o.kind,
      date: d,
      odometer: odometerOn(d),
      title: o.title,
      cost: milli(o.cost),
      tags: o.tags,
      notes: o.notes,
    });
  }

  // Running costs. Registration renews yearly on the profile's anniversary.
  for (let y = 1; y <= 3; y++) {
    const reg = addMonths(p.registrationDue(end), -12 * y);
    if (reg <= end && reg >= start) {
      await create({
        kind: 'expense',
        expenseCategory: 'registration',
        date: reg,
        title: 'Registration renewal',
        cost: milli(p.registrationCost),
        tags: ['dmv'],
      });
    }
  }
  for (let m = 0; m < 30; m += 6) {
    const d = addMonths(start, m);
    await create({
      kind: 'expense',
      expenseCategory: 'insurance',
      date: d,
      title: 'Insurance, six months',
      cost: milli(p === TACOMA ? 512 : 448),
      tags: ['insurance'],
    });
  }
  return { vehicle: v, odometerOn, end };
}

/**
 * Seeds a 2015 Toyota Tacoma and a 2018 Honda Civic with 2½ years of history, one
 * overdue reminder (Tacoma oil change) and one upcoming (Civic registration).
 * Runs once per instance (SEED_DEMO_DATA=true).
 */
export async function seedDemo(
  db: DB,
  records: RecordService,
  opts: { timeZone?: string; password?: string },
): Promise<{ seeded: boolean; createdUser: { username: string; password: string } | null }> {
  if (await getSetting(db, 'demo_seeded', false)) return { seeded: false, createdUser: null };
  let owner = await db
    .selectFrom('users')
    .selectAll()
    .where('role', '=', 'admin')
    .orderBy('id')
    .executeTakeFirst();
  let created: { username: string; password: string } | null = null;
  if (!owner) {
    const ts = nowIso();
    const password = opts.password ?? 'axlebook-demo';
    owner = await db
      .insertInto('users')
      .values({
        username: 'demo',
        display_name: 'Demo',
        role: 'admin',
        password_hash: await hashPassword(password),
        theme: 'system',
        disabled: 0,
        created_at: ts,
        updated_at: ts,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    created = { username: 'demo', password };
  }
  const end = today(opts.timeZone);
  const ts = nowIso();

  const taco = await seedVehicle(db, records, owner, TACOMA, end);
  const civic = await seedVehicle(db, records, owner, CIVIC, end);

  // Overdue: Tacoma oil change, last done ~6 months and ~6,000 mi ago.
  const lastOil = await db
    .selectFrom('records')
    .select(['date', 'odometer'])
    .where('vehicle_id', '=', taco.vehicle.id)
    .where('title', '=', 'Oil and filter change')
    .orderBy('date', 'desc')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('reminders')
    .values({
      vehicle_id: taco.vehicle.id,
      title: 'Oil and filter change',
      notes: 'Mobil 1 0W-20, 6.2 qt with filter.',
      due_mode: 'either',
      due_date: addMonths(lastOil.date, 6),
      due_odometer: (lastOil.odometer ?? 0) + 5000,
      interval_months: 6,
      interval_distance: 5000,
      soon_days: 30,
      soon_distance: 500,
      created_at: ts,
      updated_at: ts,
    })
    .execute();
  // Make sure it's genuinely overdue today (312 mi past due), whatever the generated mileage.
  const tacoOdo = taco.odometerOn(end);
  await db
    .updateTable('reminders')
    .set({ due_odometer: Math.min((lastOil.odometer ?? 0) + 5000, tacoOdo - 312) })
    .where('vehicle_id', '=', taco.vehicle.id)
    .execute();

  // Upcoming: Civic registration in about two months.
  await db
    .insertInto('reminders')
    .values({
      vehicle_id: civic.vehicle.id,
      title: 'Registration renewal',
      notes: 'Smog check required this year.',
      due_mode: 'date',
      due_date: CIVIC.registrationDue(end),
      interval_months: 12,
      soon_days: 30,
      soon_distance: 500,
      created_at: ts,
      updated_at: ts,
    })
    .execute();

  // A few parts on the shelf and jobs in the planner.
  const parts = [
    {
      name: 'Mobil 1 0W-20 (quart)',
      part_number: '124315',
      manufacturer: 'Mobil',
      quantity: milli(5),
      unit_cost: milli(8.97),
      location: 'Garage shelf B',
      vehicle_id: null,
    },
    {
      name: 'Oil filter',
      part_number: '04152-YZZA6',
      manufacturer: 'Toyota',
      quantity: milli(2),
      unit_cost: milli(7.49),
      location: 'Garage shelf B',
      vehicle_id: taco.vehicle.id,
    },
    {
      name: 'Oil filter',
      part_number: '15400-PLM-A02',
      manufacturer: 'Honda',
      quantity: milli(1),
      unit_cost: milli(6.85),
      location: 'Garage shelf B',
      vehicle_id: civic.vehicle.id,
    },
    {
      name: 'Wiper blades, 26" / 16"',
      part_number: 'ICON 26OE/16OE',
      manufacturer: 'Bosch',
      quantity: milli(1),
      unit_cost: milli(41.0),
      location: 'Cabinet',
      vehicle_id: taco.vehicle.id,
    },
  ];
  for (const p of parts)
    await db
      .insertInto('parts')
      .values({ ...p, owner_id: owner.id, notes: null, created_at: ts, updated_at: ts })
      .execute();
  await db
    .insertInto('plan_items')
    .values([
      {
        vehicle_id: taco.vehicle.id,
        title: 'Replace rear brake shoes',
        description: 'Squeal at low speed; shoes looked thin at the last rotation.',
        kind: 'service',
        priority: 'high',
        status: 'planned',
        estimated_cost: milli(180),
        target_date: addDays(end, 21),
        created_at: ts,
        updated_at: ts,
      },
      {
        vehicle_id: civic.vehicle.id,
        title: 'Spark plugs',
        description: 'Due around 100k mi.',
        kind: 'service',
        priority: 'low',
        status: 'backlog',
        estimated_cost: milli(120),
        target_date: null,
        created_at: ts,
        updated_at: ts,
      },
    ])
    .execute();

  // The truck doubles as a work vehicle: engine, parts sheet, what it's worth, and a trip log.
  await db
    .updateTable('vehicles')
    .set({
      engine: '4.0L V6',
      usage: 'business',
      current_value: milli(19_500),
      specs: JSON.stringify({
        oilType: '5W-30 full synthetic',
        oilCapacity: '5.5 qt with filter',
        tireSize: '265/70R16',
        tirePressure: '30 psi front and rear',
        wiperDriver: '22 in',
        wiperPassenger: '20 in',
        battery: 'Group 24F',
        other: [{ label: 'Lug nuts', value: '83 lb-ft' }],
      }),
    })
    .where('id', '=', taco.vehicle.id)
    .execute();
  await db
    .updateTable('vehicles')
    .set({ engine: '1.5L turbo', current_value: milli(14_800) })
    .where('id', '=', civic.vehicle.id)
    .execute();
  const latest = Number(
    (
      await db
        .selectFrom('odometer_readings')
        .select((eb) => eb.fn.max('odometer').as('odo'))
        .where('vehicle_id', '=', taco.vehicle.id)
        .executeTakeFirst()
    )?.odo ?? tacoOdo,
  );
  await db
    .insertInto('trips')
    .values(
      [
        { back: 16, miles: 84, purpose: 'Site visit', from: 'Shop', to: 'Maple Street job' },
        { back: 9, miles: 132, purpose: 'Lumber run', from: 'Shop', to: 'Mill, Cedar Falls' },
        { back: 3, miles: 58, purpose: 'Site visit', from: 'Shop', to: 'Maple Street job' },
      ].map((trip) => {
        // Counted back from the latest reading at the truck's usual 30 miles a day, so the log
        // never runs ahead of the odometer.
        const finish = latest - trip.back * 30;
        return {
          vehicle_id: taco.vehicle.id,
          date: addDays(end, -trip.back),
          start_odometer: finish - trip.miles,
          end_odometer: finish,
          purpose: trip.purpose,
          from_place: trip.from,
          to_place: trip.to,
          business: 1,
          notes: null,
          created_by: owner.id,
          created_at: ts,
          updated_at: ts,
        };
      }),
    )
    .execute();
  await db
    .insertInto('vehicle_documents')
    .values(
      [
        { v: taco, type: 'insurance' as const, title: 'Insurance', number: 'PL-4471-2209', in: 19 },
        { v: taco, type: 'registration' as const, title: 'Registration', number: null, in: 210 },
        {
          v: civic,
          type: 'insurance' as const,
          title: 'Insurance',
          number: 'PL-4471-2210',
          in: 140,
        },
      ].map((d) => ({
        vehicle_id: d.v.vehicle.id,
        type: d.type,
        title: d.title,
        number: d.number,
        expires_on: addDays(end, d.in),
        notes: null,
        storage_key: null,
        original_name: null,
        mime_type: null,
        size_bytes: null,
        last_notified_status: null,
        created_at: ts,
        updated_at: ts,
      })),
    )
    .execute();

  await setSetting(db, 'demo_seeded', true);
  return { seeded: true, createdUser: created };
}
