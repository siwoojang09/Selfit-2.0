FROM node:22-bookworm-slim
WORKDIR /app
ENV PATH=/opt/selfit-venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 SELFIT_WEB_DATA=/data
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/selfit-venv \
    && mkdir /data && chown node:node /data
COPY selfit_web/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY *.html *.css *.js *.mjs *.webp ./
COPY selfit_web/api.py selfit_web/api.py
COPY anatomy-assets/ anatomy-assets/
COPY assets/ assets/
COPY catalog/ catalog/
COPY discovery-art/ discovery-art/
COPY looks/ looks/
COPY textures/ textures/
COPY vendor/ vendor/
USER node
EXPOSE 4192
CMD ["uvicorn","selfit_web.api:app","--host","0.0.0.0","--port","4192"]
