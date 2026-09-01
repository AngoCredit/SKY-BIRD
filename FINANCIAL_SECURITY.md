# FINANCIAL SECURITY ARCHITECTURE — SKYBIRD 3D CRASH GAME

**Versão:** 2.0 — Server-Authoritative  
**Data:** 30 de Agosto de 2026  

---

## 1. Princípios Fundamentais de Segurança Financeira

No Skybird 3D Crash Game, nenhuma operação financeira é confiada ao frontend (browser/JavaScript). Toda e qualquer alteração de saldo, aposta ou pagamento é executada através de **Stored Procedures PostgreSQL (RPC)** atómicas e protegidas por **Row Level Security (RLS)**.

```text
CLIENTE (Navegador/React)
   │
   ├── 1. Envia Intenção (ex: place_bet, cashout_bet) via JWT Autenticado
   ▼
POSTGRESQL / SUPABASE (SECURITY DEFINER RPC)
   │
   ├── 2. Valida auth.uid() (obrigatório, nunca aceita user_id do body)
   ├── 3. Executa SELECT ... FOR UPDATE na carteira/aposta (bloqueio atómico)
   ├── 4. Valida regras de negócio (saldo suficiente, min/max bet, status da rodada)
   ├── 5. Aplica mutações (wallets, bets, transactions ledger) em transação única
   ▼
REALTIME / EVENT RESPONSE
   │
   └── 6. Retorna o saldo actualizado e confirmação ao cliente
```

---

## 2. Garantias Criptográficas e Atómicas

### A. Idempotência e Prevenção de Double-Spending
1. **Trava de Linha (`SELECT ... FOR UPDATE`):**
   Ao processar apostas ou saques, a linha da carteira do utilizador em `public.wallets` é bloqueada no nível do banco de dados PostgreSQL durante a transação. Requisições simultâneas paralelas entram em fila e são avaliadas sequencialmente contra o saldo já actualizado.
2. **Restrição de Unicidade na Tabela `bets`:**
   A constraint `UNIQUE(user_id, round_id, panel_id)` impede rigorosamente a criação de mais de uma aposta activa no mesmo painel para a mesma rodada.

### B. Cálculo de Payout e Arredondamento Server-Side
- O valor recebido no cashout é calculado exclusivamente pela Stored Procedure `cashout_bet()` usando `ROUND((amount * multiplier)::numeric, 2)`.
- O valor é limitado pelo `max_payout` configurado na tabela `admin_settings`.
- Se o multiplicador solicitado exceder o `crash_point` oficial gravado na rodada, a aposta é marcada como `crashed` e o saldo não é creditado.

### C. Revogação de Atualizações Diretas em `public.wallets`
Comandos diretos de escrita na tabela de carteiras foram revogados no PostgreSQL:
```sql
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM authenticated, anon;
```
Qualquer tentativa do cliente de modificar o saldo via API Supabase REST é rejeitada pelo PostgreSQL. Mutações só ocorrem via funções `SECURITY DEFINER` autorizadas.

---

## 3. Registro Ledger de Transações (`public.transactions`)

Todas as movimentações financeiras geram um registo imutável no ledger:
- `type`: `deposit`, `withdrawal`, `bet`, `cashout`, `refund`, `referral_bonus`
- `balance_before` e `balance_after`: registam o estado da carteira antes e depois da operação.
- `currency`: obrigatoriamente `USD` (tipo `numeric(12,2)`).

---

## 4. Proteção contra Multi-Contas e Abuso
1. **Device Fingerprinting:** O cliente gera uma hash de hardware/browser enviada durante o registo para prevenir criação de contas duplicadas no mesmo dispositivo.
2. **Limites de Saque KYC:**
   - **Contas não verificadas:** Limite diário de $100.00 USD.
   - **Contas verificadas (KYC):** Limite diário de $500.00 USD.
3. **Storage KYC Privado:** Documentos de identidade são armazenados no bucket privado `kyc-documents`, acessíveis apenas via URLs assinadas e temporárias geradas pelo administrador.
