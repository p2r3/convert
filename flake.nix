{
  description = "p2r3-convert - Truly universal browser-based file converter";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShell = pkgs.mkShell {
          packages = with pkgs; [
            bun.packages.${system}.bun
            git
            pkg-config
            cairo
            pango
            gdk-pixbuf
            gtk3
            libnotify
            libsecret
            cups
            libdbus
            at-spi2-core
            xorg.libX11
            xorg.libXrender
            xorg.libXtst
            xorg.libXdamage
            xorg.libXext
            xorg.libXfixes
            xorg.libXrandr
            xorg.libxkbfile
            xorg.libxshmfence
            elfutils
          ];

          shellHook = ''
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
          '';
        };

        packages.default = pkgs.stdenv.mkDerivation {
          pname = "p2r3-convert";
          version = "0.0.0";
          src = self;

          nativeBuildInputs = with pkgs; [
            git
            pkg-config
            cairo
            pango
            gdk-pixbuf
            gtk3
            libnotify
            libsecret
            cups
            at-spi2-core
            libx11
            libxrender
            libxtst
            libxdamage
            libxext
            libxfixes
            libxrandr
            libxkbfile
            libxshmfence
            elfutils
            curl
            unzip
            cacert
            nodejs
          ];

          buildInputs = with pkgs; [
            stdenv.cc.cc
          ];

          buildPhase = ''
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
            export PUPPETEER_SKIP_DOWNLOAD=1
            export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"

            # Work in /tmp since $src is read-only
            cd /tmp
            rm -rf convert project
            git clone --recurse-submodules https://github.com/p2r3/convert.git project
            cd project

            # Download and install bun
            export BUN_INSTALL="$PWD/bun-install"
            curl -fsSL https://bun.sh/install | BUN_INSTALL="$BUN_INSTALL" bash
            export PATH="$BUN_INSTALL/bin:$PATH"

            bun --version
            bun install --frozen-lockfile
            bun run build
          '';

        installPhase = ''
            mkdir -p $out
            cp -r /tmp/project/dist $out/
          '';
        };
      }
    );
}