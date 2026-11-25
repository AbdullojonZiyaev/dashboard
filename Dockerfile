# Builds the dashboard and serves it with nginx. No dist/ needed on the server:
#   git pull && docker compose up -d --build

# ---- 1. build ----
FROM node:22-alpine AS build
WORKDIR /app
# Dependencies first, so this layer is reused when only the source changes
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Optional build-time settings (see .env.example); empty = defaults
ARG VITE_WS_URL=
ARG VITE_BACKEND_URL=
ENV VITE_WS_URL=$VITE_WS_URL VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN npm test && npm run build

# ---- 2. serve ----
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
