# MOTOR DO JOGO CRASH (GAME ENGINE SERVER-SIDE) — SKYBIRD 3D

**Status:** Server-Driven Engine  
**Frequência de Atualização:** 60 FPS (Visual Client-Side Interpolation) / Sincronizado por Timestamp Oficial  

---

## 1. Arquitetura do Motor

O motor do jogo Skybird foi projetado para separar estritamente **Autoridade Financeira** de **Animação Visual**:

```text
[ SERVIDOR POSTGRESQL / EDGE FUNCTION ]
   ├── 1. Gera e grava o Server Seed na base de dados
   ├── 2. Calcula o Server Seed Hash (SHA-256)
   ├── 3. Determina o Crash Point de forma determinística
   └── 4. Transiciona estados: WAITING -> RUNNING -> CRASHED -> WAITING

[ CLIENTE BROWSER (Canvas 3D / SkybirdCanvas) ]
   ├── 1. Recebe a confirmação de início da rodada e timestamp (started_at)
   ├── 2. Calcula o multiplicador visual com base no tempo decorrido: M(t) = 1.00 * e^(0.06 * t)
   ├── 3. Renderiza o voo 3D a 60 FPS sem requisições por frame ao banco
   └── 4. Envia o pedido de cashout ao servidor, que aprova ou rejeita com base no Crash Point oficial
```

---

## 2. Ciclo de Vida da Rodada

1. **`WAITING` (Fase de Apostas - 5 a 8 segundos):**
   * O hash do server seed é exposto para os jogadores.
   * Jogadores realizam apostas através do RPC `place_bet()`.
   * As apostas são travadas atómicamente na carteira.

2. **`RUNNING` (Fase de Voo):**
   * O pássaro descola. O multiplicador cresce exponencialmente.
   * O cliente permite acionar o botão de Cashout. O pedido é enviado instantaneamente via RPC `cashout_bet()`.

3. **`CRASHED` (Fase de Queda):**
   * Ao atingir o `crash_point` exato pré-determinado pelo servidor, a rodada encerra.
   * O `server_seed` original é **revelado publicamente** para verificação no painel Provably Fair.

---
*Motor do Jogo Skybird 3D documentado e ajustado para conformidade server-side.*
