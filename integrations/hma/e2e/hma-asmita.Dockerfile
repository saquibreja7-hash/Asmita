# The HMA (Open Media Match) image with the Asmita exchange installed.
#
# Build context: integrations/hma (see docker-compose.yml), so the wheel
# built from tx-extension-asmita/ by run-e2e.sh is in the context. The base
# image is the official one, pinned by digest (tag 1.2.2, the HMA version
# whose python-threatexchange pin (>=1.2.18) this package is tested
# against). Asmita is not on PyPI (owner decision), so the wheel is pip
# installed from the build context, never fetched from an index.

FROM ghcr.io/meta/threatexchange/hma@sha256:9975bd6b4d57de0da776de8ea07fdddeb22cd0515c64c9301cc176836da514cf

COPY tx-extension-asmita/dist/*.whl /wheels/
RUN pip install --no-cache-dir /wheels/*.whl

# The OMM config this deployment runs (OMM_CONFIG=/app/omm_config.py).
COPY e2e/omm_config.py /app/omm_config.py
