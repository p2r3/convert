# thanks to usestrict for providing these patches and flags
# https://github.com/use-strict/7z-wasm
export ST_MODE='1'
export LDFLAGS_EMCC='-O2 -sENVIRONMENT=web,worker,node -s "EXPORTED_RUNTIME_METHODS=['FS','callMain']" \
    -s INVOKE_RUN=0 -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=SevenZip \
    --emit-tsd 7zz.d.ts'
cd CPP/7zip/Bundles/Alone2
emmake make $JOBS -f makefile.emcc DISABLE_RAR=1
cp _o/7zz.* $OUT_DIR/
