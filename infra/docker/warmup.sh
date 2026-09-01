#!/bin/sh
# The image ships prerendered HTML for the ISR pages, produced at build time
# against an empty schema. It is stale the moment the stack starts, so the very
# first visitor would be served an empty page while Next regenerates it in the
# background — correct behaviour, terrible first impression.
#
# Two passes: the first triggers regeneration, the second confirms the page
# that replaced it is not empty.
set -eu

for pass in 1 2; do
  for locale in en ar; do
    node -e "
      fetch('http://web:3000/$locale')
        .then((r) => console.log('  /$locale → ' + r.status))
        .catch(() => console.log('  /$locale → unreachable'));
    "
  done
  [ "$pass" = "1" ] && sleep 3
done

echo "→ warm"
