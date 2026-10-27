# El compilador corre en la arquitectura de quien construye y Go genera el
# binario de la de destino: desde un Mac ARM se publica linux/amd64 sin emular
# la compilación, que con QEMU tarda varias veces más.
FROM --platform=$BUILDPLATFORM golang:alpine AS builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -o main .

FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/main /app/main
RUN chmod +x /app/main
EXPOSE 8080
CMD ["./main"]
