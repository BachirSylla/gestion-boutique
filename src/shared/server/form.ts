// Lecture des champs de formulaire (FormData) côté serveur.
import { normalizePhone } from "@/shared/domain";

export function text(form: FormData, name: string, maxLength = 120): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function optionalText(form: FormData, name: string, maxLength = 120): string | null {
  return text(form, name, maxLength) || null;
}

export function phone(form: FormData, name: string): string | null {
  return normalizePhone(text(form, name, 40));
}

export function uuids(form: FormData, name: string): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(form.getAll(name).filter((v): v is string => typeof v === "string" && uuid.test(v)))];
}

export function uuid(form: FormData, name: string): string | null {
  return uuids(form, name)[0] ?? null;
}
