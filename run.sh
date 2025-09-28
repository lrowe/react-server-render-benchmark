#!/bin/bash
export DENO_V8_FLAGS=--predictable,--max-old-space-size=256,--max-semi-space-size=256
rm -f bench.sock
exec ../../../.build/kvmserver -e -t 1 --warmup 1000 --storage --storage-1-to-1 --allow-all deno -- run --allow-all simple.ts bench.sock
