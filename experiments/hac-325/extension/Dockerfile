# Stage 1 generates the Envoy ext_proc stubs. Google's own callout samples take
# this route -- buf pulls the protos straight from envoyproxy/envoy so nothing
# vendored here can drift from the wire contract we are testing.
FROM bufbuild/buf:1.47.2 AS protogen
WORKDIR /work
COPY buf.gen.yaml .
RUN buf generate \
      https://github.com/envoyproxy/envoy.git#subdir=api,ref=v1.32.1 \
      --path envoy/service/ext_proc/v3/external_processor.proto \
      --include-imports

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
# --require-hashes pins the resolved artifacts, not just the version strings.
# --only-binary :all: refuses sdists, so no dependency's setup.py executes at
# build time.
RUN pip install --no-cache-dir --require-hashes --only-binary :all: \
      -r requirements.txt
# Generated stubs use absolute imports (envoy.*, google.*, xds.*), so the
# generation root goes on the path rather than being installed as a package.
COPY --from=protogen /work/gen /app/protodef
ENV PYTHONPATH=/app/protodef
ENV PYTHONUNBUFFERED=1
COPY server.py .
# Drop root. The process only listens on a port and needs nothing it owns.
RUN useradd --create-home --uid 10001 extension
USER 10001
CMD ["python", "server.py"]
