# tx-extension-asmita tests: the exchange against a real local HTTP fake of
# Asmita's /signals and /outcomes (see conftest.py), plus the stored-format
# guarantees HMA relies on (pickle round-trip, config/checkpoint JSON
# round-trips). Synthetic ids, hashes and keys only.

import dataclasses
import pickle
import typing as t

import pytest

from conftest import API_KEY, FakeAsmitaState, fake_hash, start_fake_asmita
from threatexchange.exchanges import auth as tx_auth
from threatexchange.exchanges import fetch_state as state
from threatexchange.exchanges.collab_config import CollaborationConfigWithDefaults
from threatexchange.signal_type.pdq.signal import PdqSignal
from threatexchange.utils import dataclass_json

from tx_extension_asmita import AsmitaSignalExchangeAPI, TX_MANIFEST
from tx_extension_asmita.asmita_api import (
    AsmitaCheckpoint,
    AsmitaCollabConfig,
    AsmitaCredentials,
    AsmitaSignalMetadata,
)


class _FakeVideoSignal(PdqSignal):
    """Stands in for the optional vpdq signal type: same value format."""

    @classmethod
    def get_name(cls) -> str:
        return "vpdq"


@pytest.fixture()
def fake():
    state_ = FakeAsmitaState()
    server, thread = start_fake_asmita(state_)
    base_url = f"http://127.0.0.1:{server.server_address[1]}/api/partner/v1"
    yield state_, base_url
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def make_api(base_url: str, key: str = API_KEY) -> AsmitaSignalExchangeAPI:
    return AsmitaSignalExchangeAPI(AsmitaCollabConfig(name="ASMITA_NCII", base_url=base_url), key)


def run_fetch(
    api: AsmitaSignalExchangeAPI,
    supported: t.Sequence[t.Type],
    checkpoint: t.Optional[AsmitaCheckpoint] = None,
) -> t.List[state.FetchDelta]:
    return list(api.fetch_iter(supported, checkpoint))


TAGS = ("asmita", "ncii", "survivor_consented")


def metadata_of(fingerprint_id: str, signal: str) -> AsmitaSignalMetadata:
    return AsmitaSignalMetadata(id=fingerprint_id, tags=TAGS, signal=signal)


# --------------------------------------------------------------- registration


def test_manifest_and_names():
    assert TX_MANIFEST.apis == (AsmitaSignalExchangeAPI,)
    assert AsmitaSignalExchangeAPI.get_name() == "asmita"
    assert AsmitaSignalExchangeAPI.get_config_cls() is AsmitaCollabConfig
    assert AsmitaSignalExchangeAPI.get_checkpoint_cls() is AsmitaCheckpoint
    assert AsmitaSignalExchangeAPI.get_record_cls() is AsmitaSignalMetadata
    assert AsmitaSignalExchangeAPI.get_credential_cls() is AsmitaCredentials
    assert AsmitaCredentials.ENV_VARIABLE == "TX_ASMITA_API_KEY"
    assert AsmitaCredentials.FILE_NAME == "~/.tx_asmita_key"


def test_config_instantiates_and_round_trips():
    config = AsmitaCollabConfig(name="ASMITA_NCII")
    assert config.api == "asmita"
    assert config.enabled is True
    assert config.base_url == "https://<owner fills>/api/partner/v1"
    # The shape HMA's POST /c/exchanges builds: injected name/enabled/api.
    loaded = dataclass_json.dataclass_load_dict(
        {
            "name": "ASMITA_NCII",
            "enabled": True,
            "api": "asmita",
            "base_url": "http://127.0.0.1:9/api/partner/v1",
        },
        AsmitaCollabConfig,
    )
    assert loaded == AsmitaCollabConfig(
        name="ASMITA_NCII", base_url="http://127.0.0.1:9/api/partner/v1"
    )
    round_trip = dataclass_json.dataclass_load_dict(
        dataclass_json.dataclass_dump_dict(config), AsmitaCollabConfig
    )
    assert round_trip == config


def test_placeholder_base_url_is_refused():
    with pytest.raises(ValueError, match="base_url"):
        make_api("https://<owner fills>/api/partner/v1")
    with pytest.raises(ValueError, match="base_url"):
        make_api("not-a-url")


def test_credentials_from_env_and_string(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("TX_ASMITA_API_KEY", f"  {API_KEY}  ")
    creds = AsmitaCredentials.get(AsmitaSignalExchangeAPI)
    assert creds.api_key == API_KEY
    assert creds._are_valid()
    assert AsmitaCredentials._from_str(" ppk_x ").api_key == "ppk_x"
    assert not AsmitaCredentials("")._are_valid()


def test_for_collab_builds_an_authenticated_api(fake):
    _, base_url = fake
    api = AsmitaSignalExchangeAPI.for_collab(
        AsmitaCollabConfig(name="ASMITA_NCII", base_url=base_url),
        AsmitaCredentials(API_KEY),
    )
    assert isinstance(api, AsmitaSignalExchangeAPI)
    with pytest.raises(tx_auth.SignalExchangeAPIMissingAuthException):
        AsmitaSignalExchangeAPI(AsmitaCollabConfig(name="X", base_url=base_url), "")


# --------------------------------------------------------------------- fetch


def test_paging_checkpoint_progress_and_auth_header(fake):
    state_, base_url = fake
    for index in range(1201):
        state_.add(f"id-{index}", hash_value=fake_hash(f"img-{index}"), updated_at=1_700_000_000 + index)
    api = make_api(base_url)
    deltas = run_fetch(api, [PdqSignal])
    assert [len(delta.updates) for delta in deltas] == [500, 500, 201]
    checkpoints = [delta.checkpoint.checkpoint for delta in deltas]
    assert checkpoints == ["cp500", "cp1000", "cp1201"]
    stamps = [delta.checkpoint.get_progress_timestamp() for delta in deltas]
    assert stamps == sorted(stamps), "the clock HMA asserts on never rewinds"
    assert deltas[-1].checkpoint.updated_at == 1_700_001_200
    assert all(delta.checkpoint.is_stale() is False for delta in deltas)
    # Page size is capped at the plugin's page limit and the key is a bearer.
    for request in state_.requests:
        assert request["path"] == "/signals"
        assert request["authorization"] == f"Bearer {API_KEY}"
        assert int(request["query"]["page_size"]) <= 800
    # No checkpoint on the first page; the returned one echoed afterwards.
    assert "checkpoint" not in state_.requests[0]["query"]
    assert state_.requests[1]["query"]["checkpoint"] == "cp500"


def test_adds_are_keyed_by_fingerprint_id_with_the_signal_in_the_record(fake):
    state_, base_url = fake
    hash_value = fake_hash("one")
    state_.add("fp-1", hash_value=hash_value)
    deltas = run_fetch(make_api(base_url), [PdqSignal])
    (delta,) = deltas
    # The key addresses the fingerprint (a tombstone for a withdrawn
    # fingerprint could never name the hash); the signal rides in the
    # record the bank indexes through naive_convert_to_signal_type.
    assert delta.updates == {("pdq", "fp-1"): metadata_of("fp-1", hash_value)}
    (opinion,) = delta.updates[("pdq", "fp-1")].get_as_opinions()
    assert opinion.is_mine is False
    assert opinion.category == state.SignalOpinionCategory.POSITIVE_CLASS
    assert opinion.tags == set(TAGS)


def test_deletion_across_runs_removes_exactly_the_adds_record(fake):
    state_, base_url = fake
    hash_value = fake_hash("withdrawn")
    state_.add("fp-gone", hash_value=hash_value, updated_at=10)
    api = make_api(base_url)
    first = run_fetch(api, [PdqSignal])
    assert first[-1].checkpoint.checkpoint == "cp1"
    # A later run (a fresh API, exactly HMA's per-fetch client): only the
    # tombstone is new, and it deletes under the id its ADD created — with
    # no extra requests, because the tombstone already names its key.
    state_.withdraw("fp-gone", updated_at=20)
    second = run_fetch(make_api(base_url), [PdqSignal], first[-1].checkpoint)
    assert len(second) == 1
    assert second[0].updates == {("pdq", "fp-gone"): None}
    assert second[0].checkpoint.checkpoint == "cp2"
    assert second[0].checkpoint.get_progress_timestamp() == 20
    assert state_.signal_requests() == 2  # one page per fetch run, no walk


def test_tombstone_without_a_served_add_deletes_nothing_anywhere(fake):
    state_, base_url = fake
    state_.withdraw("fp-never-served")
    deltas = run_fetch(make_api(base_url), [PdqSignal])
    assert len(deltas) == 1
    # The deletion is still yielded under the id: a deployment that somehow
    # holds the record removes it, and stores that never held it no-op. It
    # can never delete anything else.
    assert deltas[0].updates == {("pdq", "fp-never-served"): None}


def test_tombstone_of_an_unsupported_signal_type_is_skipped(fake):
    state_, base_url = fake
    hash_value = fake_hash("video")
    state_.add("fp-video", kind="video", hash_value=hash_value)
    state_.withdraw("fp-video", kind="video")
    deltas = run_fetch(make_api(base_url), [PdqSignal])
    assert deltas[0].updates == {}


def test_vpdq_records_follow_supported_signal_types(fake):
    state_, base_url = fake
    video_value = '["%s,80,0.000"]' % fake_hash("frame")
    state_.add("fp-video", kind="video", hash_value=video_value)
    state_.add("fp-image", hash_value=fake_hash("still"))
    # vpdq disabled: only the image reaches the exchange.
    deltas = run_fetch(make_api(base_url), [PdqSignal])
    assert set(deltas[0].updates) == {("pdq", "fp-image")}
    # vpdq enabled: both, the video under its own signal type.
    deltas = run_fetch(make_api(base_url), [PdqSignal, _FakeVideoSignal])
    assert set(deltas[0].updates) == {("pdq", "fp-image"), ("vpdq", "fp-video")}


def test_two_survivors_of_one_image_withdraw_independently(fake):
    state_, base_url = fake
    shared = fake_hash("same-image")
    state_.add("fp-a", hash_value=shared, updated_at=1)
    state_.add("fp-b", hash_value=shared, updated_at=2)
    state_.withdraw("fp-a", updated_at=3)
    deltas = run_fetch(make_api(base_url), [PdqSignal])
    # Two records for the same signal value, one per fingerprint: the
    # withdrawal removes exactly fp-a's, never fp-b's.
    assert deltas[0].updates == {
        ("pdq", "fp-a"): None,
        ("pdq", "fp-b"): metadata_of("fp-b", shared),
    }
    converted = AsmitaSignalExchangeAPI.naive_convert_to_signal_type(
        [PdqSignal], AsmitaCollabConfig(name="X", base_url=base_url), deltas[0].updates
    )
    assert converted == {PdqSignal: {shared: metadata_of("fp-b", shared)}}


def test_readd_after_withdraw_recovers_the_signal(fake):
    state_, base_url = fake
    hash_value = fake_hash("re-added")
    state_.add("fp-c", hash_value=hash_value, updated_at=1)
    state_.withdraw("fp-c", updated_at=2)
    state_.add("fp-c", hash_value=hash_value, updated_at=3)
    deltas = run_fetch(make_api(base_url), [PdqSignal])
    assert deltas[0].updates == {("pdq", "fp-c"): metadata_of("fp-c", hash_value)}


def test_malformed_page_or_record_fails_loudly(fake):
    state_, base_url = fake
    # A page missing a required field: the real response path, not a stub.
    state_.malformed = {"checkpoint": "cp1", "records": []}
    with pytest.raises(RuntimeError, match="has_more"):
        run_fetch(make_api(base_url), [PdqSignal])
    # A live record without a hash is not a record Asmita ever mints.
    state_.malformed = {
        "checkpoint": "cp1",
        "has_more": False,
        "records": [{"id": "fp-x", "signal_type": "pdq", "hash": None, "deleted": False, "updated_at": 1, "tags": []}],
    }
    with pytest.raises(RuntimeError, match="malformed record"):
        run_fetch(make_api(base_url), [PdqSignal])
    state_.malformed = None


def test_hma_style_merge_converges_on_the_live_set(fake):
    state_, base_url = fake
    kept = fake_hash("kept")
    gone = fake_hash("gone")
    state_.add("fp-kept", hash_value=kept, updated_at=1)
    state_.add("fp-gone", hash_value=gone, updated_at=2)
    state_.withdraw("fp-gone", updated_at=3)
    api = make_api(base_url)
    # The naive_fetch_merge path (the CLI store, and the semantics HMA's
    # exchange_commit_fetch implements per key).
    merged: t.Dict[t.Tuple[str, str], t.Optional[AsmitaSignalMetadata]] = {}
    for delta in api.fetch_iter([PdqSignal], None):
        AsmitaSignalExchangeAPI.naive_fetch_merge(merged, delta.updates)
    assert set(merged) == {("pdq", "fp-kept")}
    assert merged[("pdq", "fp-kept")] == metadata_of("fp-kept", kept)
    # And the merged state indexes exactly the live signals.
    converted = AsmitaSignalExchangeAPI.naive_convert_to_signal_type(
        [PdqSignal], api.collab, merged
    )
    assert converted == {PdqSignal: {kept: metadata_of("fp-kept", kept)}}
    # Default merge: new wins, None deletes.
    assert AsmitaSignalExchangeAPI.fetch_value_merge("old", None) is None
    assert AsmitaSignalExchangeAPI.fetch_value_merge("old", "new") == "new"


def test_naive_convert_validates_the_signal_strings(fake):
    _, base_url = fake
    api = make_api(base_url)
    good = fake_hash("good")
    bad = fake_hash("bad").upper()
    converted = AsmitaSignalExchangeAPI.naive_convert_to_signal_type(
        [PdqSignal],
        api.collab,
        {
            ("pdq", "fp-a"): AsmitaSignalMetadata(id="fp-a", signal=good),
            ("pdq", "fp-b"): AsmitaSignalMetadata(id="fp-b", signal=bad),
            ("pdq", "fp-c"): None,
        },
    )
    # An uppercase PDQ string is not a valid signal: dropped. A deletion
    # has nothing to index.
    assert converted == {PdqSignal: {good: AsmitaSignalMetadata(id="fp-a", signal=good)}}


# ------------------------------------------------------------ failure handling


@pytest.mark.parametrize("mode,message", [("unauthorized", "401"), ("forbidden", "403")])
def test_auth_failures_raise_the_auth_exception(fake, mode: str, message: str):
    state_, base_url = fake
    state_.auth_mode = mode
    with pytest.raises(tx_auth.SignalExchangeAPIInvalidAuthException, match=message):
        run_fetch(make_api(base_url), [PdqSignal])


def test_error_messages_never_leak_the_key(fake):
    state_, base_url = fake
    state_.auth_mode = "unauthorized"
    with pytest.raises(tx_auth.SignalExchangeAPIInvalidAuthException) as info:
        run_fetch(make_api(base_url), [PdqSignal])
    assert API_KEY not in str(info.value)
    assert API_KEY not in info.value.message


# ------------------------------------------------------------------ feedback


def test_report_opinion_maps_categories_and_posts_outcomes(fake):
    state_, base_url = fake
    hash_value = fake_hash("labeled")
    state_.add("fp-label", hash_value=hash_value)
    api = make_api(base_url)
    api.report_opinion(
        PdqSignal,
        hash_value,
        state.SignalOpinion(True, state.SignalOpinionCategory.POSITIVE_CLASS, set()),
    )
    api.report_opinion(
        PdqSignal,
        hash_value,
        state.SignalOpinion(True, state.SignalOpinionCategory.NEGATIVE_CLASS, set()),
    )
    assert state_.outcomes == [
        {"fingerprintId": "fp-label", "outcome": "blocked_reupload"},
        {"fingerprintId": "fp-label", "outcome": "not_our_content"},
    ]
    with pytest.raises(NotImplementedError):
        api.report_opinion(
            PdqSignal,
            hash_value,
            state.SignalOpinion(True, state.SignalOpinionCategory.INVESTIGATION_SEED, set()),
        )


def test_report_opinion_reports_for_every_fingerprint_of_a_hash(fake):
    state_, base_url = fake
    shared = fake_hash("shared")
    state_.add("fp-one", hash_value=shared)
    state_.add("fp-two", hash_value=shared)
    api = make_api(base_url)
    api.report_opinion(
        PdqSignal, shared, state.SignalOpinion(True, state.SignalOpinionCategory.POSITIVE_CLASS, set())
    )
    assert [outcome["fingerprintId"] for outcome in state_.outcomes] == ["fp-one", "fp-two"]


def test_report_opinion_rejects_unknown_signals(fake):
    _, base_url = fake
    api = make_api(base_url)
    with pytest.raises(ValueError, match="does not hold"):
        api.report_opinion(
            PdqSignal, fake_hash("unknown"), state.SignalOpinion(True, state.SignalOpinionCategory.POSITIVE_CLASS, set())
        )


# ----------------------------------------------------------- stored formats


def test_metadata_pickle_round_trip():
    metadata = AsmitaSignalMetadata(id="fp-1", tags=("asmita", "ncii"), signal=fake_hash("x"))
    restored = pickle.loads(pickle.dumps(metadata))
    assert restored == metadata
    assert restored.get_as_opinions() == metadata.get_as_opinions()


def test_metadata_defaults_keep_older_pickles_loadable():
    # A pickle written before a hypothetical new field still loads when new
    # fields carry defaults — the discipline the class docstring demands.
    old_state = {"id": "fp-old", "tags": ("asmita",)}
    restored = AsmitaSignalMetadata.__new__(AsmitaSignalMetadata)
    restored.__dict__.update(old_state)
    assert restored.id == "fp-old"
    assert restored.signal == ""
    assert dataclasses.asdict(restored) == {"id": "fp-old", "tags": ("asmita",), "signal": ""}


def test_checkpoint_json_round_trip():
    checkpoint = AsmitaCheckpoint(checkpoint="eyJ0IjoxNzAwfQ", updated_at=1_700_000_000)
    restored = dataclass_json.dataclass_load_dict(
        dataclass_json.dataclass_dump_dict(checkpoint), AsmitaCheckpoint
    )
    assert restored == checkpoint
    assert restored.get_progress_timestamp() == 1_700_000_000
    assert AsmitaCheckpoint().get_progress_timestamp() is None
    assert AsmitaCheckpoint().is_stale() is False
