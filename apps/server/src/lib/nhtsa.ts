import type { FuelType, VehicleCategory, VinDecoded } from '@axlebook/shared';
import { AppError } from './errors';

/** A recall as NHTSA publishes it. */
export interface RecallInfo {
  campaign: string;
  component: string | null;
  summary: string | null;
  consequence: string | null;
  remedy: string | null;
  /** YYYY-MM-DD */
  reportDate: string | null;
}

/** Lookups that leave the server. Only called once an admin has switched them on. */
export interface Lookups {
  decodeVin(vin: string): Promise<VinDecoded>;
  recalls(make: string, model: string, year: number): Promise<RecallInfo[]>;
}

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s === '' || /^not applicable$/i.test(s) ? null : s;
};

/** vPIC shouts makes ("TOYOTA", "MERCEDES-BENZ"); short ones like BMW and GMC really are initials. */
export function tidyMake(make: string): string {
  if (make !== make.toUpperCase() || make.length <= 3) return make;
  return make.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

function fuelTypeOf(
  primary: string | null,
  secondary: string | null,
  electrification: string | null,
) {
  const p = (primary ?? '').toLowerCase();
  const e = (electrification ?? '').toLowerCase();
  let type: FuelType | null = null;
  if (e.includes('phev') || e.includes('plug-in')) type = 'plugin_hybrid';
  else if (e.includes('bev') || p.includes('electric')) type = 'electric';
  else if (e.includes('hev') || e.includes('hybrid')) type = 'hybrid';
  else if (p.includes('flex') || (p.includes('gasoline') && /e85|ethanol/i.test(secondary ?? '')))
    type = 'flex';
  else if (p.includes('diesel')) type = 'diesel';
  else if (p.includes('gasoline')) type = 'gasoline';
  else if (p.includes('cng') || p.includes('natural gas')) type = 'cng';
  else if (p.includes('lpg') || p.includes('propane')) type = 'lpg';
  return type;
}

function categoryOf(vehicleType: string | null, bodyClass: string | null): VehicleCategory | null {
  const t = `${vehicleType ?? ''} ${bodyClass ?? ''}`.toLowerCase();
  if (t.includes('trailer')) return 'trailer';
  if (t.includes('motorcycle'))
    return /off-road|dirt|motocross/.test(t) ? 'dirtbike' : 'motorcycle';
  if (/all terrain|atv|off-road vehicle/.test(t)) return 'atv';
  if (/truck-tractor|truck tractor/.test(t)) return 'semi';
  if (/passenger|multipurpose|truck|bus|car/.test(t)) return 'car';
  return null;
}

/** DD/MM/YYYY (how the recalls API writes dates) → YYYY-MM-DD. */
function isoDate(raw: string | null): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw ?? '');
  if (m) return `${m[3]}-${m[2]?.padStart(2, '0')}-${m[1]?.padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(raw ?? '') ? (raw as string).slice(0, 10) : null;
}

/**
 * NHTSA's public services: vPIC decodes VINs, and the recalls API lists safety recalls by make,
 * model and year. Both are free, need no key, and cover vehicles sold in the United States.
 */
export class NhtsaLookups implements Lookups {
  constructor(
    private readonly urls = {
      vpic: 'https://vpic.nhtsa.dot.gov/api',
      recalls: 'https://api.nhtsa.gov',
    },
    private readonly timeoutMs = 15_000,
  ) {}

  private async get(url: string): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AppError('lookup_failed', { reason: 'unreachable' });
    }
    // The recalls API answers 400 for a make or model it has never heard of.
    if (res.status === 400 || res.status === 404) return {};
    if (!res.ok) throw new AppError('lookup_failed', { reason: 'status', status: res.status });
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      throw new AppError('lookup_failed', { reason: 'not_json' });
    }
  }

  async decodeVin(vin: string): Promise<VinDecoded> {
    const body = await this.get(
      `${this.urls.vpic}/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
    );
    const r = (Array.isArray(body.Results) ? body.Results[0] : null) as Record<
      string,
      unknown
    > | null;
    const make = text(r?.Make);
    if (!r || !make) throw new AppError('not_found', { entity: 'vin' });
    const year = Number(text(r.ModelYear));
    const litres = Number(text(r.DisplacementL));
    const cylinders = text(r.EngineCylinders);
    const engine = [
      Number.isFinite(litres) && litres > 0 ? `${litres.toFixed(1)}L` : null,
      cylinders ? `${cylinders}-cyl` : null,
      text(r.EngineModel),
    ]
      .filter(Boolean)
      .join(' ');
    return {
      vin,
      year: Number.isInteger(year) && year > 1885 ? year : null,
      make: tidyMake(make).slice(0, 60),
      model: text(r.Model)?.slice(0, 60) ?? null,
      trim: (text(r.Trim) ?? text(r.Series))?.slice(0, 60) ?? null,
      engine: engine ? engine.slice(0, 80) : null,
      fuelType: fuelTypeOf(
        text(r.FuelTypePrimary),
        text(r.FuelTypeSecondary),
        text(r.ElectrificationLevel),
      ),
      category: categoryOf(text(r.VehicleType), text(r.BodyClass)),
    };
  }

  async recalls(make: string, model: string, year: number): Promise<RecallInfo[]> {
    const q = new URLSearchParams({ make, model, modelYear: String(year) });
    const body = await this.get(`${this.urls.recalls}/recalls/recallsByVehicle?${q}`);
    const results = Array.isArray(body.results) ? (body.results as Record<string, unknown>[]) : [];
    const out: RecallInfo[] = [];
    for (const r of results) {
      const campaign = text(r.NHTSACampaignNumber);
      if (!campaign || out.some((o) => o.campaign === campaign)) continue;
      out.push({
        campaign: campaign.slice(0, 40),
        component: text(r.Component)?.slice(0, 300) ?? null,
        summary: text(r.Summary)?.slice(0, 4000) ?? null,
        consequence: text(r.Consequence)?.slice(0, 4000) ?? null,
        remedy: text(r.Remedy)?.slice(0, 4000) ?? null,
        reportDate: isoDate(text(r.ReportReceivedDate)),
      });
    }
    return out;
  }
}
