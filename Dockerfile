# One image: builds the client, compiles the API, and serves both from one origin.
FROM node:24-slim AS build
WORKDIR /app
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm ci --prefix server && npm ci --prefix client
COPY server server
COPY client client
RUN npm run build --prefix client && npm run build --prefix server

FROM node:24-slim
WORKDIR /app/server
ENV NODE_ENV=production PORT=4000 CLIENT_DIST=/app/client/dist
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/drizzle ./drizzle
COPY --from=build /app/client/dist /app/client/dist
USER node
EXPOSE 4000
# apply committed migrations (MIGRATE_DATABASE_URL = owner login), then start as DATABASE_URL
# (the app login from `npm run app-role:prod`); a failed migration stops the deploy
CMD ["npm", "run", "start:prod"]
