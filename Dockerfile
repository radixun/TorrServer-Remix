# Builds this fork from source. The optional Node media worker is separate.
FROM node:24-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY web/ ./
ENV NODE_OPTIONS=--openssl-legacy-provider GENERATE_SOURCEMAP=false REACT_APP_SERVER_HOST=""
RUN yarn build

FROM golang:1.25-bookworm AS server
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG TARGETVARIANT
ARG FORK_VERSION=MatriX.145.1-mod
WORKDIR /src
COPY gen_web.go ./
COPY server/ ./server/
COPY --from=web /src/web/build ./web/build
RUN go run gen_web.go
WORKDIR /src/server
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH GOARM=${TARGETVARIANT#v} \
    go build -tags=nosqlite -trimpath \
    -ldflags="-s -w -checklinkname=0 -X server/version.Version=$FORK_VERSION" -o /torrserver ./cmd

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=server /torrserver /usr/bin/torrserver
COPY docker-entrypoint.sh /docker-entrypoint.sh
ENV TS_CONF_PATH=/opt/ts/config TS_LOG_PATH=/opt/ts/log TS_TORR_DIR=/opt/ts/torrents TS_PORT=8090
EXPOSE 8090
ENTRYPOINT ["/docker-entrypoint.sh"]
