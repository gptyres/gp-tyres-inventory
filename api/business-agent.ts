import { verifyAdminSession } from '../server/adminSession.js';
import { runGpBusinessAgent, type AgentMode } from '../server/gpBusinessAgent.js';
import { readApiBody } from '../server/readApiBody.js';
import { verifyStaffSession } from '../server/staffSession.js';
import { createSupabaseAdmin } from '../server/supabaseAdmin.js';
import { loadStaffMemories } from '../server/gpBusinessAgentMemory.js';
import adminHandler from '../server/gpBusinessAgentAdminHandler.js';
import feedbackHandler from '../server/gpBusinessAgentFeedbackHandler.js';
import tyreVisualHandler from '../server/gpTyreVisualHandler.js';

const requestsByTerminal = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 20;

const checkRateLimit = (terminalId: string) => {
  const now = Date.now();
  const current = requestsByTerminal.get(terminalId);
  if (!current || current.resetAt <= now) {
    requestsByTerminal.set(terminalId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_REQUESTS) return false;
  current.count += 1;
  return true;
};

const getOrCreateConversation = async (supabase: ReturnType<typeof createSupabaseAdmin>, body: any, terminalId: string, staffName: string | null, mode: AgentMode) => {
  const suppliedId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  if (suppliedId) {
    const { data } = await supabase.from('ai_agent_conversations')
      .select('id')
      .eq('id', suppliedId)
      .eq('terminal_id', terminalId)
      .maybeSingle();
    if (data?.id) {
      await supabase.from('ai_agent_conversations').update({ mode, staff_name: staffName, updated_at: new Date().toISOString() }).eq('id', data.id);
      return data.id as string;
    }
  }
  const { data, error } = await supabase.from('ai_agent_conversations').insert({
    channel: 'STAFF_PORTAL',
    mode,
    terminal_id: terminalId,
    staff_name: staffName
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
};

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const queryAction = typeof request.query?.action === 'string' ? request.query.action : '';
  if (request.method === 'GET' && queryAction === 'ADMIN_DASHBOARD') {
    return adminHandler(request, response);
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Only POST is supported.' });
  }

  let routingBody: any = {};
  try {
    routingBody = await readApiBody(request);
    request.body = routingBody;
  } catch {
    return response.status(400).json({ error: 'Invalid JSON request.' });
  }
  if (routingBody.action === 'SUBMIT_FEEDBACK') return feedbackHandler(request, response);
  if (routingBody.action === 'FIND_TYRE_VISUAL') return tyreVisualHandler(request, response);
  if (routingBody.action === 'APPROVE_FEEDBACK' || routingBody.action === 'REJECT_FEEDBACK') return adminHandler(request, response);

  const staffSession = verifyStaffSession(request);
  if (!staffSession) return response.status(401).json({ error: 'A valid staff login is required.' });
  if (!checkRateLimit(staffSession.terminalId)) return response.status(429).json({ error: 'Too many agent requests. Please wait one minute.' });

  const apiKey = process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY;
  if (!apiKey) return response.status(503).json({ error: 'The GP Business Agent is not configured yet.' });

  try {
    const body = routingBody;
    const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    const latestUserMessage = [...messages].reverse().find((message: any) => message?.role === 'user');
    if (!latestUserMessage || !String(latestUserMessage.content ?? latestUserMessage.text ?? '').trim()) {
      return response.status(400).json({ error: 'Send at least one staff message.' });
    }
    const mode: AgentMode = body.mode === 'CUSTOMER_READY' ? 'CUSTOMER_READY' : 'INTERNAL';
    const adminSession = verifyAdminSession(request);
    const supabase = createSupabaseAdmin();
    const staffMemories = await loadStaffMemories(supabase, staffSession.terminalId);
    const conversationId = await getOrCreateConversation(supabase, body, staffSession.terminalId, adminSession?.staffName || null, mode);
    const latestText = String(latestUserMessage.content ?? latestUserMessage.text).trim().slice(0, 4000);
    const { data: userMessage, error: userMessageError } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversationId,
      role: 'USER',
      content: latestText,
      verification_status: 'UNVERIFIED'
    }).select('id').single();
    if (userMessageError) throw userMessageError;

    const result = await runGpBusinessAgent(apiKey, {
      supabase,
      terminalId: staffSession.terminalId,
      staffName: adminSession?.staffName || null,
      isAdmin: Boolean(adminSession),
      mode,
      conversationId,
      latestUserMessage: latestText,
      staffMemories
    }, messages);

    const { data: assistantMessage, error: assistantError } = await supabase.from('ai_agent_messages').insert({
      conversation_id: conversationId,
      role: 'ASSISTANT',
      content: result.answer,
      model: result.model,
      confidence: result.confidence,
      sources: result.sources,
      verification_status: result.verificationStatus
    }).select('id').single();
    if (assistantError) throw assistantError;
    await supabase.from('ai_agent_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    await supabase.from('ai_agent_audit_logs').insert({
      terminal_id: staffSession.terminalId,
      staff_name: adminSession?.staffName || null,
      actor_role: adminSession ? 'ADMIN' : 'SALES',
      action: 'AI_AGENT_RESPONSE',
      resource_type: 'AI_CONVERSATION',
      resource_id: conversationId,
      details: { mode, messageId: assistantMessage.id, sourceCount: result.sources.length, verificationStatus: result.verificationStatus, memoryCount: staffMemories.length }
    });

    return response.status(200).json({
      conversationId,
      messageId: assistantMessage.id,
      text: result.answer,
      model: result.model,
      sources: result.sources,
      confidence: result.confidence,
      verificationStatus: result.verificationStatus,
      memory: { enabled: true, loaded: staffMemories.length },
      permissions: { role: adminSession ? 'ADMIN' : 'SALES', mode }
    });
  } catch (error) {
    console.error('[GP BUSINESS AGENT]', error);
    const message = error instanceof Error ? error.message : 'The GP Business Agent request failed.';
    const status = Number((error as any)?.publicStatus) || 500;
    return response.status(status).json({ error: message });
  }
}
