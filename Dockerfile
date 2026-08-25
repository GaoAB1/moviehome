FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY public ./public
COPY server ./server
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/server.js"]
