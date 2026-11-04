import type { FuelType, VehicleCategory } from '@axlebook/shared';

/**
 * Turn the way people name vehicles in their spreadsheets ("2015 Tacoma", "Wife's CR-V",
 * "'19 Ski-Doo Summit", "Truck 42 - Peterbilt 579") into year/make/model and a category.
 */

interface Make {
  name: string;
  aliases: string[];
  /** Category when no model rule matches. */
  category: VehicleCategory;
  /** Model prefix (lowercase, letters and digits only) → category. */
  models?: [string[], VehicleCategory][];
}

const MAKES: Make[] = [
  // Cars and light trucks
  ...[
    'Acura',
    'Alfa Romeo',
    'Aston Martin',
    'Audi',
    'Bentley',
    'BMW',
    'Buick',
    'Cadillac',
    'Chevrolet',
    'Chrysler',
    'Dodge',
    'Ferrari',
    'Fiat',
    'Fisker',
    'Genesis',
    'GMC',
    'Hummer',
    'Hyundai',
    'Infiniti',
    'Jaguar',
    'Jeep',
    'Kia',
    'Lamborghini',
    'Land Rover',
    'Lexus',
    'Lincoln',
    'Lotus',
    'Lucid',
    'Maserati',
    'Mazda',
    'McLaren',
    'Mercedes-Benz',
    'Mercury',
    'Mini',
    'Mitsubishi',
    'Nissan',
    'Oldsmobile',
    'Peugeot',
    'Plymouth',
    'Polestar',
    'Pontiac',
    'Porsche',
    'Ram',
    'Renault',
    'Rivian',
    'Rolls-Royce',
    'Saab',
    'Saturn',
    'Scion',
    'Seat',
    'Skoda',
    'Smart',
    'Subaru',
    'Tesla',
    'Toyota',
    'Volkswagen',
    'Datsun',
    'Isuzu',
    'Holden',
    'Vauxhall',
    'Opel',
    'Citroen',
    'Dacia',
    'Cupra',
    'BYD',
  ].map((name): Make => ({ name, aliases: [], category: 'car' })),
  // Brands that build several kinds of vehicle
  {
    name: 'Honda',
    aliases: [],
    category: 'car',
    models: [
      [['crf', 'xr', 'cr125', 'cr250', 'cr80', 'cr85'], 'dirtbike'],
      [['trx', 'rancher', 'foreman', 'rubicon', 'pioneer', 'talon', 'recon', 'fourtrax'], 'atv'],
      [
        [
          'cbr',
          'cb',
          'goldwing',
          'rebel',
          'africatwin',
          'grom',
          'shadow',
          'nc7',
          'vfr',
          'st1300',
          'fury',
          'navi',
          'ruckus',
          'pcx',
          'monkey',
          'nt11',
          'xl750',
          'transalp',
        ],
        'motorcycle',
      ],
    ],
  },
  {
    name: 'Yamaha',
    aliases: [],
    category: 'motorcycle',
    models: [
      [['yz', 'wr', 'ttr', 'pw50', 'pw80'], 'dirtbike'],
      [
        ['grizzly', 'kodiak', 'raptor', 'yfz', 'wolverine', 'viking', 'rmax', 'rhino', 'yxz'],
        'atv',
      ],
      [
        [
          'sidewinder',
          'srviper',
          'viper',
          'transporter',
          'apex',
          'vector',
          'phazer',
          'venture',
          'nytro',
        ],
        'snowmobile',
      ],
    ],
  },
  {
    name: 'Kawasaki',
    aliases: [],
    category: 'motorcycle',
    models: [
      [['kx', 'klx'], 'dirtbike'],
      [['bruteforce', 'teryx', 'mule', 'kfx', 'prairie'], 'atv'],
    ],
  },
  {
    name: 'Suzuki',
    aliases: [],
    category: 'car',
    models: [
      [['rmz', 'rm125', 'rm250', 'rm85', 'drz', 'rmx'], 'dirtbike'],
      [['kingquad', 'lt', 'ozark', 'quadsport', 'eiger', 'vinson'], 'atv'],
      [
        [
          'gsx',
          'hayabusa',
          'sv650',
          'vstrom',
          'boulevard',
          'dr650',
          'bandit',
          'katana',
          'intruder',
          'burgman',
        ],
        'motorcycle',
      ],
    ],
  },
  {
    name: 'KTM',
    aliases: [],
    category: 'dirtbike',
    models: [
      [
        ['duke', 'adventure', 'rc', 'supermoto', 'smc', 'superduke', '390', '790', '890', '1290'],
        'motorcycle',
      ],
    ],
  },
  {
    name: 'Husqvarna',
    aliases: [],
    category: 'dirtbike',
    models: [[['vitpilen', 'svartpilen', 'norden'], 'motorcycle']],
  },
  {
    name: 'Polaris',
    aliases: [],
    category: 'atv',
    models: [
      [
        [
          'rmk',
          'indy',
          'switchback',
          'pro',
          'titan',
          'voyageur',
          'matryx',
          'axys',
          'khaos',
          'assault',
          'patriot',
        ],
        'snowmobile',
      ],
      [['slingshot'], 'car'],
    ],
  },
  {
    name: 'Can-Am',
    aliases: ['canam', 'can am'],
    category: 'atv',
    models: [[['spyder', 'ryker', 'canyon'], 'motorcycle']],
  },
  {
    name: 'Arctic Cat',
    aliases: ['arcticcat', 'arctic-cat'],
    category: 'snowmobile',
    models: [[['alterra', 'prowler', 'wildcat', 'havoc', 'tracker', 'xc450', 'trv'], 'atv']],
  },
  {
    name: 'Volvo',
    aliases: [],
    category: 'car',
    models: [[['vnl', 'vnr', 'vhd', 'vah', 'fh', 'fm'], 'semi']],
  },
  {
    name: 'Ford',
    aliases: [],
    category: 'car',
    models: [[['f650', 'f750', 'l9000', 'louisville', 'aeromax'], 'semi']],
  },
  // Motorcycles
  ...[
    ['Harley-Davidson', ['harley', 'hd', 'harleydavidson']],
    ['Ducati', []],
    ['Triumph', []],
    ['Indian', []],
    ['Aprilia', []],
    ['Royal Enfield', ['royalenfield', 'enfield']],
    ['Moto Guzzi', ['motoguzzi', 'guzzi']],
    ['MV Agusta', ['mvagusta']],
    ['Zero', ['zero motorcycles']],
    ['Buell', []],
    ['Vespa', []],
    ['Piaggio', []],
    ['Victory', []],
    ['Benelli', []],
    ['LiveWire', []],
  ].map(
    ([name, aliases]): Make => ({
      name: name as string,
      aliases: aliases as string[],
      category: 'motorcycle',
    }),
  ),
  // Dirt bikes
  ...[
    ['GasGas', ['gas gas']],
    ['Beta', []],
    ['Sherco', []],
    ['TM Racing', ['tm']],
    ['Kayo', []],
    ['SSR', []],
    ['Stark', ['stark future']],
    ['Sur-Ron', ['surron', 'sur ron']],
  ].map(
    ([name, aliases]): Make => ({
      name: name as string,
      aliases: aliases as string[],
      category: 'dirtbike',
    }),
  ),
  // ATVs and side-by-sides
  ...[
    ['CFMoto', ['cf moto']],
    ['Segway', ['segway powersports']],
    ['Hisun', []],
    ['Kubota', []],
    ['John Deere', ['johndeere', 'deere']],
    ['Textron', []],
    ['Massimo', []],
  ].map(
    ([name, aliases]): Make => ({
      name: name as string,
      aliases: aliases as string[],
      category: 'atv',
    }),
  ),
  // Snowmobiles
  ...[
    ['Ski-Doo', ['skidoo', 'ski doo']],
    ['Lynx', []],
  ].map(
    ([name, aliases]): Make => ({
      name: name as string,
      aliases: aliases as string[],
      category: 'snowmobile',
    }),
  ),
  // Semi trucks
  ...[
    ['Freightliner', ['fl']],
    ['Peterbilt', ['pete']],
    ['Kenworth', ['kw']],
    ['Mack', []],
    ['International', ['navistar', 'intl']],
    ['Western Star', ['westernstar']],
    ['Sterling', []],
    ['Hino', []],
    ['Autocar', []],
    ['Scania', []],
    ['MAN', []],
    ['DAF', []],
    ['Iveco', []],
    ['Nikola', []],
  ].map(
    ([name, aliases]): Make => ({
      name: name as string,
      aliases: aliases as string[],
      category: 'semi',
    }),
  ),
  // Trailers
  ...[
    ['Great Dane', ['greatdane']],
    ['Wabash', []],
    ['Utility', ['utility trailer']],
    ['Stoughton', []],
    ['Hyundai Translead', ['translead']],
    ['Fontaine', []],
    ['Vanguard', []],
    ['Wilson', []],
    ['Big Tex', ['bigtex']],
    ['Featherlite', []],
    ['Airstream', []],
  ].map(
    ([name, aliases]): Make => ({
      name: name as string,
      aliases: aliases as string[],
      category: 'trailer',
    }),
  ),
];

// Common short forms for car makes.
const CAR_ALIASES: Record<string, string> = {
  chevy: 'Chevrolet',
  vw: 'Volkswagen',
  merc: 'Mercedes-Benz',
  mercedes: 'Mercedes-Benz',
  benz: 'Mercedes-Benz',
  landrover: 'Land Rover',
  rangerover: 'Land Rover',
  alfa: 'Alfa Romeo',
  dodgeram: 'Ram',
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Model names people often write without the make. */
const MODEL_ONLY: Record<string, [string, VehicleCategory]> = {
  tacoma: ['Toyota', 'car'],
  tundra: ['Toyota', 'car'],
  camry: ['Toyota', 'car'],
  corolla: ['Toyota', 'car'],
  rav4: ['Toyota', 'car'],
  prius: ['Toyota', 'car'],
  highlander: ['Toyota', 'car'],
  '4runner': ['Toyota', 'car'],
  sienna: ['Toyota', 'car'],
  civic: ['Honda', 'car'],
  accord: ['Honda', 'car'],
  crv: ['Honda', 'car'],
  pilot: ['Honda', 'car'],
  odyssey: ['Honda', 'car'],
  fit: ['Honda', 'car'],
  hrv: ['Honda', 'car'],
  f150: ['Ford', 'car'],
  f250: ['Ford', 'car'],
  f350: ['Ford', 'car'],
  mustang: ['Ford', 'car'],
  explorer: ['Ford', 'car'],
  escape: ['Ford', 'car'],
  ranger: ['Ford', 'car'],
  bronco: ['Ford', 'car'],
  maverick: ['Ford', 'car'],
  focus: ['Ford', 'car'],
  fusion: ['Ford', 'car'],
  silverado: ['Chevrolet', 'car'],
  tahoe: ['Chevrolet', 'car'],
  suburban: ['Chevrolet', 'car'],
  camaro: ['Chevrolet', 'car'],
  corvette: ['Chevrolet', 'car'],
  malibu: ['Chevrolet', 'car'],
  equinox: ['Chevrolet', 'car'],
  colorado: ['Chevrolet', 'car'],
  sierra: ['GMC', 'car'],
  yukon: ['GMC', 'car'],
  wrangler: ['Jeep', 'car'],
  cherokee: ['Jeep', 'car'],
  grandcherokee: ['Jeep', 'car'],
  gladiator: ['Jeep', 'car'],
  outback: ['Subaru', 'car'],
  forester: ['Subaru', 'car'],
  impreza: ['Subaru', 'car'],
  wrx: ['Subaru', 'car'],
  crosstrek: ['Subaru', 'car'],
  miata: ['Mazda', 'car'],
  mx5: ['Mazda', 'car'],
  cx5: ['Mazda', 'car'],
  altima: ['Nissan', 'car'],
  sentra: ['Nissan', 'car'],
  frontier: ['Nissan', 'car'],
  rogue: ['Nissan', 'car'],
  leaf: ['Nissan', 'car'],
  golf: ['Volkswagen', 'car'],
  jetta: ['Volkswagen', 'car'],
  passat: ['Volkswagen', 'car'],
  model3: ['Tesla', 'car'],
  modely: ['Tesla', 'car'],
  models: ['Tesla', 'car'],
  modelx: ['Tesla', 'car'],
  cybertruck: ['Tesla', 'car'],
  elantra: ['Hyundai', 'car'],
  sonata: ['Hyundai', 'car'],
  tucson: ['Hyundai', 'car'],
  santafe: ['Hyundai', 'car'],
  ioniq5: ['Hyundai', 'car'],
  soul: ['Kia', 'car'],
  sorento: ['Kia', 'car'],
  telluride: ['Kia', 'car'],
  sportage: ['Kia', 'car'],
  optima: ['Kia', 'car'],
  ev6: ['Kia', 'car'],
  bolt: ['Chevrolet', 'car'],
  volt: ['Chevrolet', 'car'],
  cascadia: ['Freightliner', 'semi'],
  w900: ['Kenworth', 'semi'],
  t680: ['Kenworth', 'semi'],
  t880: ['Kenworth', 'semi'],
  '579': ['Peterbilt', 'semi'],
  '389': ['Peterbilt', 'semi'],
  '567': ['Peterbilt', 'semi'],
  anthem: ['Mack', 'semi'],
  pinnacle: ['Mack', 'semi'],
  granite: ['Mack', 'semi'],
  lt625: ['International', 'semi'],
  lonestar: ['International', 'semi'],
  prostar: ['International', 'semi'],
  vnl: ['Volvo', 'semi'],
  vnl860: ['Volvo', 'semi'],
  sportster: ['Harley-Davidson', 'motorcycle'],
  softail: ['Harley-Davidson', 'motorcycle'],
  roadking: ['Harley-Davidson', 'motorcycle'],
  streetglide: ['Harley-Davidson', 'motorcycle'],
  roadglide: ['Harley-Davidson', 'motorcycle'],
  fatboy: ['Harley-Davidson', 'motorcycle'],
  ninja: ['Kawasaki', 'motorcycle'],
  hayabusa: ['Suzuki', 'motorcycle'],
  goldwing: ['Honda', 'motorcycle'],
  grom: ['Honda', 'motorcycle'],
  rebel: ['Honda', 'motorcycle'],
  africatwin: ['Honda', 'motorcycle'],
  crf250: ['Honda', 'dirtbike'],
  crf450: ['Honda', 'dirtbike'],
  yz250: ['Yamaha', 'dirtbike'],
  yz450: ['Yamaha', 'dirtbike'],
  kx250: ['Kawasaki', 'dirtbike'],
  drz400: ['Suzuki', 'dirtbike'],
  rzr: ['Polaris', 'atv'],
  sportsman: ['Polaris', 'atv'],
  general: ['Polaris', 'atv'],
  grizzly: ['Yamaha', 'atv'],
  raptor: ['Yamaha', 'atv'],
  rancher: ['Honda', 'atv'],
  foreman: ['Honda', 'atv'],
  maverickx3: ['Can-Am', 'atv'],
  outlander: ['Can-Am', 'atv'],
  defender: ['Can-Am', 'atv'],
  summit: ['Ski-Doo', 'snowmobile'],
  renegade: ['Ski-Doo', 'snowmobile'],
  mxz: ['Ski-Doo', 'snowmobile'],
  backcountry: ['Ski-Doo', 'snowmobile'],
  expedition: ['Ski-Doo', 'snowmobile'],
  freeride: ['Ski-Doo', 'snowmobile'],
  rmk: ['Polaris', 'snowmobile'],
  indy: ['Polaris', 'snowmobile'],
  switchback: ['Polaris', 'snowmobile'],
  sidewinder: ['Yamaha', 'snowmobile'],
  riot: ['Arctic Cat', 'snowmobile'],
  catalyst: ['Arctic Cat', 'snowmobile'],
};

/** Words in the name that say what kind of vehicle it is, whatever the make. */
const KIND_WORDS: [RegExp, VehicleCategory][] = [
  [/\b(dirt ?bike|mx ?bike|enduro|pit ?bike|motocross)\b/i, 'dirtbike'],
  [/\b(atv|utv|quad|side[- ]?by[- ]?side|sxs|four[- ]?wheeler)\b/i, 'atv'],
  [/\b(sled|snowmobile|snow machine|skidoo)\b/i, 'snowmobile'],
  [/\b(motorcycle|motorbike|moto|scooter|bike|harley|chopper|cruiser)\b/i, 'motorcycle'],
  [/\b(trailer|reefer|flatbed|dry ?van|tanker|lowboy|hopper)\b/i, 'trailer'],
  [
    /\b(semi|tractor|big ?rig|18[- ]?wheeler|rig|class ?8|truck ?#?\s?\d+|unit ?#?\s?\d+)\b/i,
    'semi',
  ],
];

export interface ParsedVehicle {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  nickname: string | null;
  category: VehicleCategory;
  fuelType: FuelType | null;
}

function categoryFor(make: Make, modelText: string): VehicleCategory {
  const m = squash(modelText);
  for (const [prefixes, cat] of make.models ?? [])
    if (prefixes.some((p) => m.startsWith(p))) return cat;
  return make.category;
}

function findMake(words: string[]): { make: Make; index: number; length: number } | null {
  for (let i = 0; i < words.length; i++) {
    for (const len of [3, 2, 1]) {
      if (i + len > words.length) continue;
      const phrase = words.slice(i, i + len).join(' ');
      const sq = squash(phrase);
      if (!sq) continue;
      const alias = CAR_ALIASES[sq];
      const make = alias
        ? MAKES.find((m) => m.name === alias)
        : MAKES.find(
            (m) =>
              squash(m.name) === sq ||
              // Short aliases (HD, KW, FL, TM) only count in upper case, so "fl" in prose doesn't.
              m.aliases.some(
                (a) => squash(a) === sq && (sq.length > 2 || phrase === phrase.toUpperCase()),
              ),
          );
      if (make) return { make, index: i, length: len };
    }
  }
  return null;
}

const currentYear = () => new Date().getFullYear();

function parseYear(word: string): number | null {
  const four = /^(19[0-9]{2}|20[0-9]{2})$/.exec(word);
  if (four) {
    const y = Number(four[1]);
    return y >= 1886 && y <= currentYear() + 2 ? y : null;
  }
  const two = /^[''`’](\d{2})$/.exec(word);
  if (two) {
    const n = Number(two[1]);
    return n <= (currentYear() + 2) % 100 ? 2000 + n : 1900 + n;
  }
  return null;
}

/** Best-effort parse of a free-text vehicle name. Never throws; unknown parts come back null. */
export function parseVehicleText(text: string): ParsedVehicle {
  const raw = text.trim().replace(/\s+/g, ' ');
  const out: ParsedVehicle = {
    year: null,
    make: null,
    model: null,
    trim: null,
    nickname: null,
    category: 'car',
    fuelType: null,
  };
  if (!raw) return out;
  // "Truck 42 - Peterbilt 579", "Daily (2018 Civic)": a label plus a description.
  const paren = /^(.*?)\s*\((.+)\)\s*$/.exec(raw);
  const dash = /^(.+?)\s+[-–—:|]\s+(.+)$/.exec(raw);
  let body = raw;
  let label: string | null = null;
  if (paren) {
    const [, outside = '', inside = ''] = paren;
    const insideIsVehicle = findMake(inside.split(' ')) || /\b(19|20)\d{2}\b/.test(inside);
    [body, label] = insideIsVehicle
      ? [inside, outside || null]
      : [outside || inside, outside ? inside : null];
  } else if (dash) {
    const [, l = '', r = ''] = dash;
    const left = findMake(l.split(' '));
    const right = findMake(r.split(' '));
    if (right && !left) [label, body] = [l, r];
    else if (left && !right) [body, label] = [l, r];
  }

  const words = body.split(' ').filter((w) => w !== '');
  const rest: string[] = [];
  for (const w of words) {
    const y = out.year == null ? parseYear(w) : null;
    if (y != null) out.year = y;
    else rest.push(w);
  }
  if (/\b(diesel|tdi|duramax|cummins|power ?stroke)\b/i.test(raw)) out.fuelType = 'diesel';
  else if (
    /\b(ev|electric|e-tron|etron|lightning|ioniq ?5|ioniq ?6|mach-?e|bolt|leaf|model [3sxy]|cybertruck|rivian|polestar|lucid|zero)\b/i.test(
      raw,
    )
  )
    out.fuelType = 'electric';
  else if (/\b(plug-?in|phev|prime)\b/i.test(raw)) out.fuelType = 'plugin_hybrid';
  else if (/\bhybrid\b/i.test(raw)) out.fuelType = 'hybrid';

  const hit = findMake(rest);
  if (hit) {
    out.make = hit.make.name;
    const after = rest.slice(hit.index + hit.length);
    const before = rest.slice(0, hit.index);
    const [first, second] = after;
    if (first) {
      out.model = first;
      // Two-word models ("Grand Cherokee", "Model 3", "Road Glide", "Santa Fe").
      if (second && /^(grand|model|road|street|santa|range|gold|africa|f|t|w|e)$/i.test(first)) {
        out.model = `${first} ${second}`;
        out.trim = after.slice(2).join(' ') || null;
      } else {
        out.trim = after.slice(1).join(' ') || null;
      }
    }
    out.category = categoryFor(hit.make, after.join(''));
    const nick = [label, before.join(' ')]
      .filter(Boolean)
      .join(' ')
      .replace(/[’']s$/i, '')
      .trim();
    out.nickname = nick || null;
  } else {
    // No make: maybe a well-known model on its own ("2015 Tacoma", "Summit 850").
    const idx = idxModelOnly(rest);
    if (idx >= 0) {
      const one = squash(rest[idx] ?? '');
      const two = squash(`${rest[idx] ?? ''}${rest[idx + 1] ?? ''}`);
      const width = MODEL_ONLY[one] ? 1 : 2;
      const [make, cat] = MODEL_ONLY[width === 1 ? one : two] ?? ['', 'car'];
      out.make = make;
      out.model = rest.slice(idx, idx + width).join(' ');
      out.trim = rest.slice(idx + width).join(' ') || null;
      out.category = cat;
      const nick = [label, rest.slice(0, idx).join(' ')]
        .filter(Boolean)
        .join(' ')
        .replace(/[’']s$/i, '')
        .trim();
      out.nickname = nick || null;
    } else {
      // A nickname only ("Old Blue", "Wife's car"). Keep the whole thing as the nickname.
      out.nickname = raw;
    }
  }
  for (const [re, cat] of KIND_WORDS) {
    if (re.test(raw)) {
      // A kind word only overrides the default; a known make/model already decided.
      if (!hit && idxModelOnly(rest) < 0) out.category = cat;
      break;
    }
  }
  if (out.category === 'semi' && !out.fuelType) out.fuelType = 'diesel';
  if (out.nickname && out.make && squash(out.nickname) === squash(`${out.make}${out.model ?? ''}`))
    out.nickname = null;
  return out;
}

function idxModelOnly(words: string[]) {
  return words.findIndex(
    (w, i) => MODEL_ONLY[squash(w)] || MODEL_ONLY[squash(`${w}${words[i + 1] ?? ''}`)],
  );
}
