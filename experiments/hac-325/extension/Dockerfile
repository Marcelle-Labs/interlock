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
RUN pip install --no-cache-dir -r requirements.txt
# Generated stubs use absolute imports (envoy.*, google.*, xds.*), so the
# generation root goes on the path rather than being installed as a package.
COPY --from=protogen /work/gen /app/protodef
ENV PYTHONPATH=/app/protodef
ENV PYTHONUNBUFFERED=1
COPY server.py .
CMD ["python", "server.py"]
