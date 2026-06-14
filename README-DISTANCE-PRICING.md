# Trago Delivery - actualização de pontos e preço por distância

Esta versão adiciona ao fluxo actual de Admin/Motorista:

- Ponto de recolha.
- Ponto de entrega.
- Sugestões de moradas no formulário de nova entrega.
- Cálculo de distância entre recolha e entrega.
- Taxa de entrega por distância somada ao preço do serviço.

## Política aplicada

- 200 MZN até 11,6 km.
- +15 MZN por cada 1 km excedente.
- O preço final do pedido passa a ser: preço do serviço + taxa de distância.

## Supabase SQL obrigatório

No Supabase Dashboard > SQL Editor, execute:

```sql
backend/supabase/distance_pricing.sql
```

## Edge Function

Depois de actualizar o SQL, publique novamente:

```txt
supabase/functions/api/index.ts
```

## Google Maps opcional

Para usar Google Places Autocomplete e Google Routes API com modo TWO_WHEELER:

1. No front-end, configure em `js/common/supabaseConfig.js`:

```js
window.TRAGO_GOOGLE_MAPS_API_KEY = 'SUA_BROWSER_KEY_RESTRITA';
```

2. Nas Edge Function Secrets, configure:

```env
TRAGO_GOOGLE_MAPS_API_KEY=SUA_SERVER_KEY_RESTRITA
```

Sem esta chave, o sistema continua a funcionar com fallback: sugestões via OpenStreetMap/Nominatim e cálculo estimado por coordenadas.
