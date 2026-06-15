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

## OpenStreetMap/OpenRouteService opcional

Para usar Nominatim/OpenStreetMap Autocomplete e OpenRouteService Directions API com modo TWO_WHEELER:

1. No front-end, configure em `js/common/supabaseConfig.js`:

```js
// Não é necessária chave Google no front-end. As sugestões usam Nominatim/OpenStreetMap.
```

2. Nas Edge Function Secrets, configure:

```env
TRAGO_ORS_API_KEY=SUA_CHAVE_GRATUITA_OPENROUTESERVICE
```

Sem esta chave, o sistema continua a funcionar com fallback: sugestões via OpenStreetMap/Nominatim e cálculo estimado por coordenadas.


## Atualização ORS gratuita

Esta versão não depende de `TRAGO_GOOGLE_MAPS_API_KEY`.

No Supabase, configure apenas:

```env
TRAGO_ORS_API_KEY=SUA_CHAVE_GRATUITA_OPENROUTESERVICE
```

O front-end usa Nominatim/OpenStreetMap para sugestões de endereço e a Edge Function usa OpenRouteService para calcular a distância rodoviária. Se a chave ORS estiver ausente ou a API falhar, o sistema usa uma estimativa local por coordenadas como fallback controlado.
