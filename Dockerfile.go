FROM node:20-alpine AS web-builder

WORKDIR /src
COPY package.json ./
COPY packages/api-client ./packages/api-client
COPY web ./web
WORKDIR /src/web
RUN npm install --legacy-peer-deps && npm run build

FROM rust:1.83-alpine AS rust-builder

RUN apk add --no-cache musl-dev
WORKDIR /build
COPY crates/flowforge-solver ./crates/flowforge-solver
WORKDIR /build/crates/flowforge-solver
RUN cargo build --release

FROM golang:1.25-alpine AS go-builder

WORKDIR /build
RUN apk add --no-cache git

COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN go mod tidy && go mod download

RUN CGO_ENABLED=0 go build -o /flowforge ./cmd/flowforge

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=go-builder /flowforge /app/flowforge
COPY --from=rust-builder /build/crates/flowforge-solver/target/release/flowforge-solver /app/flowforge-solver
COPY --from=web-builder /src/web/dist /app/web/dist
COPY assets/static /app/assets/static
COPY assets/templates /app/assets/templates
# Optional APK bundle from CI (apk-release/FlowForge.apk). Empty dir is fine for local image builds.
COPY apk-release/ /app/data/apk/

ENV FLOWFORGE_DATA_DIR=/app/data \
    FLOWFORGE_PORT=8000 \
    FLOWFORGE_STATIC_DIR=/app/assets/static \
    FLOWFORGE_TEMPLATES_DIR=/app/assets/templates \
    FLOWFORGE_WEB_DIST=/app/web/dist \
    FLOWFORGE_SOLVER_BIN=/app/flowforge-solver \
    FLOWFORGE_SCHEDULER_ENGINE=go \
    FLOWFORGE_APK_GITHUB_REPO=eklier101/flowforge

EXPOSE 8000
ENTRYPOINT ["/app/flowforge"]
