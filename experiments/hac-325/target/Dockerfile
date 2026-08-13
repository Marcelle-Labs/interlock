FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY app.py .
# Drop root. The stub has no dependencies to install and owns no files.
RUN useradd --create-home --uid 10001 target
USER 10001
CMD ["python", "app.py"]
