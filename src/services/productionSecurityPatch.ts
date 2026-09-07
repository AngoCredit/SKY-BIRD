/** Production security containment for legacy store APIs. */
import { store } from './store';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  requestDepositServer,
  requestWithdrawalServer,
  adminSetTransactionStatusServer,
  submitKycServer,
  adminReviewKycServer,
} from './productionFinanceBridge';

async function authUser() {
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('UNAUTHENTICATED');
  return data.user;
}

async function profile() {
  await authUser();
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

// Supabase Auth is the only admin authentication mechanism.
store.loginAdmin = (async (email: string, password: string, _pin?: string) => {
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.auth.signInWithPassword({email: email.trim().toLowerCase(), password});
  if (error || !data.user) throw new Error(error?.message || 'INVALID_CREDENTIALS');
  const p = await profile();
  if (!p || p.role !== 'admin' || p.status !== 'active') {
    await supabase.auth.signOut();
    throw new Error('ADMIN_REQUIRED');
  }
  return p;
}) as any;

// Browser role switching is forbidden in production.
store.switchRole = (() => { throw new Error('ROLE_SWITCH_FORBIDDEN'); }) as any;

// Disable the constructor's legacy local round initializer and all client round creation paths.
store.initNextRound = (() => undefined) as any;
store.resetAllData = (() => { throw new Error('LOCAL_DATA_RESET_FORBIDDEN'); }) as any;

// Finance operations are RPC-only. Exact legacy signatures are intentionally accepted through any
// to preserve UI compatibility while eliminating local balance mutations.
store.requestDeposit = (async (amount: number, method?: string, reference?: string, details?: string) =>
  requestDepositServer(amount, method, reference, details)) as any;
store.requestWithdrawal = (async (amount: number, method?: string, details?: string, idempotencyKey?: string) =>
  requestWithdrawalServer(amount, method, details, idempotencyKey)) as any;
store.approveDeposit = (async (transactionId: string) =>
  adminSetTransactionStatusServer(transactionId, 'completed')) as any;
store.rejectDeposit = (async (transactionId: string, reason?: string) =>
  adminSetTransactionStatusServer(transactionId, 'failed', reason)) as any;
store.approveWithdrawal = (async (transactionId: string) =>
  adminSetTransactionStatusServer(transactionId, 'completed')) as any;
store.rejectWithdrawal = (async (transactionId: string, reason?: string) =>
  adminSetTransactionStatusServer(transactionId, 'cancelled', reason)) as any;

// KYC writes must use private storage paths + SECURITY DEFINER RPCs.
store.submitKYC = (async (idDocumentPath: string, selfiePath: string, airtmAccount: string, whatsappNumber: string) =>
  submitKycServer(idDocumentPath, selfiePath, airtmAccount, whatsappNumber)) as any;
store.approveKYC = (async (kycId: string) => adminReviewKycServer(kycId, 'approved')) as any;
store.rejectKYC = (async (kycId: string, reason?: string) => adminReviewKycServer(kycId, 'rejected', reason)) as any;
