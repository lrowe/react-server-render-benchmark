import { BUFFER_SIZE, SqliteConnection } from "./shared.ts";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("biosample.sqlite");
const conn = new SqliteConnection(db);

const kvmserverguest = Deno.dlopen("libkvmserverguest.so", {
  storage_wait_paused: { parameters: [], result: "pointer" },
});
const { storage_wait_paused } = kvmserverguest.symbols;

while (true) {
  const bufptr = storage_wait_paused();
  if (bufptr === null) {
    conn.reset();
    continue;
  }
  const arrayBuffer = Deno.UnsafePointerView.getArrayBuffer(
    bufptr,
    BUFFER_SIZE,
  );
  const size_buffer = new Uint32Array(arrayBuffer, 0, 1);
  const [size] = size_buffer;
  const request_buffer = new Uint8Array(
    arrayBuffer,
    size_buffer.byteLength,
    size,
  );
  const key = new TextDecoder().decode(request_buffer.slice(0, size));
  const value = conn.get(key) ?? "";
  const response_buffer = new Uint8Array(arrayBuffer, size_buffer.byteLength);
  const { written } = new TextEncoder().encodeInto(value, response_buffer);
  size_buffer[0] = written;
}
