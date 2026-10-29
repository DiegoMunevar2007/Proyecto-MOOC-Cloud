# Compilación cruzada como en el Dockerfile de la API: el builder corre nativo y
# solo la etapa final, que instala ffmpeg, es de la arquitectura de destino.
FROM --platform=$BUILDPLATFORM golang:alpine AS builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -o /worker ./worker

FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates ffmpeg
COPY --from=builder /worker /app/worker
RUN chmod +x /app/worker
RUN addgroup -S app && adduser -S -G app app
USER app
EXPOSE 9101
CMD ["./worker"]
