# Open Media Match (current HMA) configuration for the Asmita end-to-end
# test (integrations/hma/e2e). A copy of the upstream development config's
# shape (reference_omm_configs/development_omm_config.py in
# github.com/meta/ThreatExchange, BSD), trimmed to this test's needs:
# every role on one instance, the Asmita exchange installed, and short
# background intervals so the test does not wait minutes per step.

from OpenMediaMatch.storage.postgres.impl import DefaultOMMStore
from threatexchange.signal_type.md5 import VideoMD5Signal
from threatexchange.signal_type.pdq.signal import PdqSignal
from threatexchange.content_type.photo import PhotoContent
from threatexchange.content_type.video import VideoContent

from tx_extension_asmita import AsmitaSignalExchangeAPI

# The vpdq extension needs the compiled `vpdq` package (it ships as source
# only on PyPI); the exchange skips video records while it is missing, so
# PDQ-only installs work and a deployment that built vpdq gets video too.
try:  # pragma: no cover - depends on the install
    from threatexchange.extensions.vpdq.vpdq import VPDQSignal

    _SIGNAL_TYPES = [PdqSignal, VideoMD5Signal, VPDQSignal]
except Exception:  # noqa: BLE001 - any missing optional dependency
    _SIGNAL_TYPES = [PdqSignal, VideoMD5Signal]

# Database configuration: OMM_DATABASE_URI (env) overrides this.
DATABASE_URI = "postgresql+psycopg2://postgres:postgres@postgresql/media_match"

# Role configuration: one instance doing everything, like the upstream
# development config.
PRODUCTION = False  # also enables the /dev/* routes (POST /dev/run_fetch)
ROLE_HASHER = True
ROLE_MATCHER = True
ROLE_CURATOR = True
UI_ENABLED = True
TASK_FETCHER = True
TASK_INDEXER = True
TASK_INDEX_CACHE = True

# Short intervals so the test's polling bounds stay tight. Defaults are
# fetcher=240s, indexer=60s, index cache=30s.
TASK_FETCHER_INTERVAL_SECONDS = 15
TASK_INDEXER_INTERVAL_SECONDS = 10
TASK_INDEX_CACHE_INTERVAL_SECONDS = 5
INDEX_CACHE_MAX_STALE_SEC = 30

STORAGE_IFACE_INSTANCE = DefaultOMMStore(
    signal_types=_SIGNAL_TYPES,
    content_types=[PhotoContent, VideoContent],
    exchange_types=[AsmitaSignalExchangeAPI],
)
