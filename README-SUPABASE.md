# Trago Delivery — Migração para Supabase

Esta versão remove a dependência directa de MongoDB/Mongoose no backend e passa a gravar os dados no Supabase/Postgres através da REST API do Supabase.

## O que foi alterado

- `backend/config/db.js` agora valida a ligação ao Supabase.
- `backend/config/supabase.js` contém o cliente REST seguro para o servidor.
- `backend/lib/supabaseModel.js` cria uma camada compatível com os controllers existentes.
- `backend/models/*` deixaram de usar Mongoose e agora apontam para tabelas Supabase.
- `backend/server.js` passou a exigir `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `JWT_SECRET`.
- `js/common/api.js` deixou de apontar para o antigo domínio Render hardcoded.
- Foi adicionado o schema em `backend/supabase/schema.sql`.

## Importante sobre Render

Supabase substitui a base de dados MongoDB. Contudo, este projecto ainda usa Express, Socket.IO, upload local de imagens e JWT próprio. Por isso, ainda precisas de hospedar o backend Node.js em algum lugar: Render, Railway, VPS, Fly.io, etc.

Para remover Render a 100%, seria necessário uma segunda fase: reescrever as rotas Express como Supabase Edge Functions, trocar Socket.IO por Supabase Realtime/Broadcast e mover uploads para Supabase Storage.

## Passo 1 — Criar as tabelas no Supabase

1. Entra no Supabase Dashboard.
2. Abre o teu projecto.
3. Vai para `SQL Editor`.
4. Cria uma nova query.
5. Cola todo o conteúdo de:

```txt
backend/supabase/schema.sql
```

6. Executa a query.

## Passo 2 — Configurar variáveis de ambiente no backend

Cria um ficheiro `backend/.env` localmente ou adiciona estas variáveis no painel do teu host:

```env
SUPABASE_URL=https://TEU-PROJECT-REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_COLOCA_AQUI_A_TUA_CHAVE_NOVA
JWT_SECRET=cria_uma_chave_longa_e_forte_aqui
JWT_EXPIRES_IN=30d
FRONTEND_URL=http://localhost:5500
FRONTEND_URL_DEV=http://127.0.0.1:5500
PORT=3000
NODE_ENV=development
```

Nunca coloques `SUPABASE_SECRET_KEY` no front-end. A chave secreta só pode ficar no servidor.

## Passo 3 — Instalar e executar

```bash
cd backend
npm install
npm run dev
```

O backend deve mostrar algo como:

```txt
Supabase conectado e tabelas principais verificadas.
Servidor a correr na porta 3000
```

## Passo 4 — Criar dados demo

Depois das tabelas estarem criadas e as variáveis configuradas:

```bash
cd backend
node scripts/seedDemo.js
```

Credenciais demo criadas:

| Perfil | Email | Senha |
|---|---|---|
| Admin | admin@tragodelivery.co.mz | admin123 |
| Motorista | carlos@tragodelivery.co.mz | driver123 |
| Gestor | gestor@tragodelivery.co.mz | gestor123 |

## Passo 5 — Front-end

O ficheiro `js/common/api.js` agora funciona assim:

- Em localhost: usa `http://localhost:3000`.
- Em produção no mesmo domínio: usa `window.location.origin`.
- Em produção com front-end separado: define isto antes de carregar `js/common/api.js`:

```html
<script>
  window.TRAGO_API_URL = 'https://teu-backend.com';
</script>
```

## Sobre a chave Supabase enviada no chat

A chave secreta foi exposta nesta conversa. Por segurança, no Supabase cria uma nova secret key e revoga a antiga. Usa a nova somente em `SUPABASE_SECRET_KEY` no servidor.

---

## Fase 2 adicionada

A migração para Supabase Edge Functions, Supabase Realtime e Supabase Storage foi adicionada em:

```txt
README-SUPABASE-FASE2.md
supabase/functions/api/index.ts
supabase/config.toml
backend/supabase/edge_realtime_storage.sql
js/common/supabaseRealtime.js
```

Para a nova arquitectura, consulta primeiro `README-SUPABASE-FASE2.md`.
