# Arrow agent worker (Nemotron agents + Tiger bridge). Needs no inbound port.
# Deploy anywhere that runs a container 24/7 (Railway, Render, Fly.io, a VM).
# Required env: SPACETIME_HOST, SPACETIME_OPS_DB, AGENT_TOKEN, NVIDIA_API_KEY,
# NEMOTRON_MODEL, TIGER_DATABASE_URL (see .env.example).
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
CMD ["npx", "tsx", "src/supervise.ts"]
