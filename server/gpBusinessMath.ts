export interface PriceCalculationInput {
  costPrice: number;
  costIncludesVat: boolean;
  vatRate?: number;
  markupRate?: number;
  roundTo?: number;
}

const money = (value: number) => Math.round(value * 100) / 100;

export const calculateDeterministicPrice = (input: PriceCalculationInput) => {
  const costPrice = Number.isFinite(input.costPrice) && input.costPrice >= 0 ? money(input.costPrice) : 0;
  const vatRate = Math.min(Math.max(Number(input.vatRate ?? 15), 0), 100);
  const markupRate = Math.min(Math.max(Number(input.markupRate ?? 0), 0), 500);
  const roundTo = Math.min(Math.max(Math.floor(Number(input.roundTo ?? 25)) || 25, 1), 1000);
  const vatExclusiveBase = input.costIncludesVat ? costPrice / (1 + vatRate / 100) : costPrice;
  const markedUpExclusive = vatExclusiveBase * (1 + markupRate / 100);
  const vatAmount = markedUpExclusive * vatRate / 100;
  const sellingPriceBeforeRounding = markedUpExclusive + vatAmount;
  const sellingPrice = Math.round((sellingPriceBeforeRounding / roundTo) + 1e-9) * roundTo;
  return {
    costPrice,
    costIncludesVat: input.costIncludesVat,
    vatRate,
    markupRate,
    roundTo,
    vatAmount: money(vatAmount),
    sellingPriceBeforeRounding: money(sellingPriceBeforeRounding),
    sellingPrice: money(sellingPrice)
  };
};

export const calculateDeterministicMargin = (costPriceInput: number, sellingPriceInput: number, quantityInput = 1) => {
  const costPriceEach = Number.isFinite(costPriceInput) && costPriceInput >= 0 ? money(costPriceInput) : 0;
  const sellingPriceEach = Number.isFinite(sellingPriceInput) && sellingPriceInput >= 0 ? money(sellingPriceInput) : 0;
  const quantity = Number.isFinite(quantityInput) && quantityInput > 0 ? Math.floor(quantityInput) : 1;
  const grossProfitEach = sellingPriceEach - costPriceEach;
  return {
    quantity,
    costPriceEach,
    sellingPriceEach,
    grossProfitEach: money(grossProfitEach),
    grossProfitTotal: money(grossProfitEach * quantity),
    grossMarginPercent: sellingPriceEach > 0 ? money((grossProfitEach / sellingPriceEach) * 100) : 0,
    markupPercent: costPriceEach > 0 ? money((grossProfitEach / costPriceEach) * 100) : 0
  };
};

