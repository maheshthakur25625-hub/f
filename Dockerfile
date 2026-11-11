FROM node:26-alpine
# The date keys the build cache so this layer installs today's OS fixes; AppJet keeps it current on deploy.
RUN echo "os-refresh 2026-11-11" && apk upgrade --no-cache
WORKDIR /app
# Fail the build (not the rollout) if this Node build has no SQLite driver.
RUN node -e "const { DatabaseSync } = process.getBuiltinModule('node:sqlite'); const d = new DatabaseSync(':memory:'); d.exec('create table t (a integer)'); d.prepare('insert into t values (?)').run(1); d.close(); console.log('node:sqlite ok');"
ENV DATA_DIR=/app/.data
RUN mkdir -p /app/.data
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV PORT=3000
EXPOSE 3000
# next start binds 0.0.0.0 and honors $PORT.
CMD ["npm","start"]
