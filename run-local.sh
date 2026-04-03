#!/usr/bin/env sh

set -eu

if [ ! -d node_modules ]; then
    npm install
fi

npm start