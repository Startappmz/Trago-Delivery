# Trago Delivery — Fase 2 Supabase

Esta fase move o projecto para uma arquitectura mais próxima de Supabase puro:

1. Rotas `/api/...` em **Supabase Edge Functions**.
2. Substituição de **Socket.IO** por **Supabase Realtime Broadcast**.
3. Upload de imagens das encomendas para **Supabase Storage**.
4. Render/Express passa a ser legado/fallback, não o caminho principal.

---

## 1. Ficheiros novos/importantes

```txt
supabase/config.toml
supabase/functions/api/index.ts
backend/supabase/edge_realtime_storage.sql
js/common/api.js
js/common/supabaseRealtime.js
js/common/supabaseConfig.example.js
```

A Edge Function principal chama-se `api` e foi feita para manter compatibilidade com chamadas antigas como:

```txt
/api/auth/login
/api/orders
/api/orders/active
/api/drivers/live-locations
/api/realtime/driver-location
```

O front-end continua a usar `fetch(`${API_URL}/api/...`)`, mas agora `API_URL` deve apontar para:

```txt
https://kxpfuenotwqxmtcfbyid.supabase.co/functions/v1/api
```

---

## 2. Segurança imediata

A chave que começa por `sb_secret_...` ou `service_role` **NUNCA** deve ser colocada no front-end.

No front-end usa apenas:

```js
window.TRAGO_SUPABASE_URL = 'https://kxpfuenotwqxmtcfbyid.supabase.co';
window.TRAGO_SUPABASE_ANON_KEY = 'sb_publishable_kJqJXmIiEVDKDKGIcZjXLQ_OYAwl-EX';
```

No Supabase Edge Function Secrets usa a chave secreta:

```bash
supabase secrets set SUPABASE_URL="https://kxpfuenotwqxmtcfbyid.supabase.co"
supabase secrets set SUPABASE_SECRET_KEY="sb_secret_NOVA_CHAVE_AQUI"
supabase secrets set JWT_SECRET="UMA_CHAVE_LONGA_E_FORTE"
supabase secrets set STORAGE_BUCKET_ORDER_IMAGES="order-images"
```

Se a chave secreta já foi exposta numa conversa, revoga/roda essa chave no Supabase e cria uma nova.

---

## 3. SQL necessário

No Supabase Dashboard > SQL Editor, executa primeiro:

```txt
backend/supabase/schema.sql
```

Depois executa:

```txt
backend/supabase/edge_realtime_storage.sql
```

Este segundo ficheiro cria/actualiza:

- bucket `order-images`;
- policy pública de leitura para imagens;
- publicação Realtime para `orders`, `driver_profiles` e `trips`.

---

## 4. Instalar Supabase CLI

Instala e autentica:

```bash
npm install -g supabase
supabase login
```

Liga o projecto local ao projecto Supabase:

```bash
supabase link --project-ref SEU_PROJECT_REF
```

---

## 5. Deploy da Edge Function

Na raiz do projecto:

```bash
supabase functions deploy api
```

O ficheiro `supabase/config.toml` já contém:

```toml
[functions.api]
verify_jwt = false
```

Isto é obrigatório porque o Trago Delivery usa JWT próprio. Se `verify_jwt` estiver activo, o gateway da Supabase tentará validar o token como Supabase Auth JWT e as chamadas do painel podem falhar.

---

## 6. Configurar front-end

Cria um ficheiro real a partir do exemplo:

```txt
js/common/supabaseConfig.example.js -> js/common/supabaseConfig.js
```

Conteúdo:

```js
window.TRAGO_SUPABASE_URL = 'https://kxpfuenotwqxmtcfbyid.supabase.co';
window.TRAGO_SUPABASE_ANON_KEY = 'sb_publishable_kJqJXmIiEVDKDKGIcZjXLQ_OYAwl-EX';
```

Depois inclui este ficheiro antes de `js/common/api.js` em:

```txt
index.html
painel-de-entrega.html
login.html
login-motorista.html
```

Exemplo:

```html
<script src="js/common/supabaseConfig.js"></script>
<script src="js/common/api.js"></script>
```

Se preferires, podes definir as variáveis directamente com script inline antes de `api.js`.

---

## 7. O que foi substituído

### Antes

```txt
Front-end -> Render/Express -> MongoDB
Socket.IO -> Render server
Uploads -> backend/uploads
```

### Agora

```txt
Front-end -> Supabase Edge Function -> Supabase Postgres
Supabase Realtime Broadcast -> eventos em tempo real
Supabase Storage -> imagens das encomendas
```

---

## 8. Rotas Realtime novas

Estas rotas são chamadas pelo front-end para substituir os eventos que antes iam por Socket.IO:

```txt
POST /api/realtime/driver-online
POST /api/realtime/driver-offline
POST /api/realtime/driver-location
```

Eventos emitidos via Supabase Realtime:

```txt
admin_room:
  order_pending
  orders_changed
  pickup_started
  pickup_completed
  delivery_started
  delivery_completed
  order_canceled
  driver_status_changed
  driver_location_broadcast
  driver_disconnected_broadcast

motorista:
  driver:{USER_ID}
    nova_entrega_atribuida
    entrega_cancelada
```

---

## 9. Limitações honestas desta fase

1. A Edge Function não usa `sharp`, portanto as imagens já não são optimizadas no servidor como antes. Agora são enviadas directamente para Supabase Storage, respeitando o limite de tamanho.
2. O estado offline automático ao fechar o browser depende de `beforeunload`, que nem sempre é 100% garantido em todos os browsers. Para produção crítica, o ideal é adicionar um sistema de heartbeat/TTL.
3. A autenticação continua a ser JWT próprio do Trago Delivery, não Supabase Auth. Isto preserva o painel actual, mas numa fase futura pode ser migrado para Supabase Auth.
4. O backend Express antigo foi mantido como referência/fallback. O caminho principal novo é `supabase/functions/api/index.ts`.

---

## 10. Checklist de teste

1. Executar SQL base.
2. Executar SQL Storage/Realtime.
3. Configurar secrets da Edge Function.
4. Deploy da função `api`.
5. Configurar `TRAGO_SUPABASE_URL` e `TRAGO_SUPABASE_ANON_KEY` no front-end.
6. Fazer login admin.
7. Criar cliente.
8. Registar motorista.
9. Fazer login motorista.
10. Permitir localização.
11. Confirmar se o admin vê localização no mapa.
12. Criar encomenda com imagem.
13. Confirmar se imagem fica no bucket `order-images`.
14. Atribuir encomenda.
15. Confirmar se motorista recebe notificação em tempo real.
16. Executar fluxo: recolha iniciada, recolha concluída, entrega iniciada, entrega concluída.
17. Confirmar dashboard financeiro e histórico.
