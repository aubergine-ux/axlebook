import { z } from 'zod';

/** Trimmed optional text; empty string becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const IsoDateString = z.iso.date();
export const Milli = z.number().int().min(0);
export const Odometer = z.number().int().min(0).max(99_999_999);
