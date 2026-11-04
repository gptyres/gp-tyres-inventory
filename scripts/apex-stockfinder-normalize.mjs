const affirmative = (value) => value === true
  || value === 1
  || /^(?:true|yes|y|1)$/i.test(String(value ?? '').trim());

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const apexSellingPrice = (cost) => {
  const costCents = Math.round(Number(cost) * 100);
  return Math.floor((costCents * 115 + 5000) / 10000);
};

export const apexTyreSpecs = (row) => {
  const specs = [];
  if (affirmative(row?.extra_load)) specs.push('XL');
  if (affirmative(row?.runflat)) specs.push('RUNFLAT');

  const ply = clean(row?.ply_rating);
  if (ply && !/^(?:false|no|0|null|n\/a)$/i.test(ply)) {
    const normalizedPly = /^\d+(?:\.\d+)?$/.test(ply) ? `${ply}PR` : ply.toUpperCase();
    if (!specs.includes(normalizedPly)) specs.push(normalizedPly);
  }

  return specs.join(' / ');
};
