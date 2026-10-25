"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { formatAmount, formatQuantity, parseQuantity, type RoundingStep } from "@/shared/domain";
import type { ActionState } from "@/shared/server/action-state";
import { AmountInput, Button, ChoiceGroup, Notice, SubmitButton, TextField } from "@/shared/ui";
import { SALE_UNITS, defaultPolicy, formatPriceFromRetail, proposeFormatPrices, type PriceFormat, type PricePolicy, type ProductUnit } from "../domain/catalog";

type Action = (previous: ActionState, form: FormData) => Promise<ActionState>;

interface FormatDraft {
  key: string;
  label: string;
  quantity: string;
  price: string;
}

const toDraft = (f: PriceFormat): FormatDraft => ({ key: crypto.randomUUID(), label: f.label, quantity: formatQuantity(f.quantityMilli), price: String(f.price) });

function useFeedback(state: ActionState) {
  const te = useTranslations("errors");
  return {
    formError: state.status === "error" && !state.fields ? te(state.error) : null,
    field: (name: string) => {
      const code = state.status === "error" ? state.fields?.[name] : undefined;
      return code ? te(code) : null;
    },
  };
}

/** Formats favoris (½ kg, 1 kg, ½ L…) à prix propre : libellé, quantité, prix. */
function FormatsEditor({ formats, onChange, unit, error }: { formats: FormatDraft[]; onChange: (formats: FormatDraft[]) => void; unit: string; error?: string | null }) {
  const t = useTranslations("catalog");
  const update = (key: string, patch: Partial<FormatDraft>) => onChange(formats.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold text-encre">{t("formats.title")}</legend>
      <p className="text-sm text-gris-texte">{t("formats.hint")}</p>
      {formats.map((format, index) => (
        <div key={format.key} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-bouton bg-fond p-2">
          <TextField label={t("formats.label")} name="formatLabel" value={format.label} onChange={(e) => update(format.key, { label: e.target.value })} />
          <TextField
            label={t("formats.quantity", { unit })}
            name="formatQuantity"
            inputMode="decimal"
            value={format.quantity}
            onChange={(e) => update(format.key, { quantity: e.target.value })}
          />
          <TextField label={t("formats.price")} name="formatPrice" inputMode="numeric" value={format.price} onChange={(e) => update(format.key, { price: e.target.value.replace(/\D/g, "") })} />
          <button
            type="button"
            onClick={() => onChange(formats.filter((f) => f.key !== format.key))}
            aria-label={t("formats.remove", { index: index + 1 })}
            className="mb-1 flex size-11 items-center justify-center rounded-xl text-brique hover:bg-brique-doux"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...formats, { key: crypto.randomUUID(), label: "", quantity: "", price: "" }])}>
        {t("formats.add")}
      </Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </fieldset>
  );
}

/** Nouveau produit avec sa première grille de prix. */
export function ProductCreateForm({ action, roundingStep }: { action: Action; roundingStep: RoundingStep }) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const { formError, field } = useFeedback(state);
  const [id] = useState(() => crypto.randomUUID());
  const [unit, setUnit] = useState<ProductUnit>("kg");
  const [retail, setRetail] = useState<number | null>(null);
  const [formats, setFormats] = useState<FormatDraft[]>([]);
  const unitLabel = t(`units.${unit}`);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="productId" value={id} />
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <TextField label={t("fields.name")} name="name" required autoComplete="off" error={field("name")} />
      <TextField label={`${t("fields.category")} (${tc("optional")})`} name="category" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("fields.packageLabel")} name="packageLabel" defaultValue={t("defaultPackage")} />
        <label className="flex flex-col">
          <span className="mb-1.5 text-sm font-semibold text-encre">{t("fields.saleUnit")}</span>
          <select name="saleUnit" value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)} className="h-13 rounded-bouton border border-bordure-champ bg-surface px-3 text-base">
            {SALE_UNITS.map((u) => (
              <option key={u} value={u}>
                {t(`units.${u}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <TextField label={t("fields.capacity", { unit: unitLabel })} name="capacity" inputMode="decimal" required error={field("capacity")} />
        <p className="mt-1 text-sm text-gris-texte">{t("fields.capacityHint")}</p>
      </div>
      <AmountInput label={t("fields.retailPrice", { unit: unitLabel })} name="retailPrice" size="md" onValueChange={setRetail} error={field("retailPrice")} />
      <AmountInput label={`${t("fields.packagePrice")} (${tc("optional")})`} name="packagePrice" size="md" error={field("packagePrice")} />
      <FormatsEditor
        formats={formats}
        unit={unitLabel}
        onChange={(next) =>
          setFormats(
            next.map((f) => {
              // Format nouvellement saisi : prix proposé depuis le prix de détail.
              const q = parseQuantity(f.quantity);
              return !f.price && q && retail ? { ...f, price: String(formatPriceFromRetail(q, retail, roundingStep)) } : f;
            }),
          )
        }
        error={field("formats")}
      />
      <TextField label={t("fields.reorderThreshold")} name="reorderThreshold" inputMode="numeric" defaultValue="1" />
      <SubmitButton variant="primary" block pendingLabel={tc("saving")}>
        {t("create")}
      </SubmitButton>
    </form>
  );
}

/**
 * Changement de prix (RG4) : toute la grille (détail, conditionnement, formats) ; prix des formats
 * recalculés et ajustables ; politique proposée selon la boutique (hausse / baisse), modifiable.
 */
export function PriceChangeForm({
  action,
  productId,
  current,
  unitLabel,
  roundingStep,
  policies,
  hasOpenedPackage = false,
}: {
  action: Action;
  productId: string;
  hasOpenedPackage?: boolean;
  current: { retailPrice: number; packagePrice: number | null; formats: PriceFormat[] };
  unitLabel: string;
  roundingStep: RoundingStep;
  policies: { hike: PricePolicy; drop: PricePolicy };
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const { formError, field } = useFeedback(state);
  const [retail, setRetail] = useState<number | null>(current.retailPrice);
  const [formats, setFormats] = useState<FormatDraft[]>(current.formats.map(toDraft));
  const [policy, setPolicy] = useState<PricePolicy | null>(null);
  const effectivePolicy = policy ?? defaultPolicy(current.retailPrice, retail ?? current.retailPrice, policies);
  const direction = retail && retail > current.retailPrice ? "hike" : retail && retail < current.retailPrice ? "drop" : "same";

  return (
    <form action={formAction} className="flex flex-col gap-5" key={state.status === "success" ? "done" : "form"}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="mode" value={effectivePolicy} />
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      {state.status === "success" ? <Notice tone="positive">{t("priceChanged")}</Notice> : null}
      <AmountInput
        label={t("fields.retailPrice", { unit: unitLabel })}
        name="retailPrice"
        size="md"
        defaultValue={current.retailPrice}
        onValueChange={(value) => {
          setRetail(value);
          if (value && value !== current.retailPrice) setFormats(proposeFormatPrices(current.formats, current.retailPrice, value, roundingStep).map(toDraft));
        }}
        error={field("retailPrice")}
      />
      <AmountInput label={`${t("fields.packagePrice")} (${tc("optional")})`} name="packagePrice" size="md" defaultValue={current.packagePrice} error={field("packagePrice")} />
      <FormatsEditor formats={formats} onChange={setFormats} unit={unitLabel} error={field("formats")} />
      {direction !== "same" ? <p className="text-sm text-gris-texte">{t(`direction.${direction}`, { old: formatAmount(current.retailPrice), new: formatAmount(retail ?? 0) })}</p> : null}
      <div onChange={(e) => setPolicy((e.target as HTMLInputElement).value as PricePolicy)}>
        <ChoiceGroup
          key={effectivePolicy}
          legend={t("policy.title")}
          name="policyChoice"
          type="radio"
          defaultValues={[effectivePolicy]}
          options={(["immediate", "after_sellout"] as const).map((value) => ({ value, label: t(`policy.${value}`), hint: t(`policy.${value}Hint`) }))}
        />
      </div>
      {effectivePolicy === "immediate" && hasOpenedPackage ? (
        <ChoiceGroup
          legend={t("remainingEstimate")}
          hint={t("remainingEstimateHint")}
          name="remainingEstimate"
          type="radio"
          defaultValues={["500"]}
          options={([1000, 750, 500, 250, 100] as const).map((value) => ({ value: String(value), label: t(`estimates.${value}`) }))}
          error={field("remainingEstimate")}
        />
      ) : null}
      <SubmitButton variant="primary" pendingLabel={tc("saving")}>
        {t("changePrice")}
      </SubmitButton>
    </form>
  );
}

/** Informations du produit (contenance et unité figées après création). */
export function ProductInfoForm({
  action,
  product,
}: {
  action: Action;
  product: { id: string; name: string; category: string | null; packageLabel: string; reorderThreshold: number; archived: boolean };
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const { formError, field } = useFeedback(state);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="archived" value={product.archived ? "true" : "false"} />
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      {state.status === "success" ? <Notice tone="positive">{tc("saved")}</Notice> : null}
      <TextField label={t("fields.name")} name="name" defaultValue={product.name} error={field("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={`${t("fields.category")} (${tc("optional")})`} name="category" defaultValue={product.category ?? ""} />
        <TextField label={t("fields.packageLabel")} name="packageLabel" defaultValue={product.packageLabel} />
      </div>
      <TextField label={t("fields.reorderThreshold")} name="reorderThreshold" inputMode="numeric" defaultValue={String(product.reorderThreshold)} />
      <SubmitButton variant="secondary" pendingLabel={tc("saving")}>
        {tc("save")}
      </SubmitButton>
    </form>
  );
}
