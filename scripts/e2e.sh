#!/usr/bin/env bash
# Roda todos os testes E2E em sequência contra BASE_URL (padrão http://localhost:3100) e resume o resultado.
# Cada teste cria Lojas isoladas e apaga tudo no fim. Capturas de tela vão para $S (padrão: pasta temporária).
set -u
export S="${S:-$(mktemp -d)}"
falhas=0; resumo=""
for t in tests/e2e/*.js; do
  [ "$(basename "$t")" = "apoio.js" ] && continue
  # Integração real com o Asaas sandbox: só quando pedido (E2E_ASAAS=1)
  [ "$(basename "$t")" = "asaas-sandbox.js" ] && [ "${E2E_ASAAS:-}" != "1" ] && continue
  inicio=$(date +%s)
  if saida=$(node "$t" 2>&1); then
    resumo+="✔ $(basename "$t" .js) · $(grep -c '✔' <<<"$saida") passos · $(( $(date +%s) - inicio ))s"$'\n'
  else
    falhas=$((falhas + 1)); resumo+="✘ $(basename "$t" .js) · $(grep '✘' <<<"$saida" | head -1)"$'\n'
  fi
done
printf '%s' "$resumo"
echo "Capturas: $S"
exit $falhas
