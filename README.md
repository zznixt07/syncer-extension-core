# Syncer Extension Core

Public TypeScript source for behavior shared by Syncer's Chrome extension, iOS Safari extension, and Android WebView client. The package contains no platform manifests or store entry points.

## Modules

- protocol-v2 validation and sequence ordering
- clock estimation and synchronization math
- browser media controller and YouTube/Spotify/HTML identity adapters
- delayed/nested cross-origin frame command relay
- reconnect/rejoin/latest-command lifecycle state
- Socket.IO room client and persistence adapters
- popup actions, state helpers, and base styling

## Reproducible release flow

1. Run `npm ci && npm run check`.
2. Commit, tag the release (`vX.Y.Z`), and push the tag.
3. Update each client dependency to the exact core commit SHA.
4. Run each client's full validation and commit regenerated browser resources.

Both extension clients bundle core code into their shipped resources. End users never install this package at runtime.
