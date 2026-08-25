# ---- Build stage: install deps with build toolchain for better-sqlite3 ----
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ---- Runtime stage: slim image ----
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY public ./public
COPY server ./server
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/server.js"]
