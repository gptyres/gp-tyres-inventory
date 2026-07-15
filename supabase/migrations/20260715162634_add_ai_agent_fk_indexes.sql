create index if not exists ai_agent_conversations_customer_id_idx
  on public.ai_agent_conversations (customer_id)
  where customer_id is not null;

create index if not exists ai_agent_tool_runs_message_id_idx
  on public.ai_agent_tool_runs (message_id)
  where message_id is not null;

create index if not exists ai_staff_feedback_conversation_id_idx
  on public.ai_staff_feedback (conversation_id)
  where conversation_id is not null;

create index if not exists ai_staff_feedback_message_id_idx
  on public.ai_staff_feedback (message_id)
  where message_id is not null;

create index if not exists ai_staff_feedback_knowledge_document_id_idx
  on public.ai_staff_feedback (approved_knowledge_document_id)
  where approved_knowledge_document_id is not null;
