# Trago Delivery — Mobile Shell do Painel do Motorista

Intervenção aplicada apenas no frontend do painel do motorista, mantendo os IDs, endpoints e fluxos principais existentes.

## Ficheiros alterados

- `painel-de-entrega.html`
- `driver.css`
- `js/driver/driver.js`
- `js/driver/driverTracking.js`

## Melhorias aplicadas

1. Header convertido para app bar compacta com estado de GPS.
2. Navegação inferior fixa com Entregas, Ganhos, Conta e Sair.
3. Nova home do motorista com hero, estado operacional e botão de actualização.
4. Estado vazio mais profissional para quando não há entregas pendentes.
5. Cards de entrega redesenhados para leitura rápida no telemóvel.
6. Página de ganhos com chips Hoje/Semana/Mês e extracto em formato de cartões no mobile.
7. Configurações reorganizadas em lista mobile, com alteração de senha em acordeão.
8. Detalhe da entrega com chip de estado e acções rápidas: rota de recolha, rota de entrega, chamadas e WhatsApp quando os dados existirem.
9. Estado de GPS sincronizado com os eventos reais do tracking.
10. Mantida compatibilidade com `showDriverPage`, `loadMyDeliveries`, `loadMyEarnings`, `fillDetalheEntrega` e os endpoints já existentes.

## Nota de segurança

A alteração é visual/UX e não mexe na autenticação, base de dados, rotas do backend ou contratos de API.
