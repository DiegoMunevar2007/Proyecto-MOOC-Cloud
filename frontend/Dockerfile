# El build produce archivos estáticos, iguales en cualquier arquitectura: corre
# nativo en la máquina que construye ($BUILDPLATFORM) y solo la etapa final,
# nginx, es de la plataforma de destino. Desde un Mac ARM no se emula nada.
FROM --platform=$BUILDPLATFORM node:lts-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
