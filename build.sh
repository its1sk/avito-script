#!/bin/sh
# Сборка мобильной версии: avito.user.js → avito-mobile.user.js (terser), ссылки обновления — на мобильный файл.
# Запуск: sh build.sh
set -e
cd "$(dirname "$0")"
TMP=$(mktemp -d)
# шапка — до строки ==/UserScript== включительно (длина шапки больше не важна)
sed -n '1,/==\/UserScript==/p' avito.user.js | sed 's#/main/avito\.user\.js#/main/avito-mobile.user.js#' > "$TMP/hdr.txt"
sed '1,/==\/UserScript==/d' avito.user.js > "$TMP/body.js"
npx --yes terser@5 "$TMP/body.js" -c -m --ecma 2020 -o "$TMP/body.min.js"
cat "$TMP/hdr.txt" "$TMP/body.min.js" > avito-mobile.user.js
# Переходный файл: по этой ссылке v4.9 могла быть установлена — отдаём по ней ту же мобильную версию,
# дальше Tampermonkey обновляется уже с avito-mobile.user.js. Можно удалить, когда телефон перейдёт на новую ссылку.
cp avito-mobile.user.js avito-v4.9-mobile.user.js
rm -rf "$TMP"
node --check avito-mobile.user.js
echo "Готово: avito-mobile.user.js ($(wc -c < avito-mobile.user.js) байт)"
