/** Production finance bridge. No local financial fallback. */
import { isSupabaseConfigured, supabase } from './supabase';

function requireBackend() {
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
}

async function requireUser() {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('UNAUTHENTICATED');
  return data.user;
}

export async function requestDepositServer(amount:number, method='Airtm', reference?:string, details?:string) {
  await requireUser();
  const { data, error } = await supabase.rpc('request_deposit',{p_amount:amount,p_method:method,p_reference:reference ?? null,p_details:details ?? null});
  if (error) throw new Error(error.message);
  return data;
}

export async function requestWithdrawalServer(amount:number, method='Airtm', details?:string, idempotencyKey?:string) {
  await requireUser();
  const { data, error } = await supabase.rpc('request_withdrawal',{p_amount:amount,p_method:method,p_details:details ?? null,p_idempotency_key:idempotencyKey ?? crypto.randomUUID()});
  if (error) throw new Error(error.message);
  return data;
}

export async function adminSetTransactionStatusServer(transactionId:string,status:'completed'|'failed'|'cancelled',reason?:string) {
  await requireUser();
  const { data, error } = await supabase.rpc('admin_set_transaction_status',{p_transaction_id:transactionId,p_status:status,p_reason:reason ?? null});
  if (error) throw new Error(error.message);
  return data;
}

export async function submitKycServer(idDocumentPath:string,selfiePath:string,airtmAccount:string,whatsappNumber:string) {
  await requireUser();
  const { data, error } = await supabase.rpc('submit_kyc',{p_id_document_path:idDocumentPath,p_selfie_path:selfiePath,p_airtm_account:airtmAccount,p_whatsapp_number:whatsappNumber});
  if (error) throw new Error(error.message);
  return data;
}

export async function adminReviewKycServer(kycId:string,status:'approved'|'rejected',reason?:string) {
  await requireUser();
  const { data, error } = await supabase.rpc('admin_review_kyc',{p_kyc_id:kycId,p_status:status,p_rejection_reason:reason ?? null});
  if (error) throw new Error(error.message);
  return data;
}
