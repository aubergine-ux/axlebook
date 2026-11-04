import { z } from 'zod';
import { UNIT_SYSTEMS } from '../domain/units';
import { ERROR_CODES } from '../errors';

export const IdParam = z.object({ id: z.coerce.number().int().positive() });

/** Calendar date, ISO `YYYY-MM-DD`. */
export const IsoDate = z.iso.date();

export const ApiError = z
  .object({
    error: z.object({
      code: z.enum(ERROR_CODES),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .meta({ id: 'ApiError' });

export const Health = z.object({ status: z.literal('ok'), version: z.string() });

export const PublicConfig = z
  .object({
    version: z.string(),
    currency: z.string(),
    defaultUnitSystem: z.enum(UNIT_SYSTEMS),
    defaultLocale: z.string(),
  })
  .meta({ id: 'PublicConfig' });
export type PublicConfig = z.infer<typeof PublicConfig>;
