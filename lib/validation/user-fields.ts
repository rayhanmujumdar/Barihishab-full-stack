// Field rules shared by user creation, admin edit and self-service edit
// (Auth PRD §4 "Validation"). Client forms reuse the same patterns.
import { z } from "zod";
import { todayIsoInDhaka } from "@/lib/clock";
import { USERNAME_PATTERN } from "@/lib/auth/better-auth";
import { ENABLED_ROLES } from "@/lib/permissions";

export const BD_PHONE_PATTERN = /^(?:01\d{9}|\+8801\d{9})$/;

export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, "3–30 characters: a-z, 0-9, _ or .");

export const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email"));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const phoneField = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => v === "" || BD_PHONE_PATTERN.test(v), "Use 01XXXXXXXXX or +8801XXXXXXXXX")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const birthdayField = z
  .iso.date("Use YYYY-MM-DD")
  .refine((v) => v <= todayIsoInDhaka(), "Birthday can't be in the future")
  .nullable()
  .optional();

export const localeField = z.enum(["bn", "en"]);
export const enabledRoleField = z.enum(ENABLED_ROLES, "Choose Super Admin or Owner");

/** Editable profile fields (no identity, no role). */
export const profileFields = {
  firstName: optionalText(60),
  lastName: optionalText(60),
  surname: optionalText(60),
  birthday: birthdayField,
  profession: optionalText(100),
  phone: phoneField,
  whatsapp: phoneField,
  whatsappSameAsPhone: z.boolean().optional(),
  houseResponsibility: optionalText(100),
  locale: localeField.optional(),
};

export const identityFields = {
  username: usernameField.optional(),
  email: emailField.optional(),
};
