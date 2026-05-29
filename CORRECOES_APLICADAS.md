# Correções aplicadas

## 1. Tabelas no mobile
- As tabelas do admin agora passam para formato de cartões em ecrãs pequenos.
- O layout desktop foi mantido.
- Foi adicionada uma rotina JavaScript que coloca automaticamente os rótulos das colunas em cada célula no mobile.

## 2. Método de pagamento
- Corrigido o backend para aceitar e guardar corretamente `payment_method`.
- Antes, o validador removia este campo e o sistema caía sempre no valor padrão `cash`.
- Histórico, extrato e detalhes agora usam labels consistentes para Dinheiro, M-Pesa, E-Mola, M-Kesh e Transferência Bancária.

## 3. Motoristas no mapa em tempo real
- Adicionado armazenamento da última localização do motorista no perfil.
- Adicionado endpoint de fallback: `GET /api/drivers/live-locations`.
- O mapa agora usa socket em tempo real e também sincronização periódica com o backend.
- Estados `online_livre`, `online_ocupado`, `em_recolha` e `em_entrega` são considerados online para mapa e dashboard.

## 4. Dashboard e Desempenho dos Serviços
- Corrigida a contagem de encomendas em trânsito.
- Corrigida a contagem de motoristas online.
- O gráfico de desempenho agora recebe sempre os serviços em ordem fixa, mesmo quando algum serviço não tem dados.
- O gráfico foi ajustado para separar pedidos e receita em eixos diferentes, evitando leituras falsas.
- Foi reforçada a destruição de instâncias antigas do Chart.js para evitar falhas de renderização.

## Validação feita
- Todos os ficheiros JavaScript principais do frontend e backend passaram em `node --check`.
- Não foi feito teste de base de dados em produção porque este ambiente não tem acesso ao projecto Supabase real.

## Segunda revisão — layout corporate, sharp e controlo de altura

- Corrigido o problema visual das páginas com gráficos/tabelas que criavam sensação de scroll vertical sem fim.
- Os gráficos agora têm altura fixa e controlada no desktop, tablet e mobile.
- As tabelas principais passaram a ter área interna com scroll próprio, evitando que a página inteira se estique indefinidamente quando existem muitos registos.
- Mantido o comportamento mobile em formato de cartões para leitura, mas agora com altura controlada e sem cantos arredondados.
- Aplicado um visual mais sério/corporate: fundo mais limpo, sidebar navy, cards brancos, bordas sóbrias, sombras leves e paleta operacional verde/navy/âmbar.
- Removidos cantos arredondados de cards, tabelas, inputs, botões, badges e contentores principais para uma estética sharp/compacta.
- Reduzidos espaçamentos, tamanhos de fonte e alturas dos cards para um dashboard mais compacto.
- Gráficos reforçados para limpar dimensões inline antigas do Chart.js antes de recriar instâncias, evitando crescimento cumulativo.
- Validação feita com `node --check` nos ficheiros JavaScript principais.
