#!/usr/bin/env bash

set -euo pipefail

# agarra el primer renglon del mensaje desde el archivo temporal
commit_msg=""
if [[ -n "${1:-}" && -f "$1" ]]; then
  commit_msg="$(head -n 1 "$1" | tr -d '\r\n')"
fi

# fallback usando la variable que deja lefthook
if [[ -z "$commit_msg" && -n "${LEFTHOOK_COMMIT_MSG:-}" ]]; then
  commit_msg="$(printf '%s' "$LEFTHOOK_COMMIT_MSG" | head -n 1 | tr -d '\r\n')"
fi

# ultimo intento directo desde git
if [[ -z "$commit_msg" && -f .git/COMMIT_EDITMSG ]]; then
  commit_msg="$(head -n 1 .git/COMMIT_EDITMSG | tr -d '\r\n')"
fi

# si no hay nada o es solo comentario terminamos
if [[ -z "$commit_msg" ]] || printf '%s' "$commit_msg" | grep -qE '^#'; then
  printf '[warn] mensaje vacio, me salto el chequeo.\n'
  exit 0
fi

printf '[check] revisando commit: "%s"\n' "$commit_msg"

# <tipo>(scope opcional): descripcion opcional
# ejemplos válidos:
#   git
#   git(merge)
#   fix: arreglar bug raro
#   feat(api): agregar endpoint nuevo
if ! printf '%s' "$commit_msg" | grep -qE \
  '^(git(\([^)]+\))?|((build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?: .+))$'; then
  printf '[fail] formato raro, spec mínima:\n'
  printf 'usa: <tipo>(scope opcional): descripcion opcional\n'
  printf 'tipos validos: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test, git\n'
  printf 'ejemplos validos:\n'
  printf '  git(merge)\n'
  printf '  fix: arreglar bug raro\n'
  printf '  feat(api): agregar endpoint nuevo\n'
  printf 'tu mensaje: "%s"\n' "$commit_msg"
  exit 1
fi

printf '[ok] todo piola con el commit.\n'
