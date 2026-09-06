# SKY-BIRD

**SKY-BIRD** é a plataforma 3D Crash Game do projeto AngoCredit, com foco em uma arquitetura server-authoritative, autenticação real via Supabase e operações financeiras protegidas por PostgreSQL/RLS/RPC.

## Identidade oficial

- **Produto:** SKY-BIRD
- **Tipo:** 3D Crash Game
- **Repositório:** `AngoCredit/SKY-BIRD`
- **Frontend:** React + Vite + TypeScript
- **Backend/autoridade:** Supabase + PostgreSQL
- **Deploy:** Vercel

## Segurança e autoridade

O fluxo de produção está a ser endurecido para que resultados de jogo, apostas, cashout e movimentos financeiros sejam determinados no lado servidor e protegidos por políticas de acesso e transações atómicas.

> **Importante:** um deployment concluído não significa, por si só, que o sistema esteja autorizado para operação com dinheiro real. A validação de produção deve confirmar a configuração real do Supabase, RLS/RPC, autoridade das rodadas, liquidação financeira e autenticação.

## Ambiente

Nunca versionar credenciais reais, `DATABASE_URL`, passwords de banco, service-role keys ou outras chaves privadas. As variáveis públicas do cliente devem conter apenas configuração destinada ao navegador.
