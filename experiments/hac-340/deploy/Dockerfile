# One purpose-built agent image. Proxy and target keep their existing executable image.
FROM python:3.12-slim
WORKDIR /app
COPY experiments/hac-340/agent/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY experiments/hac-340/agent/server.py ./server.py
USER 65532:65532
CMD ["python", "server.py"]
