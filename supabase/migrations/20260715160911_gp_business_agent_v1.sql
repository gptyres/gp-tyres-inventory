create table if not exists public.ai_agent_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  channel text not null default 'STAFF_PORTAL',
  mode text not null default 'INTERNAL',
  terminal_id text not null,
  staff_name text,
  customer_id uuid references public.crm_customers(id) on delete set null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_conversations_mode_check check (mode in ('INTERNAL', 'CUSTOMER_READY')),
  constraint ai_agent_conversations_status_check check (status in ('ACTIVE', 'HANDED_OFF', 'CLOSED')),
  constraint ai_agent_conversations_channel_check check (channel in ('STAFF_PORTAL', 'WEBSITE', 'WHATSAPP', 'API')),
  constraint ai_agent_conversations_terminal_check check (btrim(terminal_id) <> '')
);

create index if not exists ai_agent_conversations_terminal_updated_idx
  on public.ai_agent_conversations (terminal_id, updated_at desc);

create table if not exists public.ai_agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_agent_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  model text,
  confidence numeric(4,3),
  sources jsonb not null default '[]'::jsonb,
  verification_status text not null default 'UNVERIFIED',
  created_at timestamptz not null default now(),
  constraint ai_agent_messages_role_check check (role in ('USER', 'ASSISTANT', 'SYSTEM')),
  constraint ai_agent_messages_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint ai_agent_messages_verification_check check (verification_status in ('VERIFIED', 'PARTIAL', 'UNVERIFIED')),
  constraint ai_agent_messages_content_check check (btrim(content) <> ''),
  constraint ai_agent_messages_sources_array_check check (jsonb_typeof(sources) = 'array')
);

create index if not exists ai_agent_messages_conversation_created_idx
  on public.ai_agent_messages (conversation_id, created_at);

create table if not exists public.ai_agent_tool_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_agent_conversations(id) on delete cascade,
  message_id uuid references public.ai_agent_messages(id) on delete set null,
  tool_name text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  success boolean not null default true,
  duration_ms integer not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  constraint ai_agent_tool_runs_duration_check check (duration_ms >= 0),
  constraint ai_agent_tool_runs_tool_name_check check (btrim(tool_name) <> '')
);

create index if not exists ai_agent_tool_runs_conversation_created_idx
  on public.ai_agent_tool_runs (conversation_id, created_at);

create index if not exists ai_agent_tool_runs_tool_created_idx
  on public.ai_agent_tool_runs (tool_name, created_at desc);

create table if not exists public.ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  title text not null,
  category text not null,
  content text not null,
  source_label text not null,
  source_uri text,
  version integer not null default 1,
  status text not null default 'PENDING',
  visibility text not null default 'INTERNAL',
  confidence numeric(4,3) not null default 0.5,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector('simple', lower(coalesce(title, '') || ' ' || coalesce(category, '') || ' ' || coalesce(content, '')))
  ) stored,
  constraint ai_knowledge_documents_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED')),
  constraint ai_knowledge_documents_visibility_check check (visibility in ('INTERNAL', 'CUSTOMER_SAFE')),
  constraint ai_knowledge_documents_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint ai_knowledge_documents_version_check check (version > 0),
  constraint ai_knowledge_documents_title_check check (btrim(title) <> ''),
  constraint ai_knowledge_documents_content_check check (btrim(content) <> '')
);

create index if not exists ai_knowledge_documents_search_idx
  on public.ai_knowledge_documents using gin (search_document);

create index if not exists ai_knowledge_documents_status_category_idx
  on public.ai_knowledge_documents (status, visibility, category, updated_at desc);

create table if not exists public.ai_staff_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_agent_conversations(id) on delete set null,
  message_id uuid references public.ai_agent_messages(id) on delete set null,
  original_question text not null,
  original_answer text not null,
  correction text not null,
  target_type text not null default 'KNOWLEDGE',
  status text not null default 'PENDING',
  submitted_by text not null,
  reviewed_by text,
  review_notes text,
  approved_knowledge_document_id uuid references public.ai_knowledge_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  constraint ai_staff_feedback_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED')),
  constraint ai_staff_feedback_target_check check (target_type in ('PRODUCT', 'FITMENT', 'PRICING_RULE', 'BUSINESS_POLICY', 'KNOWLEDGE')),
  constraint ai_staff_feedback_correction_check check (btrim(correction) <> '')
);

create index if not exists ai_staff_feedback_status_created_idx
  on public.ai_staff_feedback (status, created_at desc);

create table if not exists public.ai_agent_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  visibility text not null default 'INTERNAL',
  enabled boolean not null default true,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  constraint ai_agent_settings_visibility_check check (visibility in ('INTERNAL', 'CUSTOMER_SAFE')),
  constraint ai_agent_settings_key_check check (btrim(setting_key) <> '')
);

create table if not exists public.ai_agent_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null default '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  terminal_id text not null,
  staff_name text,
  actor_role text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_agent_audit_logs_role_check check (actor_role in ('SALES', 'ADMIN', 'SYSTEM')),
  constraint ai_agent_audit_logs_action_check check (btrim(action) <> '')
);

create index if not exists ai_agent_audit_logs_created_idx
  on public.ai_agent_audit_logs (created_at desc);

create index if not exists ai_agent_audit_logs_terminal_created_idx
  on public.ai_agent_audit_logs (terminal_id, created_at desc);

insert into public.ai_agent_settings (setting_key, setting_value, visibility, updated_by)
values
  ('pricing', '{"vatRate":15,"roundTo":25,"supplierCostTaxBasis":"EXCLUSIVE","defaultMarkupRate":0,"discountApprovalPercent":0}'::jsonb, 'INTERNAL', 'SYSTEM'),
  ('fitment', '{"requirePhysicalConfirmation":true,"requireVehicleVariant":true,"minimumConfidence":0.8}'::jsonb, 'CUSTOMER_SAFE', 'SYSTEM'),
  ('response_policy', '{"neverInventStock":true,"neverInventPrice":true,"neverGuaranteeFitment":true,"showStockVerifiedAt":true}'::jsonb, 'CUSTOMER_SAFE', 'SYSTEM')
on conflict (setting_key) do nothing;

insert into public.ai_knowledge_documents (
  title, category, content, source_label, version, status, visibility, confidence, created_by, approved_by, approved_at
)
values
  (
    'GP Tyres stock and price verification policy',
    'BUSINESS_POLICY',
    'Only state that a product is available when current store inventory or the active supplier catalogue shows stock above zero. Always distinguish GP physical stock from supplier stock and include the last verified timestamp. Use the stored selling price for customer-facing responses. Never expose supplier cost or margin in customer-ready mode.',
    'GP Tyres approved system policy', 1, 'APPROVED', 'CUSTOMER_SAFE', 1, 'SYSTEM', 'SYSTEM', now()
  ),
  (
    'GP Tyres fitment safety policy',
    'FITMENT',
    'Do not guarantee fitment when vehicle year, exact model or variant, tyre size, wheel PCD, offset, centre bore, load rating, or suspension application information is incomplete. Clearly label recommendations as requiring physical confirmation. Escalate when a physical inspection is necessary.',
    'GP Tyres approved system policy', 1, 'APPROVED', 'CUSTOMER_SAFE', 1, 'SYSTEM', 'SYSTEM', now()
  ),
  (
    'Supplier pricing calculation policy',
    'PRICING_RULE',
    'Financial calculations are deterministic. Supplier raw cost is preserved. VAT is applied once according to the configured tax basis and the result is rounded to the configured increment. Existing verified selling prices must not be silently recalculated or overwritten by the language model.',
    'GP Tyres approved system policy', 1, 'APPROVED', 'INTERNAL', 1, 'SYSTEM', 'SYSTEM', now()
  )
on conflict do nothing;

alter table public.ai_agent_conversations enable row level security;
alter table public.ai_agent_messages enable row level security;
alter table public.ai_agent_tool_runs enable row level security;
alter table public.ai_knowledge_documents enable row level security;
alter table public.ai_staff_feedback enable row level security;
alter table public.ai_agent_settings enable row level security;
alter table public.ai_agent_audit_logs enable row level security;

revoke all on table public.ai_agent_conversations from public, anon, authenticated;
revoke all on table public.ai_agent_messages from public, anon, authenticated;
revoke all on table public.ai_agent_tool_runs from public, anon, authenticated;
revoke all on table public.ai_knowledge_documents from public, anon, authenticated;
revoke all on table public.ai_staff_feedback from public, anon, authenticated;
revoke all on table public.ai_agent_settings from public, anon, authenticated;
revoke all on table public.ai_agent_audit_logs from public, anon, authenticated;

grant select, insert, update, delete on table public.ai_agent_conversations to service_role;
grant select, insert, update, delete on table public.ai_agent_messages to service_role;
grant select, insert, update, delete on table public.ai_agent_tool_runs to service_role;
grant select, insert, update, delete on table public.ai_knowledge_documents to service_role;
grant select, insert, update, delete on table public.ai_staff_feedback to service_role;
grant select, insert, update, delete on table public.ai_agent_settings to service_role;
grant select, insert, update, delete on table public.ai_agent_audit_logs to service_role;
grant usage, select on sequence public.ai_agent_audit_logs_id_seq to service_role;

comment on table public.ai_agent_conversations is 'Channel-independent GP Tyres AI conversations. Access is server-only.';
comment on table public.ai_knowledge_documents is 'Versioned and approval-gated business knowledge. Customer messages never write approved knowledge.';
comment on table public.ai_staff_feedback is 'Pending corrections that require staff review before becoming trusted business knowledge.';
