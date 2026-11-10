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
  const matches = [...detail.matchAll(/"gp_supplier_special_v1"\s*:\s*(\{[^{}]*\})/g)];
  for (const match of matches.reverse()) {
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

export const nextSupplierSpecialExpiry = (
  ...groups: readonly (readonly { supplierSpecialEndsAt?: number }[])[]
): number => {
  let deadline = Infinity;
  for (const items of groups) {
    for (const item of items) {
      if (item.supplierSpecialEndsAt !== undefined) deadline = Math.min(deadline, item.supplierSpecialEndsAt);
    }
  }
  return deadline;
};

export const scheduleSupplierSpecialExpiry = (deadline: number, onExpire: () => void): (() => void) => {
  if (!Number.isFinite(deadline)) return () => {};
  let timer: ReturnType<typeof setTimeout>;
  const check = () => {
    clearTimeout(timer);
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      cancel();
      onExpire();
    } else {
      timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    }
  };
  const cancel = () => {
    clearTimeout(timer);
    globalThis.window?.removeEventListener('focus', check);
    globalThis.document?.removeEventListener('visibilitychange', check);
  };
  globalThis.window?.addEventListener('focus', check);
  globalThis.document?.addEventListener('visibilitychange', check);
  check();
  return cancel;
};
