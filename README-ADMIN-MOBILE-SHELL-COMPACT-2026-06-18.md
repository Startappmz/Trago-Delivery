# Trago Delivery — Admin Mobile Shell Compacto

Alterações aplicadas ao painel do administrador para aproximar a experiência de um aplicativo móvel compacto, sem alterar backend, endpoints, autenticação ou contratos de API.

## Ficheiros alterados

- `index.html`
- `js/admin/admin.js`
- `admin-mobile-shell.css` — novo ficheiro carregado depois do `trago-system.css`

## Melhorias aplicadas

- Header mobile fixo e mais baixo.
- Títulos, textos, ícones, botões, inputs e cards mais compactos.
- Bottom navigation fixa com: Visão, Entregas, Novo, Equipa e Mais.
- Sheet mobile para escolher tipo de nova entrega.
- Sheet mobile para opções secundárias: Clientes, Custos, Cargos, Histórico, Mapa e Configurações.
- Cards estatísticos em duas colunas no mobile.
- Tabelas em modo card mais densas no mobile.
- Modais adaptados como bottom sheets compactos em ecrãs pequenos.
- Mapas, gráficos, formulários e zona de configurações com altura/espaçamento controlados.

## Segurança da alteração

- Nenhum endpoint foi alterado.
- Nenhuma rota de backend foi alterada.
- Nenhum ID funcional dos formulários/tabelas foi removido.
- O menu lateral antigo continua disponível pelo botão do topo.
- A nova navegação mobile apenas aciona os mesmos eventos já existentes no painel.
