# ALGORITMO E AUDITORIA PROVABLY FAIR (SKYBIRD 3D CRASH GAME)

**Status:** Algoritmo Criptográfico Auditável (HMAC-SHA256)  

---

## 1. Como Funciona a Honestidade Comprovável

O Skybird 3D utiliza o algoritmo criptográfico **Provably Fair**, garantindo que o resultado de cada rodada é 100% justo, pré-determinado e imodificável pela casa ou por terceiros.

```text
1. ANTES DA RODADA:
   - O Servidor gera uma string aleatória secreta (Server Seed).
   - O Servidor calcula a hash SHA-256 dessa string (Server Seed Hash).
   - A hash (Server Seed Hash) é exibida publicamente para o jogador ANTES de a aposta ser feita.

2. DURANTE A RODADA:
   - O ponto de crash é calculado usando a combinação HMAC:
     HMAC_SHA256(Server_Seed, Client_Seed + Nonce)

3. APÓS A RODADA:
   - O Server Seed secreto é REVELADO.
   - Qualquer jogador pode colar o Server Seed na calculadora Provably Fair do site.
   - Ao calcular a SHA-256 do Server Seed revelado, a hash obtida será IDÊNTICA à hash publicada antes da rodada.
```

---

## 2. Como Verificar no Site

1. Abra o histórico de rodadas no painel do jogo.
2. Clique no ícone de escudo 🛡️ de qualquer rodada anterior.
3. Copie o **Server Seed**, o **Client Seed** e o **Nonce**.
4. Clique em **"Verificar Hash"**. O sistema re-executa a hash em tempo real e confirma o selo verde de **Rodada 100% Autêntica**.

---
*Documentação de Provably Fair finalizada.*
