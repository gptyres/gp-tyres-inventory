import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffMemoryType = 'PREFERENCE' | 'WORKFLOW' | 'COMMUNICATION_STYLE';

export interface StaffMemory {
  id: string;
  memoryKey: string;
  memoryType: StaffMemoryType;
  title: string;
  content: string;
  sourceLabel: string;
  confidence: number;
  updatedAt: string;
}

const clean = (value: unknown, maxLength: number) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);

export const hasExplicitMemoryIntent = (value: unknown) => {
  const text = clean(value, 4000).toLowerCase();
  return /\b(remember|save|store|keep)\b.{0,40}\b(memory|preference|for next time|in mind)\b/.test(text)
    || /\bremember\s+(that|to|my)\b/.test(text);
};

export const validateStaffMemoryContent = (value: unknown) => {
  const content = clean(value, 1200);
  if (content.length < 3) return { allowed: false, reason: 'Memory content is too short.' };
  if (/\b(password|passcode|api[\s_-]*key|secret|access[\s_-]*token|private[\s_-]*key|credential)\b/i.test(content)) {
    return { allowed: false, reason: 'Credentials and secrets cannot be stored in agent memory.' };
  }
  if (/\b(customer|client)\b.{0,40}\b(phone|email|address|id number|identity|payment|card)\b/i.test(content)) {
    return { allowed: false, reason: 'Customer personal information cannot be stored as staff memory.' };
  }
  if (/\b(stock|quantity|available|cost price|selling price|supplier price|discount|promotion|warranty|delivery time|fitment)\b/i.test(content)) {
    return { allowed: false, reason: 'Changing stock, price, fitment and policy facts must stay in verified tools or the approval workflow.' };
  }
  return { allowed: true, reason: '' };
};

const normalizeMemoryType = (value: unknown): StaffMemoryType => {
  const normalized = clean(value, 40).toUpperCase();
  if (normalized === 'WORKFLOW' || normalized === 'COMMUNICATION_STYLE') return normalized;
  return 'PREFERENCE';
};

const memoryKey = (type: StaffMemoryType, title: string) => `${type.toLowerCase()}:${title.toLowerCase()}`
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);

export const loadStaffMemories = async (supabase: SupabaseClient<any, 'public', any>, terminalId: string): Promise<StaffMemory[]> => {
  const { data, error } = await supabase
    .from('ai_agent_staff_memories')
    .select('id,memory_key,memory_type,title,content,source_label,confidence,updated_at')
    .eq('terminal_id', terminalId)
    .eq('status', 'ACTIVE')
    .order('updated_at', { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    memoryKey: row.memory_key,
    memoryType: row.memory_type,
    title: row.title,
    content: row.content,
    sourceLabel: row.source_label,
    confidence: Number(row.confidence) || 0,
    updatedAt: row.updated_at
  }));
};

export const saveStaffMemory = async (
  supabase: SupabaseClient<any, 'public', any>,
  terminalId: string,
  staffName: string | null | undefined,
  isAdmin: boolean,
  latestUserMessage: string,
  input: any
) => {
  if (!hasExplicitMemoryIntent(latestUserMessage) || input?.confirmed !== true) {
    throw new Error('Memory is only saved after an explicit “remember” or “save to memory” instruction.');
  }
  const title = clean(input?.title, 120);
  const content = clean(input?.content, 1200);
  const memoryType = normalizeMemoryType(input?.memoryType);
  if (!title) throw new Error('A short memory title is required.');
  const validation = validateStaffMemoryContent(content);
  if (!validation.allowed) throw new Error(validation.reason);
  const key = memoryKey(memoryType, title);
  if (!key) throw new Error('A valid memory title is required.');

  const { data: existing, error: lookupError } = await supabase
    .from('ai_agent_staff_memories')
    .select('id')
    .eq('terminal_id', terminalId)
    .eq('memory_key', key)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const payload = {
    terminal_id: terminalId,
    memory_key: key,
    memory_type: memoryType,
    title,
    content,
    source_label: 'Explicit staff instruction',
    confidence: 1,
    status: 'ACTIVE',
    updated_at: new Date().toISOString()
  };
  const result = existing?.id
    ? await supabase.from('ai_agent_staff_memories').update(payload).eq('id', existing.id).select('id,title,memory_type,updated_at').single()
    : await supabase.from('ai_agent_staff_memories').insert(payload).select('id,title,memory_type,updated_at').single();
  if (result.error) throw result.error;

  await supabase.from('ai_agent_audit_logs').insert({
    terminal_id: terminalId,
    staff_name: staffName || null,
    actor_role: isAdmin ? 'ADMIN' : 'SALES',
    action: existing?.id ? 'AI_MEMORY_UPDATED' : 'AI_MEMORY_CREATED',
    resource_type: 'AI_STAFF_MEMORY',
    resource_id: result.data.id,
    details: { memoryType, title }
  });
  return result.data;
};
