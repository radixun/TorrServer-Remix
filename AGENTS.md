# Development Instructions

TorrServer Remix by radixun is a fork of YouROK/TorrServer; preserve upstream
attribution and all third-party license notices. See README.md and docs/FORK_CHANGES.md.

Use build-all.sh for a fresh web and server build. Generated embed bindings,
web/build, dist, dependency caches and local configuration stay out of Git.
Do not add media libraries, media files, databases, signing keys or credentials.

Put temporary agent diagnostics in .agent-work/ and verify it is ignored before
use. Keep product source, tests and documentation in their component paths.

Default UI work to desktop. Do not add mobile UI or mobile testing unless the
maintainer explicitly requests it. Existing TV sources are retained; TV runtime
validation requires a suitable device and separate explicit scope.

Build success is not playback acceptance. Run runtime tests only on a suitable,
maintainer-approved test host; do not deploy to a production host as part of a
source build or cleanup. Preserve existing user configuration and media state.
