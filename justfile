image := "ghcr.io/dotlabshq/flect-example-notes"

# Install dependencies (no build step — Node runs the TypeScript directly).
install:
    npm install

# Run locally against flect.local.json (flect dev writes it; :memory: works too).
dev: install
    node --experimental-strip-types src/index.ts

# Build context is this directory — the image is self-contained (deps from npm).
build-docker tag="latest": install
    docker build --platform linux/amd64 -t {{image}}:{{tag}} .

push-docker tag="latest":
    docker push {{image}}:{{tag}}

release-docker tag="latest":
    just build-docker {{tag}}
    just push-docker {{tag}}
