# One image, two services.
#
# The proxy and the target ship as the same artifact and differ only in the
# command Cloud Run runs. That is deliberate: it removes "the images drifted" as
# an explanation for any behavioural difference between them, and it halves the
# build surface for a bounded experiment.
#
# Digest-pinned rather than tag-pinned. A tag is mutable, and an experiment whose
# base image can change underneath it is not reproducible. This is node:22-alpine
# as resolved on 2026-08-13.
FROM node@sha256:5539840ce9d013fa13e3b9814c9353024be7ac75aca5db6d039504a56c04ea59 AS build

WORKDIR /build

# Manifest and lockfile first, so a source-only change does not re-resolve
# dependencies.
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: a dependency lifecycle script runs arbitrary code at build
# time, and this image only needs TypeScript to compile. Nothing here has a
# legitimate postinstall.
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

FROM node@sha256:5539840ce9d013fa13e3b9814c9353024be7ac75aca5db6d039504a56c04ea59 AS runtime

# Never root. HAC-325 had two images flagged for exactly this (docker:S6471) and
# the fix there was the same fix here.
RUN addgroup -g 10001 -S interlock && adduser -u 10001 -S interlock -G interlock

WORKDIR /app

COPY --from=build --chown=10001:10001 /build/dist ./dist

# The evidence artifact the decision reads. Baked into the image so the running
# service cannot be pointed at different evidence than the one this experiment
# recorded, and so the decision path has no network dependency.
COPY --chown=10001:10001 experiments/hac-330/evidence/baseline.evidence.json ./evidence/baseline.evidence.json

USER 10001:10001

ENV NODE_ENV=production \
    INTERLOCK_EVIDENCE_PATH=/app/evidence/baseline.evidence.json

# Overridden per service by `gcloud run deploy --command`.
CMD ["node", "dist/target/main.js"]
