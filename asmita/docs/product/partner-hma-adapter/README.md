# Asmita exchange adapter for Hasher-Matcher-Actioner (HMA) - moved

The example adapter that lived here (`asmita_signal_exchange.py` and this
README) is now a maintained package:

**`integrations/hma/tx-extension-asmita/`** in this repository - a pip-installable
`SignalExchangeAPI` for python-threatexchange that subscribes an HMA / Open
Media Match deployment to Asmita's `/api/partner/v1/signals` feed, with
explicit deletions for withdrawals and outcome reporting.

Its README carries the registration instructions for current HMA (Open Media
Match) and the python-threatexchange CLI, the build steps, and the licence and
attribution. `LICENSE-THREATEXCHANGE.txt` stays here and beside the package:
the package implements an interface from Meta's ThreatExchange project (BSD),
and its own licence (BSD-3-Clause) and NOTICE carry the same attribution.
