# ARQUITETURA DE AUTORIDADE DE SERVIDOR E SEGURANÇA FINANCEIRA (SKYBIRD 3D CRASH GAME)

**Data:** 30 de Agosto de 2026  
**Status:** Arquitetura Server-Authoritative Implementada  

---

## 1. Visão Geral da Nova Arquitetura

O sistema transicionou de um modelo **Client-Driven (Browser)** para um modelo **Server-Authoritative (PostgreSQL RPC + Supabase Realtime)**:

```text
CLIENT (Navegador)
  │
  ├── 1. Request Autenticado (JWT)
  ▼
SUPABASE POSTGRESQL (Stored Procedures RPC)
  │
  ├── 2. Trava Atómica de Saldo (SELECT ... FOR UPDATE)
  ├── 3. Validação de Regras Financeiras (Saldo, Min/Max Bet, Crash Point)
  ├── 4. Mutação do Saldo & Criação do Ledger (Transactions)
  ▼
REALTIME BROADCAST (Canais Supabase)
  │
  └── 5. Notificação de Todos os Clientes Conectados
```

---

## 2. Componentes e Responsabilidades

### A. Motor de Jogo & Rodadas (Server Engine)
* **Geração de Seeds:** O `server_seed` é gerado no PostgreSQL e gravado na tabela `public.game_rounds`.
* **Hash de Segurança:** O `server_seed_hash` (SHA-256) é publicado publicamente antes do início do voo.
* **Ocultação do Seed:** O `server_seed` secreto **NUNCA** é exposto ao cliente durante as fases `WAITING` e `RUNNING`.
* **Revelação Provably Fair:** O `server_seed` é liberado apenas após a rodada transicionar para `CRASHED`.

### B. Transações Financeiras & Apostas (Financial RPCs)
* **`place_bet(round_id, amount, panel_id, auto_cashout)`**: Executada com `SECURITY DEFINER` e trava de linha (`FOR UPDATE`). Garante ausência de saldos negativos e previne requisições paralelas simultâneas (double-spend).
* **`cashout_bet(bet_id, multiplier)`**: O servidor valida se o voo não colidiu (`multiplier <= crash_point`) e calcula o payout exato baseando-se no valor oficial gravado.
* **Revogação de Permissões:** Atualizações diretas (`UPDATE`) na tabela `public.wallets` foram revogadas para os utilizadores finais, forçando todas as mutações a passarem por RPCs auditadas.

### C. Armazenamento KYC em Storage Privado
* Documentos e selfies KYC são enviados diretamente para o bucket privado `kyc-documents` do Supabase Storage.
* Apenas o caminho relativo (`storage_path`) é gravado na tabela `public.kyc_verifications`, e a leitura é restrita a administradores via RLS.

---

## 3. Documentação das Funções RPC Criadas

1. **`public.place_bet()`**:
   * *Entrada:* `p_round_id UUID, p_amount NUMERIC, p_panel_id INT, p_auto_cashout NUMERIC`
   * *Ação:* Bloqueia carteira, verifica limites `min_bet`/`max_bet`, reduz o saldo disponível, registra em `public.bets` e `public.transactions`.
2. **`public.cashout_bet()`**:
   * *Entrada:* `p_bet_id UUID, p_multiplier NUMERIC`
   * *Ação:* Verifica estado da aposta e da rodada, calcula o payout, credita na carteira e registra a transação de ganho (`type = 'cashout'`).
3. **`public.create_next_round()`**:
   * *Entrada:* Nenhuma
   * *Ação:* Cria uma nova rodada no servidor com hash SHA-256 e ponto de crash pré-calculado.

---
*Arquitetura de Autoridade de Servidor validada e documentada com sucesso.*
