# Fork Attribution and Changes

This work derives from YouROK/TorrServer, tag MatriX.141, commit
`d266990face0a530880a19a3e39666d21931aed9`, under its preserved GPLv3 license.
Original authorship, notices and third-party licenses remain attributed.
The maintainer of the personal modifications is radixun.

The fork includes changes developed during 2026 in the React cinema interface,
Go metadata/search APIs, offline storage, browser media worker, macOS VLC handler
and TV client. These are local modifications, not claims of acceptance or release
by the upstream project.

On 2026-09-30 the source distribution was organized for public publication:
- removed generated builds, dependency caches and stale distribution binaries;
- retained private operational notes, old upstream installers and release
  automation outside the public tree;
- replaced build and container entry points with fork source builds, without
  automatic container publishing or deployment;
- made web embedding portable and ensured it consumes exactly one fresh build;
- replaced private infrastructure values in public defaults and examples;
- retained TV version 0.2.10 / 12 and marked server builds MatriX.141-mod;
- preserved licenses for TorrServer, Media3, FFmpeg and Inter.

The public branch starts from upstream MatriX.141, followed by one fork snapshot
commit. Public upstream history establishes provenance; previous private
development commits and operational state are not distributed. No media library or movie files are included.

The cinema title page restores per-file watched indicators from the existing
server `/viewed` history, including records created before the redesign or by
other clients. Browser playback records the file when video starts playing,
including playback from offline storage. Each movie/episode has a manual toggle
to set or remove its mark. As in upstream, a watched mark means the file was
opened for playback; it does not prove completion and is separate from the
browser's saved resume position.
