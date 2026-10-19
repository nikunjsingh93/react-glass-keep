# --- Pinned CPU inference engine (model weights are downloaded only on first use)
FROM --platform=$BUILDPLATFORM debian:trixie-slim AS llama-builder
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl cmake ninja-build g++ libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /llama
RUN curl -fsSL https://github.com/ggml-org/llama.cpp/archive/620d2225cc436ab0b001e3200e590e3b286ef9ab.tar.gz | tar xz --strip-components=1
RUN case "$TARGETARCH" in \
      amd64) package=g++-x86-64-linux-gnu; triple=x86_64-linux-gnu; processor=x86_64 ;; \
      arm64) package=g++-aarch64-linux-gnu; triple=aarch64-linux-gnu; processor=aarch64 ;; \
      *) exit 1 ;; esac \
    && apt-get update && apt-get install -y --no-install-recommends "$package" \
    && cmake -S . -B build -G Ninja -DCMAKE_SYSTEM_NAME=Linux -DCMAKE_SYSTEM_PROCESSOR="$processor" -DCMAKE_C_COMPILER="$triple-gcc" -DCMAKE_CXX_COMPILER="$triple-g++" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON -DGGML_BACKEND_DL=ON -DGGML_NATIVE=OFF -DGGML_CPU_ALL_VARIANTS=ON -DLLAMA_BUILD_UI=OFF -DLLAMA_BUILD_NUMBER=11669 -DLLAMA_BUILD_COMMIT=620d2225 -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON \
    && cmake --build build --target llama-server -j 4

# --- Build stage
FROM node:24-trixie-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ 

COPY ["package.json", "package-lock.json", "./"]
RUN npm ci

COPY ["index.html", "vite.config.js", "postcss.config.js", "./"]
COPY ["src", "src"]
COPY ["public", "public"]
COPY ["server", "server"]

# Safety: ensure no nested node_modules from host
RUN rm -rf server/node_modules

RUN npm run build
RUN npm prune --omit=dev

# --- Runtime
FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=llama-builder /llama/build/bin/ /opt/llama/
ENV LLAMA_SERVER_BIN=/opt/llama/llama-server
ENV LD_LIBRARY_PATH=/opt/llama
RUN ln -s /opt/llama/llama-server /usr/local/bin/llama-server

COPY --from=builder /app/node_modules ./node_modules
COPY ["server", "server"]
COPY --from=builder /app/dist ./dist
COPY ["package.json", "package-lock.json", "./"]

RUN mkdir -p /app/data

ENV API_PORT=8080
ENV DB_FILE=/app/data/notes.db
EXPOSE 8080
CMD ["node", "server/index.js"]
