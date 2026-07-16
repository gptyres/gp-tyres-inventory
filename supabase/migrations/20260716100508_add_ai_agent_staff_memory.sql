create table if not exists public.ai_agent_staff_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  terminal_id text not null,
  memory_key text not null,
  memory_type text not null default 'PREFERENCE',
  title text not null,
  content text not null,
  source_label text not null default 'Explicit staff instruction',
  confidence numeric(4,3) not null default 1,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint ai_agent_staff_memories_terminal_check check (btrim(terminal_id) <> ''),
  constraint ai_agent_staff_memories_key_check check (btrim(memory_key) <> ''),
  constraint ai_agent_staff_memories_title_check check (btrim(title) <> ''),
  constraint ai_agent_staff_memories_content_check check (btrim(content) <> ''),
  constraint ai_agent_staff_memories_type_check check (memory_type in ('PREFERENCE', 'WORKFLOW', 'COMMUNICATION_STYLE')),
  constraint ai_agent_staff_memories_status_check check (status in ('ACTIVE', 'ARCHIVED')),
  constraint ai_agent_staff_memories_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint ai_agent_staff_memories_terminal_key_unique unique (terminal_id, memory_key)
);

create index if not exists ai_agent_staff_memories_terminal_updated_idx
  on public.ai_agent_staff_memories (terminal_id, status, updated_at desc);

alter table public.ai_agent_staff_memories enable row level security;

revoke all on table public.ai_agent_staff_memories from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_agent_staff_memories to service_role;

comment on table public.ai_agent_staff_memories is
  'Server-only, explicit staff preferences used by the GP Business Agent. Dynamic stock, prices, credentials, customer personal data and unapproved business facts are not stored here.';
