# TorrServer mod web client

React 17 / Create React App 4, with the cinema interface added by this fork.
Node.js 24 and Yarn 1.22.22 are used for the documented build.

```sh
yarn install --frozen-lockfile
NODE_OPTIONS=--openssl-legacy-provider GENERATE_SOURCEMAP=false yarn build
```

Leave `REACT_APP_SERVER_HOST` empty for a UI served by TorrServer itself.
For a temporary desktop preview, run `../scripts/preview-web.cjs` with an
explicit `TORRSERVER_URL`. The preview binds to loopback by default.
Do not compile private URLs or API keys into a distributable build.
Configure optional TMDB and Torznab credentials in the running server settings.

`yarn lint` checks source; `yarn fix` changes formatting.
Generated output is `build/` and is excluded from Git. The root `build-all.sh`
rebuilds it before generating the server's embedded pages.
