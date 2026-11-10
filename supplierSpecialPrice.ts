export interface SupplierSpecialPrice {
  costExVat: number;
  startsAt: string;
  endsAt: string;
}

export const getActiveSupplierSpecial = (
  detail?: string | null,
  now = Date.now()
): SupplierSpecialPrice | undefined => {
  if (!detail?.includes('"gp_supplier_special_v1"')) return undefined;
  for (const match of detail.matchAll(/"gp_supplier_special_v1"\s*:\s*(\{[^{}]*\})/g)) {
    try {
      const special = JSON.parse(match[1]) as SupplierSpecialPrice;
      if (Number.isFinite(special.costExVat) && special.costExVat > 0
        && Date.parse(special.startsAt) <= now && now < Date.parse(special.endsAt)) return special;
    } catch {
      // A malformed source note must not change the regular price.
    }
  }
  return undefined;
};
