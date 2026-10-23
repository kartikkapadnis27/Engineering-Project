FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM node:22-bookworm-slim AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY prisma/ /app/prisma/
COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npm run db:generate && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_URL=file:/data/codemarket.db \
    SERVE_CLIENT=true
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/node_modules/.prisma ./node_modules/.prisma
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/prisma /app/prisma
COPY --from=client-build /app/client/dist /app/client/dist
RUN mkdir -p /data /app/server/uploads/public /app/server/uploads/private \
    && chown -R node:node /data /app/server/uploads /app/client
USER node
EXPOSE 4000
CMD ["sh", "-c", "npm run db:deploy && npm start"]
