# tx-extension-asmita: the Asmita signal exchange for python-threatexchange.
#
# Register this package with the threatexchange CLI, and import
# AsmitaSignalExchangeAPI into an HMA / Open Media Match deployment's OMM
# config. See README.md for the three-step quick start.

from threatexchange.extensions.manifest import ThreatExchangeExtensionManifest

from tx_extension_asmita.asmita_api import (
    AsmitaCheckpoint,
    AsmitaCollabConfig,
    AsmitaCredentials,
    AsmitaSignalExchangeAPI,
    AsmitaSignalMetadata,
)

TX_MANIFEST = ThreatExchangeExtensionManifest(apis=(AsmitaSignalExchangeAPI,))

__all__ = [
    "TX_MANIFEST",
    "AsmitaCheckpoint",
    "AsmitaCollabConfig",
    "AsmitaCredentials",
    "AsmitaSignalExchangeAPI",
    "AsmitaSignalMetadata",
]
