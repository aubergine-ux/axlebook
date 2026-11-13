import { z } from 'zod';
import { GaragePrefs } from '../domain/garage';
import { NotifyPrefs } from '../domain/notify';
import { UNIT_SYSTEMS } from '../domain/units';
import { optionalText } from './text';

export const ROLES = ['admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export const THEMES = ['system', 'light', 'dark'] as const;
/** How dates are written: the locale's own way, or a fixed order. */
export const DATE_FORMATS = ['auto', 'mdy', 'dmy', 'ymd'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
const Currency = z.string().regex(/^[A-Z]{3}$/);

export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9._-]+$/);
export const Password = z.string().min(10).max(200);

export const Me = z
  .object({
    id: z.number().int(),
    username: z.string(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    role: z.enum(ROLES),
    unitSystem: z.enum(UNIT_SYSTEMS),
    locale: z.string(),
    theme: z.enum(THEMES),
    garage: GaragePrefs,
    showTips: z.boolean(),
    /** This person's own currency for display; null follows the instance. */
    currency: z.string().nullable(),
    dateFormat: z.enum(DATE_FORMATS),
    notify: NotifyPrefs,
    hasPassword: z.boolean(),
    oidcLinked: z.boolean(),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof Me>;

export const AuthStatus = z.object({
  setupRequired: z.boolean(),
  localLogin: z.boolean(),
  oidc: z.object({ enabled: z.boolean(), label: z.string() }),
  user: Me.nullable(),
});
export type AuthStatus = z.infer<typeof AuthStatus>;

export const LoginInput = z.object({
  username: z.string().trim().toLowerCase().min(1).max(40),
  password: z.string().min(1).max(200),
});
export const SetupInput = z.object({
  username: Username,
  password: Password,
  displayName: optionalText(80),
});

export const MeUpdate = z.object({
  displayName: optionalText(80),
  email: z
    .union([z.email(), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => (v ? v : v === '' ? null : v)),
  unitSystem: z.enum(UNIT_SYSTEMS).optional(),
  locale: z.string().min(2).max(10).optional(),
  theme: z.enum(THEMES).optional(),
  garage: GaragePrefs.optional(),
  showTips: z.boolean().optional(),
  currency: Currency.nullable().optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  notify: NotifyPrefs.partial().optional(),
});
export const PasswordChange = z.object({ current: z.string().max(200).optional(), next: Password });

export const UserAdmin = z
  .object({
    id: z.number().int(),
    username: z.string(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    role: z.enum(ROLES),
    disabled: z.boolean(),
    hasPassword: z.boolean(),
    oidcLinked: z.boolean(),
    createdAt: z.string(),
  })
  .meta({ id: 'User' });
export type UserAdmin = z.infer<typeof UserAdmin>;

export const UserCreate = z.object({
  username: Username,
  password: Password.optional(),
  displayName: optionalText(80),
  email: z
    .union([z.email(), z.literal('')])
    .nullable()
    .optional(),
  role: z.enum(ROLES).default('editor'),
});
export const UserUpdate = z.object({
  displayName: optionalText(80),
  email: z
    .union([z.email(), z.literal('')])
    .nullable()
    .optional(),
  role: z.enum(ROLES).optional(),
  disabled: z.boolean().optional(),
  password: Password.optional(),
});

export const DirectoryUser = z.object({
  id: z.number().int(),
  username: z.string(),
  displayName: z.string().nullable(),
});
export type DirectoryUser = z.infer<typeof DirectoryUser>;

export const ApiToken = z.object({
  id: z.number().int(),
  name: z.string(),
  prefix: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiToken = z.infer<typeof ApiToken>;
export const ApiTokenCreate = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});
export const ApiTokenCreated = ApiToken.extend({ token: z.string() });

export const Share = z.object({
  userId: z.number().int(),
  username: z.string(),
  displayName: z.string().nullable(),
  permission: z.enum(['view', 'edit']),
});
export type Share = z.infer<typeof Share>;
export const ShareInput = z.object({ permission: z.enum(['view', 'edit']) });
