# Trago Delivery — versão redesenhada compacta

Esta versão mantém o projecto em **HTML, CSS e JavaScript puro**, com **Tailwind via CDN**, sem React e sem build step no frontend.

## O que foi corrigido

- Backend Express preservado, com camada de dados migrada para Supabase/Postgres. Ver README-SUPABASE.md.
- Role `manager` adicionada ao model `User`.
- Middleware `adminOrManager` criado.
- Rotas `/api/managers` montadas no servidor.
- Rotas `/api/expenses` montadas no servidor.
- Rota `DELETE /api/admin/orders/history` protegida com `protect + admin`.
- Exportação financeira adicionada em `GET /api/admin/export-financial`.
- Rotas de viagens admin ligadas ao `adminTripController`.
- API_URL deixou de estar hardcoded para Render; agora detecta localhost/produção.
- Frontend redesenhado com UI compacta, moderna, responsiva e interactiva.
- Tailwind CDN adicionado às páginas principais.
- CSS compacto novo em `compact-tailwind.css`, sem quebrar os IDs usados pelo JS.
- Painel de gestores ligado ao backend dentro da página `Cargos`.
- Confirmação rigorosa para apagar gestor.
- Seed demo criado.

## Como correr

### 1. Entrar no backend

```bash
cd backend
```

### 2. Criar `.env`

No Windows CMD:

```bash
copy .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Confirma que `SUPABASE_URL` e `SUPABASE_SECRET_KEY` estão configurados. Ver README-SUPABASE.md.

### 3. Instalar dependências

```bash
npm install
```

### 4. Criar dados demo

```bash
npm run seed
```

### 5. Arrancar o servidor

```bash
npm start
```

Depois abre:

```txt
http://localhost:3000/login.html
```

Também podes abrir directamente:

```txt
http://localhost:3000/index.html
http://localhost:3000/login-motorista.html
http://localhost:3000/painel-de-entrega.html
```

## Credenciais demo

Admin:

```txt
Email: admin@tragodelivery.co.mz
Senha: admin123
```

Motorista:

```txt
Email: carlos@tragodelivery.co.mz
Senha: driver123
```

Gestor:

```txt
Email: gestor@tragodelivery.co.mz
Senha: gestor123
```

## Observação importante

O frontend continua em HTML/CSS/JS puro. A UI usa Tailwind via CDN e um ficheiro de skin compacto. Nenhuma função foi convertida para React.
