/**
 * supabase_rpc.ts — acesso exclusivamente às operações server-side.
 * O browser envia intenção; PostgreSQL/Supabase Auth determina identidade,
 * saldo, payout, round e resultado financeiro.
 */
import { supabase, isSupabaseConfigured } from './supabase';

export interface PlaceBetResult { success:boolean; bet_id:string; transaction_id:string; balance_before:number; balance_after:number; round_number:number; panel_id:number; error?:string; }
export interface CashoutBetResult { success:boolean; payout:number; multiplier:number; balance_after:number; transaction_id:string; bet_id:string; error?:string; }
export interface CreateRoundResult { success:boolean; round_id:string; round_number:number; server_seed_hash:string; client_seed:string; nonce:number; status:string; error?:string; }
export interface RevealSeedResult { round_id:string; round_number:number; server_seed:string; server_seed_hash:string; client_seed:string; nonce:number; crash_point:number; status:string; }

const pending = new Set<string>();
const fail = <T extends object>(base:T,error:string) => ({...base,success:false,error}) as T & {success:false;error:string};

export async function serverPlaceBet(params:{roundId:string;amount:number;panelId?:number;autoCashout?:number|null;idempotencyKey?:string}):Promise<PlaceBetResult>{
  const base={bet_id:'',transaction_id:'',balance_before:0,balance_after:0,round_number:0,panel_id:params.panelId??1};
  if(!isSupabaseConfigured)return fail(base,'SUPABASE_NOT_CONFIGURED');
  const key=params.idempotencyKey||crypto.randomUUID();
  const lock=`bet:${key}`;
  if(pending.has(lock))return fail(base,'DOUBLE_SUBMIT');
  pending.add(lock);
  try{
    const {data,error}=await supabase.rpc('place_bet',{p_round_id:params.roundId,p_amount:params.amount,p_panel_id:params.panelId??1,p_auto_cashout:params.autoCashout??null,p_idempotency_key:key});
    if(error)return fail(base,error.message);
    return {success:true,bet_id:data.bet_id,transaction_id:data.transaction_id,balance_before:Number(data.balance_before),balance_after:Number(data.balance_after),round_number:Number(data.round_number),panel_id:Number(data.panel_id)};
  }finally{pending.delete(lock);}
}

export async function serverCashoutBet(params:{betId:string}):Promise<CashoutBetResult>{
  const base={payout:0,multiplier:0,balance_after:0,transaction_id:'',bet_id:params.betId};
  if(!isSupabaseConfigured)return fail(base,'SUPABASE_NOT_CONFIGURED');
  const lock=`cashout:${params.betId}`;
  if(pending.has(lock))return fail(base,'DOUBLE_CASHOUT');
  pending.add(lock);
  try{
    const {data,error}=await supabase.rpc('cashout_bet',{p_bet_id:params.betId});
    if(error)return fail(base,error.message);
    return {success:true,payout:Number(data.payout),multiplier:Number(data.multiplier),balance_after:Number(data.balance_after),transaction_id:data.transaction_id,bet_id:data.bet_id};
  }finally{pending.delete(lock);}
}

export async function serverCreateNextRound():Promise<CreateRoundResult>{
  const base={round_id:'',round_number:0,server_seed_hash:'',client_seed:'',nonce:0,status:''};
  if(!isSupabaseConfigured)return fail(base,'SUPABASE_NOT_CONFIGURED');
  const {data,error}=await supabase.rpc('create_next_round');
  if(error)return fail(base,error.message);
  return {success:true,round_id:data.round_id,round_number:Number(data.round_number),server_seed_hash:data.server_seed_hash,client_seed:data.client_seed,nonce:Number(data.nonce),status:data.status};
}

export async function serverRevealRoundSeed(roundId:string):Promise<RevealSeedResult|null>{
  if(!isSupabaseConfigured)return null;
  const {data,error}=await supabase.rpc('reveal_round_seed',{p_round_id:roundId});
  if(error||!data)return null;
  return {round_id:data.round_id,round_number:Number(data.round_number),server_seed:data.server_seed,server_seed_hash:data.server_seed_hash,client_seed:data.client_seed,nonce:Number(data.nonce),crash_point:Number(data.crash_point),status:data.status};
}

/**
 * Reads the public round exclusively through the safe RPC.
 * The browser no longer subscribes directly to game_rounds, avoiding exposure
 * of server_seed/crash_point through Realtime payloads.
 */
export function subscribeToCurrentRound(onRoundChange:(round:any)=>void){
  if(!isSupabaseConfigured)return()=>{};
  let stopped=false;
  let timer:ReturnType<typeof setTimeout>|null=null;
  let lastRoundKey='';

  const poll=async()=>{
    if(stopped)return;
    try{
      const {data,error}=await supabase.rpc('get_current_round');
      if(!error&&data){
        const round={
          id:data.id,
          round_number:Number(data.round_number),
          status:data.status,
          server_seed_hash:data.server_seed_hash,
          client_seed:data.client_seed,
          nonce:Number(data.nonce),
          crash_point:['CRASHED','SETTLED'].includes(data.status)&&data.crash_point!=null?Number(data.crash_point):undefined,
          started_at:data.started_at,
          ended_at:data.ended_at,
          total_bets_amount:Number(data.total_bets_amount??0),
          total_payout_amount:Number(data.total_payout_amount??0)
        };
        const key=`${round.id}:${round.status}:${round.started_at??''}:${round.ended_at??''}:${round.crash_point??''}:${round.total_bets_amount}:${round.total_payout_amount}`;
        if(key!==lastRoundKey){
          lastRoundKey=key;
          onRoundChange(round);
        }
      }
    }catch(error){
      console.warn('[Supabase] current round polling failed:',error);
    }finally{
      if(!stopped)timer=setTimeout(poll,750);
    }
  };

  void poll();
  return()=>{
    stopped=true;
    if(timer)clearTimeout(timer);
  };
}

export function subscribeToWalletChanges(userId:string,onBalanceChange:(availableBalance:number,lockedBalance:number)=>void){
  if(!isSupabaseConfigured)return()=>{};
  const channel=supabase.channel(`wallet:${userId}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'wallets',filter:`user_id=eq.${userId}`},payload=>{const row:any=payload.new;onBalanceChange(Number(row.available_balance??0),Number(row.locked_balance??0));}).subscribe();
  return()=>{void supabase.removeChannel(channel);};
}

export function subscribeToActiveBets(roundId:string,onBetsChange:(bets:any[])=>void){
  if(!isSupabaseConfigured)return()=>{};
  const channel=supabase.channel(`bets:${roundId}`).on('postgres_changes',{event:'*',schema:'public',table:'bets',filter:`round_id=eq.${roundId}`},async()=>{
    const {data}=await supabase.from('bets').select('id,user_id,amount,cashout_multiplier,payout,status,panel_id,created_at').eq('round_id',roundId);
    if(data)onBetsChange(data);
  }).subscribe();
  return()=>{void supabase.removeChannel(channel);};
}

/**
 * Support message realtime subscription used by the store/admin UI.
 * Access is still enforced by the support_messages RLS policies in Supabase.
 */
export function subscribeToSupportMessages(onMessage:(message:any)=>void){
  if(!isSupabaseConfigured)return()=>{};
  const channel=supabase
    .channel('support-messages')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},payload=>{
      onMessage(payload.new);
    })
    .subscribe();
  return()=>{void supabase.removeChannel(channel);};
}

export async function uploadKYCDocument(userId:string,file:File,documentType:'id_document'|'selfie'){
  if(!isSupabaseConfigured)return{path:null,error:'Supabase não configurado.'};
  const extension=file.type==='application/pdf'?'pdf':'jpg';
  const filePath=`${userId}/${documentType}_${Date.now()}.${extension}`;
  const {error}=await supabase.storage.from('kyc-documents').upload(filePath,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
  return error?{path:null,error:error.message}:{path:filePath,error:null};
}

export async function getKYCSignedUrl(storagePath:string){
  if(!isSupabaseConfigured)return null;
  const {data,error}=await supabase.storage.from('kyc-documents').createSignedUrl(storagePath,3600);
  return error?null:data?.signedUrl??null;
}

export async function sendSupportMessageSupabase(params:{conversationId:string;senderId:string;senderName:string;senderRole:'player'|'admin';text:string}){
  if(!isSupabaseConfigured)return{success:false,error:'Supabase not configured'};
  const {data,error}=await supabase.from('support_messages').insert({conversation_id:params.conversationId,sender_id:params.senderId,sender_name:params.senderName,sender_role:params.senderRole,text:params.text,created_at:new Date().toISOString()}).select().single();
  return error?{success:false,error:error.message}:{success:true,data};
}