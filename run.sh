#!/usr/bin/env sh

set -eu

IMAGE_NAME="drones-project-gemini"
CONTAINER_NAME="drones-project-gemini"

docker build -t "$IMAGE_NAME" -f Dockerfile .

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

docker run --rm -p 4173:4173 --name "$CONTAINER_NAME" "$IMAGE_NAME"