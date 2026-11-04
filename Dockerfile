# syntax=docker/dockerfile:1

# ---- Build: Node + npm run only inside this stage (nothing needs to be installed on the host) ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Empty = the browser calls the API on the same origin it loaded the UI from (nginx forwards /api/ to the
# backend, see docker/nginx.conf.template). Set it only to point the UI at an API on another origin.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- Runtime: static files served by nginx, non-root, listening on 8080 ----
FROM nginxinc/nginx-unprivileged:1.28-alpine
# Where nginx forwards /api/. "backend" is the docker-compose service name in job-hunter-server.
ENV BACKEND_URL=http://backend:8080
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
