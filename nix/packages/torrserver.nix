{
  lib,
  buildGoModule,
  pkg-config,
  src,
  pkgs,
  ...
}:
pkgs.stdenv.mkDerivation rec {
  pname = "torrserver";
  version = "MatriX.145.1-mod";

  inherit src;
  yarnOfflineCache = pkgs.fetchYarnDeps {
    yarnLock = "${src}/web/yarn.lock";
    hash = "sha256-nOVycryTbPldoxdU4ypZ2IKe+p0/9su5JO/8dXumD7E=";
  };

  goModules = pkgs.buildGoModule.override { go = pkgs.go_1_26; } {
    pname = "torrserver-go-deps";
    version = version;
    src = "${src}/server";
    vendorHash = "sha256-Ux66KP2vHduRBNUxlYt5Udm90YUzbvc2rA2qDPMsB/4=";
    modBuildPhase = ''
      go mod download
      go mod vendor -e
    '';

    installPhase = ''
      mkdir -p $out
      cp -r vendor $out/
    '';

    doCheck = false;
    doInstallCheck = false;
    buildPhase = "true";
  };

  nativeBuildInputs = with pkgs; [
    go_1_26
    pkg-config
    git
    yarn
    fixup-yarn-lock
    nodejs
  ];

  buildInputs = with pkgs; [
    fuse
  ];

  buildPhase = ''
    export GOCACHE=$TMPDIR/go-build
    export GOMODCACHE=$TMPDIR/go-mod
    export YARN_CACHE_FOLDER=$TMPDIR/yarn-cache
    export NODE_OPTIONS=--openssl-legacy-provider
    export PATH=$PATH:$(go env GOPATH)/bin

    cd web
    runHook preConfigure
    yarn config --offline set yarn-offline-mirror ${yarnOfflineCache}
    fixup-yarn-lock yarn.lock
    yarn install --offline --frozen-lockfile --ignore-platform --ignore-scripts --no-progress --non-interactive
    patchShebangs node_modules/
    yarn build
    cd ..

    go run gen_web.go

    mkdir -p server/vendor
    cp -r ${goModules}/vendor/* server/vendor/
    chmod -R +w server/vendor

    cd server
    mkdir -p ../dist
    CGO_ENABLED=0 go build \
      -ldflags="-s -w -checklinkname=0 -X server/version.Version=${version}" \
      -tags=nosqlite \
      -trimpath \
      -o ../dist/torrserver ./cmd
    cd ..
  '';

  installPhase = ''
    mkdir -p $out/bin
    cp dist/torrserver $out/bin/torrserver
    chmod +x $out/bin/torrserver
  '';

  meta = with pkgs.lib; {
    description = "Simple and powerful tool for streaming torrents";
    homepage = "https://github.com/radixun/TorrServer-Remix";
    license = licenses.gpl3Only;
    mainProgram = "torrserver";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
      "x86_64-darwin"
    ];
  };
}
