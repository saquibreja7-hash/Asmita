# Asmita partner-feed signal exchange for Hasher-Matcher-Actioner (HMA).
#
# An example integration, deliberately outside the Asmita application:
# nothing in asmita/ imports this file, and running it is entirely the
# platform operator's choice. It depends only on python-threatexchange
# (github.com/facebook/ThreatExchange, BSD licence — see
# LICENSE-THREATEXCHANGE.txt next to this file).
#
# What it does: pages through Asmita's append-only partner feed
# (GET /api/partner/v1/fingerprints, Bearer partner key — see
# asmita/docs/product/partner-api.md) and turns it into exchange updates:
#   "add" events     -> signals stored under Asmita's fingerprint id
#   "withdraw" events -> deletions, so a survivor withdrawing her consent
#                       removes her fingerprints from your index on the next
#                       sync (python-threatexchange expresses a deletion as
#                       an update whose value is None).
#
# Registration for current HMA (Open Media Match), the python-threatexchange
# CLI and archived HMA 1.0 is described in README.md.
#
# This file is original Asmita code; it implements an interface published by
# Meta's ThreatExchange project but copies none of its code.

import json
import logging
import typing as t
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from threatexchange.exchanges import auth
from threatexchange.exchanges import fetch_state as state
from threatexchange.exchanges import signal_exchange_api
from threatexchange.exchanges.collab_config import CollaborationConfigWithDefaults
from threatexchange.signal_type.pdq.signal import PdqSignal
from threatexchange.signal_type.signal_base import SignalType

_API_NAME = "asmita"
_DEFAULT_API_BASE_URL = "https://meriasmita.org"
_REQUEST_TIMEOUT_S = 30

# vPDQ (video fingerprints) is an optional python-threatexchange extension.
# Import it when the installation has it; video events are skipped with a
# warning when it is missing.
try:  # pragma: no cover - depends on the install
    from threatexchange.extensions.vpdq.vpdq import VPDQSignal
except Exception:  # noqa: BLE001 - any missing optional dependency
    VPDQSignal = None  # type: ignore[assignment]


@dataclass
class AsmitaCheckpoint(state.FetchCheckpointBase):
    """The last feed sequence number this deployment has processed."""

    last_seq: int

    def get_progress_timestamp(self) -> t.Optional[int]:
        # The feed's cursor is a sequence number, not a clock; the store only
        # uses this for display and a monotonicity assert it skips on None.
        return None


@dataclass
class _AsmitaCollabConfigRequiredFields:
    api_base_url: str = field(
        default=_DEFAULT_API_BASE_URL,
        metadata={"help": "Where Asmita is served (scheme + host)."},
    )


@dataclass
class AsmitaCollabConfig(
    CollaborationConfigWithDefaults,
    _AsmitaCollabConfigRequiredFields,
):
    """One Asmita feed subscription. `name` is yours to choose."""

    api: str = field(init=False, default=_API_NAME)


@dataclass
class AsmitaPartnerKeyCredentials(auth.CredentialHelper):
    """The partner key an Asmita admin issued you. Keep it in a secret store."""

    ENV_VARIABLE: t.ClassVar[str] = "ASMITA_PARTNER_KEY"
    FILE_NAME: t.ClassVar[str] = "~/.asmita_partner_key"

    key: str = field(metadata={"help": "The Asmita partner key (ppk_...)."})

    @classmethod
    def _from_str(cls, s: str) -> "AsmitaPartnerKeyCredentials":
        return cls(s.strip())

    def _are_valid(self) -> bool:
        return bool(self.key)


@dataclass
class AsmitaUpdateRecord:
    """One feed event, as the exchange stores it before conversion."""

    kind: str  # "image" | "video"
    pdq_hash: t.Optional[str] = None
    frames: t.Optional[t.List[str]] = None
    case_ref: t.Optional[str] = None


@dataclass
class AsmitaSignalMetadata(state.FetchedSignalMetadata):
    """All Asmita ever attaches to a signal: the case reference."""

    case_ref: t.Optional[str] = None


def _vpdq_signal_from_frames(frames: t.List[str]) -> str:
    """Build the vPDQ signal string Asmita's frame list maps onto.

    python-threatexchange's VPDQSignal expects a JSON object keyed by frame
    number with quality, hash and timestamp per frame. Asmita's feed carries
    bare frame hashes, so the quality and timestamp are synthesised here
    (quality 100, 30 frames per second); see README.md for the caveat.
    """
    return json.dumps(
        {
            str(index): {"quality": 100, "hash": frame, "timestamp": index / 30.0}
            for index, frame in enumerate(frames)
        }
    )


class AsmitaSignalExchangeAPI(
    auth.SignalExchangeWithAuth[AsmitaCollabConfig, AsmitaPartnerKeyCredentials],
    signal_exchange_api.SignalExchangeAPI[
        AsmitaCollabConfig,
        AsmitaCheckpoint,
        AsmitaSignalMetadata,
        str,
        AsmitaUpdateRecord,
    ],
):
    """
    Subscribes an HMA/OMM/CLI deployment to Asmita as a hash bank.
    Key implementation details:
        1. The feed's update key is Asmita's fingerprint id, so a "withdraw"
           can address a record whose hash was never received (an add that was
           withdrawn between polls) — a deletion is just {fingerprintId: None}.
        2. The checkpoint is the feed's monotonic seq; nothing ever rewinds.
        3. Nothing but the fingerprint id, the kind, the hash(es) and the case
           reference ever enters HMA. Asmita's feed is append-only and carries
           no URLs, no images and no survivor data.
    """

    PAGE_LIMIT: t.ClassVar[int] = 500

    def __init__(self, collab: AsmitaCollabConfig, partner_key: str) -> None:
        super().__init__()
        if not partner_key:
            raise Exception("Asmita partner key not configured or invalid.")
        self.collab = collab
        self._partner_key = partner_key

    @classmethod
    def for_collab(
        cls,
        collab: AsmitaCollabConfig,
        credentials: t.Optional["AsmitaPartnerKeyCredentials"] = None,
    ) -> "AsmitaSignalExchangeAPI":
        credentials = credentials or AsmitaPartnerKeyCredentials.get(cls)
        return cls(collab, credentials.key)

    @classmethod
    def get_name(cls) -> str:
        return _API_NAME

    @staticmethod
    def get_config_cls() -> t.Type[AsmitaCollabConfig]:
        return AsmitaCollabConfig

    @staticmethod
    def get_checkpoint_cls() -> t.Type[AsmitaCheckpoint]:
        return AsmitaCheckpoint

    @staticmethod
    def get_record_cls() -> t.Type[AsmitaSignalMetadata]:
        return AsmitaSignalMetadata

    @staticmethod
    def get_credential_cls() -> t.Type[AsmitaPartnerKeyCredentials]:
        return AsmitaPartnerKeyCredentials

    # ------------------------------------------------------------------ fetch

    def _fetch_page(self, cursor: int) -> t.Dict[str, t.Any]:
        """One GET of the feed. Raises on transport and HTTP errors; never
        logs or surfaces the partner key."""
        url = f"{self.collab.api_base_url.rstrip('/')}/api/partner/v1/fingerprints?cursor={cursor}&limit={self.PAGE_LIMIT}"
        request = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {self._partner_key}",
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(request, timeout=_REQUEST_TIMEOUT_S) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            # 401/403/429 all mean the operator must act; the body is a JSON
            # error code and nothing sensitive.
            raise Exception(f"Asmita feed returned HTTP {e.code}") from e
        return json.loads(body)

    def fetch_iter(
        self,
        _supported_signal_types: t.Sequence[t.Type[SignalType]],
        checkpoint: t.Optional[AsmitaCheckpoint],
    ) -> t.Iterator[state.FetchDelta[str, t.Optional[AsmitaUpdateRecord], AsmitaCheckpoint]]:
        last_seq = checkpoint.last_seq if checkpoint is not None else 0
        while True:
            page = self._fetch_page(last_seq)
            events = page.get("events", [])
            updates: t.Dict[str, t.Optional[AsmitaUpdateRecord]] = {}
            for event in events:
                fingerprint_id = event["fingerprintId"]
                if event.get("type") == "withdraw":
                    # Rule 2 of Asmita's partner programme: a withdrawal is a
                    # deletion, even for an id this deployment never received.
                    updates[fingerprint_id] = None
                else:
                    updates[fingerprint_id] = AsmitaUpdateRecord(
                        kind=event.get("kind", "image"),
                        pdq_hash=event.get("hash"),
                        frames=event.get("frames"),
                        case_ref=event.get("caseRef"),
                    )
            next_cursor = page.get("nextCursor")
            if next_cursor is None:
                # Up to date: returning (not yielding) tells the store the sync
                # finished; the last events ride on this iteration's delta.
                if updates:
                    last_seq = int(events[-1]["seq"])
                    yield state.FetchDelta(updates, AsmitaCheckpoint(last_seq))
                return
            next_cursor = int(next_cursor)
            if next_cursor <= last_seq:
                raise Exception("Asmita feed did not advance its cursor; aborting to avoid a loop")
            yield state.FetchDelta(updates, AsmitaCheckpoint(next_cursor))
            last_seq = next_cursor

    # -------------------------------------------------------------- conversion

    @classmethod
    def fetch_value_merge(
        cls,
        old: t.Optional[AsmitaUpdateRecord],
        new: t.Optional[AsmitaUpdateRecord],
    ) -> t.Optional[AsmitaUpdateRecord]:
        # None is the deletion signal (a withdrawal); an add replaces the
        # record it names.
        if new is None:
            return None
        return new

    @classmethod
    def naive_convert_to_signal_type(
        cls,
        signal_types: t.Sequence[t.Type[SignalType]],
        collab: AsmitaCollabConfig,
        fetched: t.Mapping[str, t.Optional[AsmitaUpdateRecord]],
    ) -> t.Dict[t.Type[SignalType], t.Dict[str, AsmitaSignalMetadata]]:
        by_name = {signal_type.get_name(): signal_type for signal_type in signal_types}
        pdq = by_name.get(PdqSignal.get_name())
        vpdq = by_name.get("vpdq")
        warned_about_video = False
        ret: t.Dict[t.Type[SignalType], t.Dict[str, AsmitaSignalMetadata]] = {}
        for record in fetched.values():
            if record is None:
                continue  # a withdrawal: nothing to convert
            if record.pdq_hash:
                if pdq is None:
                    continue
                try:
                    value = pdq.validate_signal_str(record.pdq_hash)
                except Exception:
                    logging.warning("Asmita: invalid PDQ hash on a feed event, skipping")
                    continue
                ret.setdefault(pdq, {})[value] = AsmitaSignalMetadata(record.case_ref)
            elif record.frames:
                if vpdq is None or VPDQSignal is None:
                    if not warned_about_video:
                        logging.warning(
                            "Asmita: video fingerprints need the vpdq extension "
                            "(threatexchange.extensions.vpdq) and VPDQSignal in "
                            "signal_types; skipping video events"
                        )
                        warned_about_video = True
                    continue
                try:
                    value = vpdq.validate_signal_str(_vpdq_signal_from_frames(record.frames))
                except Exception:
                    logging.warning("Asmita: invalid vPDQ frames on a feed event, skipping")
                    continue
                ret.setdefault(vpdq, {})[value] = AsmitaSignalMetadata(record.case_ref)
        return ret
