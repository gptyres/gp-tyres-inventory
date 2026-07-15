import { verifyAdminSession } from '../server/adminSession.js';
import { readApiBody } from '../server/readApiBody.js';
import { verifyStaffSession } from '../server/staffSession.js';
import { createSupabaseAdmin } from '../server/supabaseAdmin.js';

const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Only POST is supported.' });
  }
  const staffSession = verifyStaffSession(request);
  if (!staffSession) return response.status(401).json({ error: 'A valid staff login is required.' });

  try {
    const body = await readApiBody(request);
    const conversationId = clean(body.conversationId, 80);
    const messageId = clean(body.messageId, 80);
    const originalQuestion = clean(body.originalQuestion, 4000);
    const originalAnswer = clean(body.originalAnswer, 12000);
    const correction = clean(body.correction, 8000);
    const requestedTargetType = clean(body.targetType, 40);
    const targetType = ['PRODUCT', 'FITMENT', 'PRICING_RULE', 'BUSINESS_POLICY', 'KNOWLEDGE'].includes(requestedTargetType) ? requestedTargetType : 'KNOWLEDGE';
    if (!conversationId || !messageId || !originalQuestion || !originalAnswer || !correction) {
      return response.status(400).json({ error: 'Conversation, answer, question, and correction are required.' });
    }
    const supabase = createSupabaseAdmin();
    const { data: conversation } = await supabase.from('ai_agent_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('terminal_id', staffSession.terminalId)
      .maybeSingle();
    if (!conversation) return response.status(404).json({ error: 'Conversation was not found for this terminal.' });

    const adminSession = verifyAdminSession(request);
    const { data, error } = await supabase.from('ai_staff_feedback').insert({
      conversation_id: conversationId,
      message_id: messageId,
      original_question: originalQuestion,
      original_answer: originalAnswer,
      correction,
      target_type: targetType,
      status: 'PENDING',
      submitted_by: adminSession?.staffName || staffSession.terminalId
    }).select('id,status,created_at').single();
    if (error) throw error;
    await supabase.from('ai_agent_audit_logs').insert({
      terminal_id: staffSession.terminalId,
      staff_name: adminSession?.staffName || null,
      actor_role: adminSession ? 'ADMIN' : 'SALES',
      action: 'AI_FEEDBACK_SUBMITTED',
      resource_type: 'AI_STAFF_FEEDBACK',
      resource_id: data.id,
      details: { targetType, status: data.status }
    });
    return response.status(201).json({ feedbackId: data.id, status: data.status, message: 'Correction saved for review. Trusted business data was not changed.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Correction could not be recorded.';
    return response.status(500).json({ error: message });
  }
}
