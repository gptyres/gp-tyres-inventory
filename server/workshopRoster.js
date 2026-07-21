export const DEFAULT_WORKSHOP_AGENTS = ['Noor', 'Mac', 'Rafiek', 'Yaseen', 'Laeeq', 'Zahied', 'Niyaaz'];

export const WORKSHOP_TECHNICIANS = ['Klassie', 'Richard', 'Abu Bakr', 'Saeed', 'Rajab', 'Ashley', 'Blessing', 'Clement', 'Patrick'];

export const getWorkshopAgents = async (supabase) => {
  const agents = new Set(DEFAULT_WORKSHOP_AGENTS);
  const { data, error } = await supabase
    .from('training_progress')
    .select('staff_name')
    .not('staff_name', 'is', null)
    .limit(100);

  if (!error) {
    (data || []).forEach((row) => {
      const name = typeof row.staff_name === 'string' ? row.staff_name.trim().replace(/\s+/g, ' ') : '';
      if (name) agents.add(name);
    });
  }

  return Array.from(agents).sort((left, right) => left.localeCompare(right));
};
