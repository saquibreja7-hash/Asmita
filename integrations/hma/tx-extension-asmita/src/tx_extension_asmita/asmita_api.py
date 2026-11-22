# tx-extension-asmita: an Asmita signal exchange for python-threatexchange.
#
# Original Asmita code (BSD-3-Clause, see LICENSE). It implements the
# SignalExchangeAPI interface published by Meta's ThreatExchange project
# (github.com/meta/ThreatExchange, BSD; the threatexchange package is a
# required dependency and is not vendored here) and copies none of its
# source. See NOTICE for the attribution.
#
# What it does: pages through Asmita's HMA signal feed
# (GET /api/partner/v1/signals, Bearer partner key — the contract is
# documented in asmita/docs/product/partner-api.md in the Asmita repository)
# and turns it into exchange updates for Hasher-Matcher-Actioner (HMA),
# Open Media Match and the threatexchange CLI:
#
#   live records  -> signals, one update record per Asmita fingerprint id,
#                   with the signal value (the PDQ hash or vPDQ feature
#                   list) riding in the pickled record
#   tombstones    -> deletions (value None) under the same id, so a
#                   survivor withdrawing her consent removes her
#                   fingerprints from the deployment's index on the next
#                   sync
#
# WHY THE ID IS THE KEY (and not the hash): Asmita's feed re-checks
# shareability at serve time and never serves the hash of a withdrawn
# fingerprint again — the ADD record itself stops being served once its
# fingerprint is unshareable. A tombstone therefore arrives with only the
# fingerprint id, and a deletion keyed by the hash could never address the
# entry it is meant to remove (the exact "deletions quietly never applied"
# bug class the built-in StopNCII exchange is famous for). Keying both the
# ADD and the tombstone by (signal type, fingerprint id) makes a deletion
# explicit and unambiguous — it addresses exactly the record its ADD
# created — and keeps two survivors who hold the same image as two
# independent records, so one withdrawal never removes the other's signal.
# The signal value travels in the pickled record (AsmitaSignalMetadata),
# and naive_convert_to_signal_type maps it into the bank's index format.
#
# This module deliberately has no third-party imports beyond threatexchange:
# urllib from the standard library is enough, so the wheel installs into an
# HMA image with no build tools.

import json
import typing as t
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from threatexchange.exchanges import auth
from threatexchange.exchanges import fetch_state as state
from threatexchange.exchanges import signal_exchange_api
from threatexchange.exchanges.collab_config import CollaborationConfigWithDefaults
from threatexchange.signal_type.signal_base import SignalType

# The exchange name python-threatexchange derives from the class name; pinned
# here so the name a deployment registers ("api": "asmita") can never drift.
_API_NAME = "asmita"

# Asmita is not a public SaaS endpoint: every deployment fills in its own
# Asmita host. The default is deliberately a placeholder that cannot be
# fetched, so a missing base_url fails loudly instead of quietly talking to
# somebody else's Asmita.
_DEFAULT_BASE_URL = "https://<owner fills>/api/partner/v1"

_REQUEST_TIMEOUT_S = 30

# The /signals page size (Asmita caps it at 800; 500 is the feed's default).
PAGE_LIMIT = 500


@dataclass
class AsmitaCheckpoint(state.FetchCheckpointBase):
    """Where a fetch stopped: Asmita's opaque checkpoint and its clock.

    HMA serializes this dataclass to JSON (dataclass_dump_dict) and asserts
    via get_progress_timestamp() that the time never rewinds between deltas.
    Asmita guarantees that: the opaque checkpoint encodes the strictly
    ordered (createdAt, seq) pair of the last record served.
    """

    # The opaque checkpoint string exactly as Asmita returned it.
    checkpoint: str = ""
    # The newest record's updated_at (unix seconds) of the page this
    # checkpoint came from; 0 when nothing has been fetched yet.
    updated_at: int = 0

    def get_progress_timestamp(self) -> t.Optional[int]:
        return self.updated_at or None

    def is_stale(self) -> bool:
        # Asmita keeps deletion records forever and the checkpoint never
        # rewinds, so there is nothing a refetch from scratch would recover.
        return False


@dataclass
class _AsmitaCollabConfigFields:
    base_url: str = field(
        default=_DEFAULT_BASE_URL,
        metadata={
            "help": (
                "Asmita's API base URL, including the /api/partner/v1 path, "
                "e.g. https://asmita.example/api/partner/v1."
            )
        },
    )


@dataclass
class AsmitaCollabConfig(_AsmitaCollabConfigFields, CollaborationConfigWithDefaults):
    """One Asmita subscription. `name` is yours to choose.

    Field order note: the non-defaulted name comes first (the base class's
    order is preserved by listing the defaulted mixin first), so
    AsmitaCollabConfig(name=...) instantiates. The example adapter this
    package replaces had them the other way around and could not be
    instantiated at all.
    """

    api: str = field(init=False, default=_API_NAME)


@dataclass
class AsmitaCredentials(auth.CredentialHelper):
    """The partner key an Asmita admin issued the platform. Keep it in a
    secret store; it is sent as a bearer token on every request."""

    ENV_VARIABLE: t.ClassVar[str] = "TX_ASMITA_API_KEY"
    FILE_NAME: t.ClassVar[str] = "~/.tx_asmita_key"

    api_key: str = field(metadata={"help": "The Asmita partner key (ppk_...)."})

    @classmethod
    def _from_str(cls, s: str) -> "AsmitaCredentials":
        return cls(s.strip())

    def _are_valid(self) -> bool:
        return bool(self.api_key)


@dataclass
class AsmitaSignalMetadata(state.FetchedSignalMetadata):
    """One fetched Asmita record: the signal, the fingerprint it belongs
    to, and Asmita's programme tags.

    HMA pickles this class next to every fetched record, so the fields are
    part of a stored format: adding a field with a default is safe,
    renaming or removing one breaks every HMA instance that pickled the
    old shape. Do not change these fields without a migration plan.

    The id is what report_opinion() quotes back to Asmita's /outcomes
    route, and it is the second half of the update key: the deletion
    (value None) addresses exactly the record its ADD created. The signal
    is the value Asmita's feed served (a PDQ hash or a vPDQ feature
    list) — it lives here rather than in the key because a withdrawn
    fingerprint's hash is never served again, so the tombstone could not
    have named it (see the module comment).
    """

    id: str = ""
    tags: t.Tuple[str, ...] = ()
    signal: str = ""

    def get_as_opinions(self) -> t.Sequence[state.SignalOpinion]:
        # One opinion, not ours, positive class: a survivor consented to
        # sharing this signal for finding and blocking. HMA treats it as a
        # candidate for review — never an automatic removal.
        return [
            state.SignalOpinion(
                is_mine=False,
                category=state.SignalOpinionCategory.POSITIVE_CLASS,
                tags=set(self.tags),
            )
        ]


# One /signals record, validated into plain Python types.
_Record = t.Dict[str, t.Any]


class AsmitaSignalExchangeAPI(
    auth.SignalExchangeWithAuth[AsmitaCollabConfig, AsmitaCredentials],
    signal_exchange_api.SignalExchangeAPIWithSimpleUpdates[
        AsmitaCollabConfig,
        AsmitaCheckpoint,
        AsmitaSignalMetadata,
    ],
):
    """Subscribes an HMA/OMM/threatexchange-CLI deployment to Asmita.

    Key implementation details:

    1. Updates are keyed by (signal type, Asmita fingerprint id). The
       signal value itself rides in the pickled record, and
       naive_convert_to_signal_type maps it into the bank's index format —
       an override of the simple-updates default, which would index the
       key's second element instead. See the module comment for why the id
       must be the key: the tombstone cannot name the hash, and an ADD
       that stops being shareable stops being served.
    2. A tombstone deletes exactly the record its ADD created. A tombstone
       for a fingerprint this deployment never received (its ADD was
       skipped at serve time) deletes nothing anywhere, harmlessly.
    3. Nothing but the fingerprint id, the signal value and the tags ever
       enters the exchange; Asmita's feed carries no URLs, no images and
       no survivor data.
    """

    PAGE_LIMIT: t.ClassVar[int] = PAGE_LIMIT

    def __init__(self, collab: AsmitaCollabConfig, api_key: str) -> None:
        super().__init__()
        if not api_key:
            raise auth.SignalExchangeAPIMissingAuthException(
                self.__class__, env_hint="TX_ASMITA_API_KEY"
            )
        base_url = collab.base_url.strip()
        if not base_url.startswith(("https://", "http://")) or "<" in base_url:
            raise ValueError(
                "AsmitaCollabConfig.base_url must be set to this deployment's "
                "Asmita API base (including /api/partner/v1)"
            )
        self.collab = collab
        self._api_key = api_key
        # The feed's id -> newest live record map, built once per API
        # instance when report_opinion first needs it; see _live_map().
        self._live_map_cache: t.Optional[t.Dict[str, _Record]] = None

    # ------------------------------------------------------------ plumbing

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
    def get_credential_cls() -> t.Type[AsmitaCredentials]:
        return AsmitaCredentials

    @classmethod
    def for_collab(
        cls,
        collab: AsmitaCollabConfig,
        credentials: t.Optional["AsmitaCredentials"] = None,
    ) -> "AsmitaSignalExchangeAPI":
        credentials = credentials or AsmitaCredentials.get(cls)
        return cls(collab, credentials.api_key)

    @property
    def _base(self) -> str:
        return self.collab.base_url.strip().rstrip("/")

    def _request(
        self,
        path: str,
        method: str = "GET",
        body: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> t.Dict[str, t.Any]:
        """One call to the Asmita partner API. Raises on transport and HTTP
        errors; the messages carry codes only, never the key or a URL."""
        url = f"{self._base}{path}"
        data = None
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
        }
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=_REQUEST_TIMEOUT_S) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                # The operator must act: wrong key, revoked key, suspended
                # partner, or a key without the scope this route needs.
                raise auth.SignalExchangeAPIInvalidAuthException(
                    self.__class__,
                    f"Asmita API refused the partner key (HTTP {e.code})",
                ) from e
            raise RuntimeError(f"Asmita API returned HTTP {e.code}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Asmita API request failed: {e.reason}") from e
        try:
            parsed = json.loads(raw)
        except ValueError as e:
            raise RuntimeError("Asmita API returned a non-JSON body") from e
        if not isinstance(parsed, dict):
            raise RuntimeError("Asmita API returned a malformed body")
        return parsed

    # --------------------------------------------------------------- fetch

    def _fetch_page(self, checkpoint: t.Optional[str]) -> t.Dict[str, t.Any]:
        """One GET of /signals. `checkpoint` is Asmita's opaque string; None
        starts from the beginning of the feed."""
        query: t.List[t.Tuple[str, str]] = [("page_size", str(self.PAGE_LIMIT))]
        if checkpoint:
            query.append(("checkpoint", checkpoint))
        path = f"/signals?{urllib.parse.urlencode(query)}"
        page = self._request(path)
        # Validate the shape strictly: a misread page must fail loudly, not
        # silently drop or repeat records.
        for name, kind in (("checkpoint", str), ("has_more", bool), ("records", list)):
            if not isinstance(page.get(name), kind):
                raise RuntimeError(f"Asmita /signals page is missing '{name}'")
        return page

    @staticmethod
    def _validated_record(raw: t.Any) -> t.Optional[_Record]:
        """One feed record as plain types, or None when it is malformed."""
        if not isinstance(raw, dict):
            return None
        record: _Record = {}
        for name in ("id", "signal_type"):
            value = raw.get(name)
            if not isinstance(value, str) or not value:
                return None
            record[name] = value
        if not isinstance(raw.get("deleted"), bool):
            return None
        record["deleted"] = raw["deleted"]
        updated_at = raw.get("updated_at")
        if not isinstance(updated_at, int) or updated_at < 0:
            return None
        record["updated_at"] = updated_at
        hash_value = raw.get("hash")
        if record["deleted"]:
            # A tombstone's hash is null by contract; a deleted record that
            # carries a value would be a withdrawn fingerprint's hash, which
            # Asmita never serves — refuse the record.
            if hash_value is not None:
                return None
        else:
            if not isinstance(hash_value, str) or not hash_value:
                return None
        record["hash"] = hash_value
        tags = raw.get("tags", [])
        if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            return None
        record["tags"] = tuple(tags)
        return record

    @classmethod
    def _metadata_of(cls, record: _Record) -> AsmitaSignalMetadata:
        return AsmitaSignalMetadata(
            id=record["id"],
            tags=record["tags"],
            signal=record["hash"],
        )

    def fetch_iter(
        self,
        supported_signal_types: t.Sequence[t.Type[SignalType]],
        checkpoint: t.Optional[AsmitaCheckpoint],
    ) -> t.Iterator[
        state.FetchDelta[t.Tuple[str, str], t.Optional[AsmitaSignalMetadata], AsmitaCheckpoint]
    ]:
        supported = {signal_type.get_name() for signal_type in supported_signal_types}
        opaque = checkpoint.checkpoint if checkpoint is not None else None
        last_updated_at = checkpoint.updated_at if checkpoint is not None else 0
        while True:
            page = self._fetch_page(opaque)
            # A malformed record fails the whole page: reading on could skip
            # or replay records. Unsupported signal types are skipped — they
            # were never stored anywhere, so neither their records nor their
            # tombstones concern this deployment (vPDQ while the deployment
            # has not enabled the vpdq extension).
            records: t.List[_Record] = []
            for raw in page["records"]:
                record = self._validated_record(raw)
                if record is None:
                    raise RuntimeError("Asmita /signals served a malformed record")
                if record["signal_type"] in supported:
                    records.append(record)
            updates: t.Dict[t.Tuple[str, str], t.Optional[AsmitaSignalMetadata]] = {}
            for record in records:
                # The key is (signal type, fingerprint id) for both a live
                # record and a tombstone, so the tombstone deletes exactly
                # what its ADD created — see the module comment.
                key = (record["signal_type"], record["id"])
                updates[key] = None if record["deleted"] else self._metadata_of(record)
            if records:
                last_updated_at = max(record["updated_at"] for record in records)
            next_checkpoint = AsmitaCheckpoint(
                checkpoint=page["checkpoint"],
                updated_at=last_updated_at,
            )
            has_more = page["has_more"]
            yield state.FetchDelta(updates, next_checkpoint)
            if not has_more:
                return
            opaque = page["checkpoint"]

    # ---------------------------------------------------------- conversion

    @classmethod
    def naive_convert_to_signal_type(
        cls,
        signal_types: t.Sequence[t.Type[SignalType]],
        collab: AsmitaCollabConfig,
        fetched: t.Mapping[t.Tuple[str, str], t.Optional[AsmitaSignalMetadata]],
    ) -> t.Dict[t.Type[SignalType], t.Dict[str, AsmitaSignalMetadata]]:
        """Map fetched records into the index format.

        An override of the simple-updates default: that default indexes the
        second element of the update key, which here is Asmita's
        fingerprint id — the record's `signal` field is the value the bank
        must match on. Deletions (None records) have nothing to index.
        """
        ret: t.Dict[t.Type[SignalType], t.Dict[str, AsmitaSignalMetadata]] = {}
        type_by_name = {signal_type.get_name(): signal_type for signal_type in signal_types}
        for (type_str, _fingerprint_id), metadata in fetched.items():
            if metadata is None:
                continue
            signal_type = type_by_name.get(type_str)
            if signal_type is None:
                continue
            try:
                value = signal_type.validate_signal_str(metadata.signal)
            except ValueError:
                continue
            inner = ret.get(signal_type)
            if inner is None:
                inner = {}
                ret[signal_type] = inner
            inner[value] = metadata
        return ret

    # ----------------------------------------------------------- the id map

    def _live_map(self, supported: t.AbstractSet[str]) -> t.Dict[str, _Record]:
        """The feed's live fingerprint ids -> their newest served record.

        Walks /signals from the beginning once per API instance. Used only
        by report_opinion(): the feedback interface hands over the signal
        value, and the feed's ADD records are the only place that maps a
        fingerprint id to the signal Asmita must be told about.
        """
        if self._live_map_cache is not None:
            return self._live_map_cache
        live: t.Dict[str, _Record] = {}
        checkpoint: t.Optional[str] = None
        while True:
            page = self._fetch_page(checkpoint)
            for raw in page["records"]:
                record = self._validated_record(raw)
                if record is None:
                    raise RuntimeError("Asmita /signals served a malformed record")
                if record["signal_type"] not in supported:
                    continue
                fingerprint_id = record["id"]
                if record["deleted"]:
                    live.pop(fingerprint_id, None)
                else:
                    live[fingerprint_id] = record
            if not page["has_more"]:
                break
            checkpoint = page["checkpoint"]
        self._live_map_cache = live
        return live

    # ------------------------------------------------------------ feedback

    def report_opinion(
        self,
        s_type: t.Type[SignalType],
        signal: str,
        opinion: state.SignalOpinion,
    ) -> None:
        """Tell Asmita what the platform decided about one of its signals.

        HMA does not call this today; the threatexchange CLI
        (`threatexchange label <collab> photo --as-hash pdq -- <hash>`) and
        platform tooling can. The interface hands over the signal value, not
        Asmita's fingerprint id, so the ids are resolved against the feed's
        ADD history (one full walk; see _live_map) before posting — and the
        same hash under several survivors' fingerprints reports for each of
        them.

        A match is a high-signal indicator for human review, never an
        automatic removal decision; the categories map accordingly:
        POSITIVE_CLASS means the platform blocked re-uploads, NEGATIVE_CLASS
        means the content was not the survivor's.
        """
        if opinion.category == state.SignalOpinionCategory.POSITIVE_CLASS:
            outcome = "blocked_reupload"
        elif opinion.category == state.SignalOpinionCategory.NEGATIVE_CLASS:
            outcome = "not_our_content"
        else:
            raise NotImplementedError(
                "Asmita accepts only true-positive and false-positive feedback"
            )
        live = self._live_map({s_type.get_name()})
        fingerprint_ids = sorted(
            fingerprint_id
            for fingerprint_id, record in live.items()
            if record["hash"] == signal
        )
        if not fingerprint_ids:
            raise ValueError(
                "Asmita's feed does not hold this signal; nothing to report"
            )
        for fingerprint_id in fingerprint_ids:
            self._request(
                "/outcomes",
                method="POST",
                body={"fingerprintId": fingerprint_id, "outcome": outcome},
            )


__all__ = [
    "AsmitaCheckpoint",
    "AsmitaCollabConfig",
    "AsmitaCredentials",
    "AsmitaSignalExchangeAPI",
    "AsmitaSignalMetadata",
]
