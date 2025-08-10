# --- Build stage
FROM node:18-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY ["package.json", "package-lock.json", "./"]
RUN npm ci

COPY ["index.html", "vite.config.js", "./"]
COPY ["src", "src"]
COPY ["public", "public"]
COPY ["server", "server"]

# Safety: ensure no nested node_modules from host
RUN rm -rf server/node_modules

RUN npm run build
RUN npm prune --omit=dev

# --- Runtime
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY ["server", "server"]
COPY --from=builder /app/dist ./dist
COPY ["package.json", "package-lock.json", "./"]

RUN mkdir -p /app/data

ENV API_PORT=8080
ENV DB_FILE=/app/data/notes.db
EXPOSE 8080
CMD ["node", "server/index.js"]
