# Multi-stage build for the Asmita Lab GenD service (research tools WP112).
#
# Weights are downloaded at BUILD time from the pinned revisions in
# gend/weights_manifest.json and sha256-verified (scripts/fetch_weights.py);
# nothing weighty is ever committed. The final image runs as the non-root
# `gend` user.
#
# RUNTIME=onnx  (default): builder also exports the ONNX graph and runs the
#                         acceptance gate; the runtime carries onnxruntime
#                         only, no torch, and just the exported graph + YuNet.
# RUNTIME=torch:           reference runtime; carries torch + transformers
#                         and the pinned HF weights.

ARG RUNTIME=onnx

FROM python:3.12-slim-bookworm AS builder
ARG RUNTIME
WORKDIR /src

COPY pyproject.toml README.md LICENSE-GenD.txt THIRD_PARTY.md ./
COPY gend ./gend
COPY scripts ./scripts

# torch CPU wheel (GenD pins torch 2.8.0), then the rest
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch==2.8.0" \
    && pip install --no-cache-dir ".[torch,onnx,export]"

RUN python scripts/fetch_weights.py --out /opt/gend-weights

RUN if [ "$RUNTIME" = "onnx" ]; then \
        export GEND_WEIGHTS_DIR=/opt/gend-weights GEND_RUNTIME=torch \
        && python scripts/export_onnx.py --out /opt/gend-weights/gend/gend_clip_l_14.onnx \
        && python scripts/validate_onnx.py; \
    fi

# Stage exactly what the chosen runtime needs
RUN if [ "$RUNTIME" = "onnx" ]; then \
        mkdir -p /opt/gend-weights-rt/gend /opt/gend-weights-rt/yunet \
        && cp /opt/gend-weights/gend/gend_clip_l_14.onnx /opt/gend-weights-rt/gend/ \
        && cp /opt/gend-weights/yunet/face_detection_yunet_2023mar.onnx /opt/gend-weights-rt/yunet/; \
    else \
        cp -r /opt/gend-weights /opt/gend-weights-rt; \
    fi

FROM python:3.12-slim-bookworm AS runtime
ARG RUNTIME
WORKDIR /src

RUN useradd --system --uid 10001 --create-home gend
COPY --from=builder /src /src

RUN if [ "$RUNTIME" = "onnx" ]; then \
        pip install --no-cache-dir ".[onnx]"; \
    else \
        pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch==2.8.0" \
        && pip install --no-cache-dir ".[torch]"; \
    fi

COPY --from=builder --chown=10001:10001 /opt/gend-weights-rt /opt/gend-weights
RUN pip cache purge && rm -rf /root/.cache

ENV GEND_WEIGHTS_DIR=/opt/gend-weights \
    GEND_RUNTIME=${RUNTIME} \
    GEND_HOST=0.0.0.0 \
    GEND_PORT=8080 \
    PYTHONUNBUFFERED=1

USER gend
EXPOSE 8080
# one process, one inference worker (see gend/service.py)
CMD ["python", "-m", "gend.service"]
