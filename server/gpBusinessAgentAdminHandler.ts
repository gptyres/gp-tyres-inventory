import { verifyAdminSession } from './adminSession.js';
import { readApiBody } from './readApiBody.js';
import { verifyStaffSession } from './staffSession.js';
import { createSupabaseAdmin } from './supabaseAdmin.js';

const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  const staffSession = verifyStaffSession(request);
  const adminSession = verifyAdminSession(request);
  if (!staffSession || !adminSession) return response.status(403).json({ error: 'Admin mode is required.' });
  const supabase = createSupabaseAdmin();

  try {
    if (request.method === 'GET') {
      const [feedbackResult, knowledgeResult, conversationResult, settingsResult] = await Promise.all([
        supabase.from('ai_staff_feedback')
          .select('id,conversation_id,message_id,original_question,original_answer,correction,target_type,status,submitted_by,created_at')
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('ai_knowledge_documents')
          .select('id,title,category,version,status,visibility,confidence,source_label,created_by,approved_by,approved_at,updated_at')
          .order('updated_at', { ascending: false }).limit(100),
        supabase.from('ai_agent_conversations')
          .select('id,mode,channel,terminal_id,staff_name,status,created_at,updated_at')
          .order('updated_at', { ascending: false }).limit(40),
        supabase.from('ai_agent_settings')
          .select('setting_key,setting_value,visibility,enabled,updated_by,updated_at')
          .order('setting_key')
      ]);
      const error = feedbackResult.error || knowledgeResult.error || conversationResult.error || settingsResult.error;
      if (error) throw error;
      return response.status(200).json({
        feedback: feedbackResult.data || [],
        knowledge: knowledgeResult.data || [],
        conversations: conversationResult.data || [],
        settings: settingsResult.data || []
      });
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return response.status(405).json({ error: 'Only GET and POST are supported.' });
    }
    const body = await readApiBody(request);
    const action = clean(body.action, 50);

    if (action === 'APPROVE_FEEDBACK') {
      const feedbackId = clean(body.feedbackId, 80);
      const { data: feedback, error: feedbackError } = await supabase.from('ai_staff_feedback')
        .select('*').eq('id', feedbackId).eq('status', 'PENDING').single();
      if (feedbackError || !feedback) return response.status(404).json({ error: 'Pending correction was not found.' });
      const title = clean(body.title, 200) || `${String(feedback.target_type).replace(/_/g, ' ')} correction`;
      const visibility = body.visibility === 'CUSTOMER_SAFE' ? 'CUSTOMER_SAFE' : 'INTERNAL';
      const { data: document, error: documentError } = await supabase.from('ai_knowledge_documents').insert({
        title,
        category: feedback.target_type,
        content: feedback.correction,
        source_label: `Approved staff correction from ${feedback.submitted_by}`,
        status: 'APPROVED',
        visibility,
        confidence: 1,
        metadata: {
          feedbackId: feedback.id,
          originalQuestion: feedback.original_question,
          originalAnswer: feedback.original_answer
        },
        created_by: feedback.submitted_by,
        approved_by: adminSession.staffName,
        approved_at: new Date().toISOString()
      }).select('id,title').single();
      if (documentError) throw documentError;
      const { error: updateError } = await supabase.from('ai_staff_feedback').update({
        status: 'APPLIED',
        reviewed_by: adminSession.staffName,
        review_notes: clean(body.reviewNotes, 1000) || null,
        approved_knowledge_document_id: document.id,
        reviewed_at: new Date().toISOString(),
        applied_at: new Date().toISOString()
      }).eq('id', feedback.id);
      if (updateError) throw updateError;
      await supabase.from('ai_agent_audit_logs').insert({
        terminal_id: staffSession.terminalId,
        staff_name: adminSession.staffName,
        actor_role: 'ADMIN',
        action: 'AI_FEEDBACK_APPROVED',
        resource_type: 'AI_KNOWLEDGE_DOCUMENT',
        resource_id: document.id,
        details: { feedbackId: feedback.id, visibility }
      });
      return response.status(200).json({ ok: true, message: `Approved as “${document.title}”.` });
    }

    if (action === 'REJECT_FEEDBACK') {
      const feedbackId = clean(body.feedbackId, 80);
      const { data, error } = await supabase.from('ai_staff_feedback').update({
        status: 'REJECTED',
        reviewed_by: adminSession.staffName,
        review_notes: clean(body.reviewNotes, 1000) || 'Rejected by administrator.',
        reviewed_at: new Date().toISOString()
      }).eq('id', feedbackId).eq('status', 'PENDING').select('id').maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: 'Pending correction was not found.' });
      await supabase.from('ai_agent_audit_logs').insert({
        terminal_id: staffSession.terminalId,
        staff_name: adminSession.staffName,
        actor_role: 'ADMIN',
        action: 'AI_FEEDBACK_REJECTED',
        resource_type: 'AI_STAFF_FEEDBACK',
        resource_id: feedbackId,
        details: {}
      });
      return response.status(200).json({ ok: true, message: 'Correction rejected without changing trusted knowledge.' });
    }

    return response.status(400).json({ error: 'Unsupported admin action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent administration request failed.';
    return response.status(500).json({ error: message });
  }
}
