# Sources for the research-grounded tools (WP110–WP117)

Collected 2026-11-22. **[V]** = verified in the source file, model card or paper text; **[I]** = inference or secondary reporting. Quotes from news sources were extracted by a summarising fetch and must be checked against the article before they are used in user-facing text or rules.

## A. HMA and ThreatExchange (Track A)

- Repository: https://github.com/meta/ThreatExchange (moved from facebook/), checked at commit 9f627fb (2026-11-19), HMA 1.2.2, python-threatexchange 1.2.18. Licence BSD ("BSD License For ThreatExchange software, Copyright (c) Meta Platforms") [V].
- Exchange interface: `python-threatexchange/threatexchange/exchanges/signal_exchange_api.py` (`SignalExchangeAPI`, `SignalExchangeAPIWithSimpleUpdates`); auth mixin `exchanges/auth.py` (`SignalExchangeWithAuth`, `CredentialHelper`) [V].
- Cleanest example to follow: `exchanges/impl/techagainstterrorism_api.py` [V]. Others: `stop_ncii_api.py` (+ `exchanges/clients/stopncii/api.py`), `ncmec_api.py`, `fb_threatexchange_api.py`, `file_api.py` (`local_file`, local path only), `static_sample.py` [V].
- Fetched record = `FetchDelta(updates: Dict[key, Optional[value]], checkpoint)`; `None` value = deletion; simple-updates key = `(signal_type_name, hash_str)` [V].
- HMA fetcher: `hasher-matcher-actioner/src/OpenMediaMatch/background_tasks/fetcher.py`, storage `storage/postgres/impl.py::exchange_commit_fetch`: runs every 240 s, ≤ 4 min per exchange, commits every 5000 records/60 s, asserts checkpoint time never goes backwards, metadata stored pickled, opinions/tags not used for matching [V].
- StopNCII exchange bug: `_get_delta_mapping` compares `record.hashValue` against Withdrawn/Deleted statuses instead of `hashStatus`, so deletions are never applied [V].
- HMA REST: `/m/lookup` (GET with signal_type & signal; POST multipart photo), `/m/raw_lookup`, `/h/hash`, `/c/banks`, `/c/bank/<name>/…`, `/c/exchanges` (POST `{bank, api, api_json, credential_json}`), `/c/exchange/<name>/status`, `/c/exchanges/api/<api>/schema`; docs `website/content/hma/api.md` [V]. Feedback write-back (seen / TP / FP) is not implemented in HMA today [V].
- Adding an exchange: derived image (`FROM ghcr.io/meta/threatexchange/hma` + `pip install`), add the class to `DefaultOMMStore(exchange_types=[…])` in the OMM config (see `reference_omm_configs/development_omm_config.py`), then `POST /c/exchanges` [V]. CLI manifest: `threatexchange/extensions/README.md` (`TX_MANIFEST`) [V].
- PDQ: `signal_type/pdq/signal.py`, `pdq_utils.py`, `pdq_index.py`: `^[0-9a-f]{64}$` lowercase only; match ≤ 31; quality 50 applies only when HMA hashes bytes itself [V]. vPDQ: `threatexchange/extensions/vpdq/` (signal string = `json.dumps([str(feature) …])`, see `vpdq_util.py::vpdq_to_json`), not in HMA defaults [V].
- ROOST hosts HMA office hours and integrates it in Coop: https://community.roost.tools/meetings , https://docs.roost.tools/coop/1.0/integrations/hma.html [V]; code ownership remains Meta [I].
- CDT on hash matching for NCII (match = high-signal indicator for review, not automatic removal): https://cdt.org/?p=11469 [V, summary].

## B. GenD and detector robustness (Track B)

- Paper: Yermakov, Čech, Matas, Fritz, "Deepfake Detection that Generalizes Across Benchmarks", WACV 2026, pp. 773–783, arXiv 2508.06248 (v4, 2026-05-11), DOI 10.1109/WACV61042.2026.00082, CC BY 4.0: https://arxiv.org/abs/2508.06248 [V].
- Code: https://github.com/yermandy/GenD , MIT, "Copyright (c) 2025 Andy"; key files `src/hf/modeling_gend.py`, `detector.py`, `app/run.py` (p_fake = probs[1]), `src/retinaface.py` (alignment template, scale 1.3, threshold 0.4), `src/exp/wacv_rebuttal_aug_robustness.py` [V].
- Weights (HF, MIT, public): `yermandy/GenD_CLIP_L_14` (1,215,928,160 B), `yermandy/GenD_PE_L`, `yermandy/GenD_DINOv3_L` (DINOv3 base is gated under Meta's DINOv3 licence: avoid) [V]. Collection: https://huggingface.co/collections/yermandy/gend .
- Face detector licence issue: InsightFace `buffalo_l/det_10g.onnx` (non-commercial research only), fetched from mirror `theanhntp/Liblib`: https://github.com/deepinsight/insightface/tree/master/python-package [V]. Replacement: YuNet, OpenCV Zoo, MIT: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet [I: verify the licence file while building].
- Results: Table 4 mean cross-dataset video AUROC 91.2 (CLIP) / 91.4 (PE) / 91.6 (DINOv3) over 14 datasets; trained on FF++ c23; JPEG in training augmentation; robustness only in Fig. 5 / supplement Fig. S6 [V].
- BibTeX (from the README) [V]:
  ```
  @inproceedings{GenD,
    title={Deepfake Detection that Generalizes Across Benchmarks},
    author={Yermakov, Andrii and Cech, Jan and Matas, Jiri and Fritz, Mario},
    year={2026},
    booktitle={Proceedings of the IEEE/CVF Winter Conference on Applications of Computer Vision},
    pages={773--783}}
  ```
- Pirogov & Artemev, "Evaluating Deepfake Detectors in the Wild", ICML 2025 DataWorld workshop, arXiv 2507.21905, CC BY 4.0: JPEG 95/75/50/30/10, max side 128, GPEN-enhanced fakes [V]. Repo https://github.com/messlav/Deepfake-Detectors-in-the-Wild has **no licence** (do not copy code) [V]. Dataset Swappir https://huggingface.co/datasets/Sumsub/Swappir CC BY-NC 4.0, ~117 GB [V].
- Other benchmarks: DF40 https://arxiv.org/html/2406.13495v2 ; Celeb-DF++ https://arxiv.org/html/2507.18015v1 [V, summary].

## C. Nudify ecosystem (Track C)

- Gibson et al., "Analyzing the AI Nudification Application Ecosystem", USENIX Security 2025: https://arxiv.org/pdf/2411.09751 — 20 sites; crypto dominant; 8/20 PayPal, 7/20 cards; payment processors as chokepoint [V, summary].
- ISD, "Mapping the 'Nudify' Tools Ecosystem" (2026): https://www.isdglobal.org/wp-content/uploads/2026/07/Mapping-the-Nudify-Tools-Ecosystem.pdf — concentrated infrastructure: hosts, registrars, app stores, payment systems [V, summary].
- CameraForensics on Indicator investigations (2025): https://cameraforensics.com/blog/2025/11/04/the-rise-of-nudifying-tools-and-their-threats-to-children/ — Google SSO, Amazon hosting, Cloudflare for dozens of sites [I: secondary].
- CIR, "Telegram deepfake bots are built to survive takedowns": https://www.info-res.org/cir/articles/telegram-deepfake-bots-are-built-to-survive-takedowns/ [V, summary]. Telegram bots measurement study: https://arxiv.org/pdf/2603.24302.pdf [V, summary].
- "It Takes a Forum: Resources & Stakeholders Sustaining the Online Synthetic Non-Consensual Intimate Image Creation Ecosystem", arXiv 2604.12190 (2026): https://arxiv.org/pdf/2604.12190 [V, summary].
- "Deepfake Pornography is Resilient to Regulatory and Platform Shocks", arXiv 2602.02754: https://arxiv.org/html/2602.02754v1 [V, summary].
- Public Suffix List library: `tldts` (MIT) https://github.com/remusao/tldts [I: verify].
- Certificate Transparency search: https://crt.sh (JSON output `?q=<domain>&output=json`) [I: verify rate limits and terms before scheduling].
- RDAP bootstrap: https://data.iana.org/rdap/dns.json , https://data.iana.org/rdap/ipv4.json , https://data.iana.org/rdap/ipv6.json [I: verify].

## D. Indian sextortion patterns and classifiers (Track D)

Source ids (use them in `lexicon.ts`):

- `aljazeera-2022`: https://www.aljazeera.com/economy/2022/12/29/suicidal-thoughts-strike-every-day-indias-sextortion-scourge — threat with 24 h deadline and bank deposit; 6–10 s recordings [V, summary].
- `theprint-2022-mewat`: https://theprint.in/feature/mewat-is-indias-latest-jamtara-and-sextortion-is-the-new-kill/1232746 — threat to send recording to friends and family; fake cyber-cell call about a YouTube "ashleel" video; PhonePe/GooglePay transactions [V, summary].
- `patrika-2023-sirohi`: https://www.patrika.com/sirohi-news/sextorson-gang-in-rajasthan-8387729/ — "थानेदार" and "यूटयूब मैनेजर" impersonation; payments "अलग-अलग किश्तों में"; threat "वीडियो सोशल मीडिया पर वायरल करने की धमकी" (reporter's words) [V, summary].
- `tribune-2025`: https://www.tribuneindia.com/news/delhi/man-blackmails-people-posing-as-youtube-employee-nabbed — "YouTube employee" and Delhi Police cyber crime inspector impersonation [V, summary].
- `fpj-2023-cbi`: https://www.freepressjournal.in/mumbai/mumbai-cyber-safe-fake-cbi-officer-threatens-sextorted-man-with-arrest-siphoned-of-65k — fake CBI officer, payments "to delete the video" [V, summary].
- `amarujala-2025-bhopal`: https://www.amarujala.com/madhya-pradesh/bhopal/bhopal-woman-blackmailed-with-obscene-video-after-kids-answered-video-call-2025-08-23 — "अकेले मिलने आओ, वीडियो डिलीट कर दूंगा"; sent to family WhatsApp group [V, summary].
- `amarujala-2026-agra`: https://www.amarujala.com/uttar-pradesh/agra/man-blackmails-girl-using-objectionable-pic-forces-her-to-send-sister-in-law-fir-registered-in-agra-2026-01-23 — "अपनी भाभी को मेरे पास लेकर आओ नहीं तो वीडियो सोशल मीडिया पर वायरल कर दूंगा" [V, summary].
- `amarujala-2025-gorakhpur`: https://www.amarujala.com/gorakhpur/gorakhpur-woman-ends-life-after-blackmail-threats-over-obscene-video-cyber-fraud-exposed-2025-08-17 — repeat control messages, victim plea "भाई प्लीज, वीडियो वायरल मत करना", half-hour deadlines, instalments [V, summary].
- `quint-2025-loanapp`: https://www.thequint.com/news/webqoof/fake-loan-app-scam-where-scammers-threaten-victims-with-morphed-photos-and-chat-leaks ; `lokmat-loanapp`: https://www.lokmattimes.com/mumbai/mumbai-loan-app-horror-womans-morphed-nudes-sent-to-family-despite-overpayment-a525 ; `dh-loanapp`: https://www.deccanherald.com/india/karnataka/bengaluru/loan-app-agents-harass-woman-with-her-and-daughter-s-morphed-pics-2890306 — loan-app morphing threats to contacts (no message text quoted) [V, summary].
- `aajtak-2025`: https://www.aajtak.in/india/maharashtra/story/blackmail-and-extortion-threatened-a-young-man-by-sending-obscene-video-and-demanded-70-thousand-rupees-lclcn-rptc-2161165-2025-02-07 — partner-video threat with "proof" clip [V, summary].
- Official guidance: do not take video calls from unknown numbers, do not pay, report at 1930 / cybercrime.gov.in; police/CBI/ED do not arrest over video calls (I4C/MHA advisories, via news coverage) [I: the I4C advisory page itself was unreachable]. MeitY NCII SOP (11 Nov 2025): 24 h takedown, hash matching, de-indexing [I: via coverage].
- NCRB 2023: of 86,420 cybercrimes, 4,199 had sexual exploitation as motive, 3,326 extortion [I: via coverage].
- No verbatim romanised Hinglish threat text was found in authoritative sources; romanised lexicon entries are derived [V].
- Models: MuRIL `google/muril-base-cased` (Apache-2.0 [I: check the base card]); study showing MuRIL best on Hinglish cyberbullying: arXiv 2506.16066 [V, summary]; L3Cube HingBERT/HingRoBERTa (CC BY 4.0 cards) https://github.com/l3cube-pune/code-mixed-nlp [V, summary]; IndicBERT v2 (MIT [I]); XLM-R (MIT).
- Datasets (do not train on them; licences unclear or research-only): HASOC, TRAC-1 (has sexual-threat labels) https://github.com/kmi-linguistics/trac-1 , MACD https://github.com/ShareChatAI/MACD (no licence), PAN12 (Zenodo 3713280), Bristol Scam Survivors sextortion reports (Mendeley xp8n69sdtp), Razi et al. "Sliding into My DMs" CSCW 2023 (data not public) [V, summary].
- Synthetic data cautions: ToxiLab arXiv 2411.15175; synthetic vs gold labels arXiv 2502.15860; LLMs in abuse detection survey arXiv 2604.00323 [V, summary].
- Bias: Sap et al., "The Risk of Racial Bias in Hate Speech Detection", ACL 2019 (P19-1163) [V, summary].
- Signals not verdicts: Meta, July 2024: https://about.fb.com/news/2024/07/combating-financial-sextortion-scams-from-nigeria/ [V, summary].
- Language: eSafety on not using "revenge porn": https://www.esafety.gov.au/about-us/blog/revenge-porn-another-name [V, summary].
