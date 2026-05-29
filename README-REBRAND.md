# Trago Delivery — Rebrand Front-End

Esta versão aplica o rebrand definido no ficheiro `trago_rebrand_prompt.html`.

## Alterações principais

- Removido modo escuro em todas as páginas.
- Removidos efeitos glassmorphism, blur, orbs, radial-gradients animados e 3D tilt.
- Removida a fonte Space Mono.
- Adicionadas as fontes Plus Jakarta Sans e DM Sans.
- Reorganizada a arquitectura CSS:
  - `tokens.css`
  - `base.css`
  - `layout.css`
  - `components.css`
  - `dashboard.css`
  - `driver.css`
  - `login.css`
- Eliminados os ficheiros CSS antigos conflituosos:
  - `global.css`
  - `trago-system.css`
  - `compact-tailwind.css`
- Mantidos os ficheiros JS principais e a lógica operacional.
- Corrigido menu mobile sem blur e sem bloqueio permanente de scroll.
- Refeito o sistema visual de cards, tabelas, formulários, botões, modais, sidebar, login e painel do motorista.

## Paleta base

- Verde principal: `#2F7A3C`
- Verde médio: `#3DAA50`
- Verde claro mantido: `#8DC543`
- Âmbar: `#C97813`
- Âmbar médio: `#F6A226`
- Fundo: `#F7F8F3`
- Superfície: `#FFFFFF`
- Texto principal: `#272324`
- Texto secundário: `#50494B`

## Notas

Depois de substituir os ficheiros no servidor, limpar cache do navegador com `Ctrl + F5`.
