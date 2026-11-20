FROM node:20.19.2-bookworm-slim@sha256:7cd3fbc830c75c92256fe1122002add9a1c025831af8770cd0bf8e45688ef661 AS node
FROM erlang:29.1.2.0@sha256:00fc474c15a1f89521550f9396088257e1f6a4c86edc33271310a2031fa20ff7

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && useradd --create-home --shell /bin/bash vscode

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/beam2js-playwright
WORKDIR /tmp/beam2js-deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && ./node_modules/.bin/playwright install --with-deps --only-shell chromium
WORKDIR /
RUN rm -rf /tmp/beam2js-deps
