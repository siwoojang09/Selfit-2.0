FROM node:22-bookworm-slim
WORKDIR /app
ENV PATH=/opt/selfit/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SELFIT_GARMENT_DATA=/data \
    SELFIT_U2NETP_MODEL=/opt/models/u2netp.onnx \
    SELFIT_U2NETP_VERSION=309c8469258dda74

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/selfit \
    && mkdir -p /opt/models /data \
    && curl --fail --silent --show-error --location \
       https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx -o /opt/models/u2netp.onnx \
    && echo '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8  /opt/models/u2netp.onnx' | sha256sum -c - \
    && chown node:node /data

COPY garment_service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY garment_service/*.py garment_service/pattern.mjs ./garment_service/
COPY *.mjs ./
COPY vendor/ ./vendor/
COPY catalog/hoodie.webp ./catalog/hoodie.webp
COPY assets/adidas-kc9315.glb ./assets/adidas-kc9315.glb

USER node
EXPOSE 8787
CMD ["python", "-m", "uvicorn", "garment_service.api:app", "--host", "0.0.0.0", "--port", "8787", "--no-access-log"]
