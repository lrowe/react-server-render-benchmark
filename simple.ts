// // 110 us
// import { jsonlinesConnection } from "./shared.ts";
// const conn = jsonlinesConnection(
//   Deno.readTextFileSync("./biosample.jsonlines"),
// );

// // 130 us
// import { SqliteConnection } from "./shared.ts";
// import { DatabaseSync } from "node:sqlite";
// const db = new DatabaseSync("biosample.sqlite");
// const conn = new SqliteConnection(db);

// 420 us
import { RemoteConnection } from "./shared.ts";
const kvmserverguest = Deno.dlopen("libkvmserverguest.so", {
  remote_resume: { parameters: ["buffer", "usize"], result: "void" },
});
const conn = new RemoteConnection(kvmserverguest.symbols.remote_resume);

// // 170 us
// import { BUFFER_SIZE, RemoteConnection, SqliteConnection } from "./shared.ts";
// import { DatabaseSync } from "node:sqlite";
// const db = new DatabaseSync("biosample.sqlite");
// const conn2 = new SqliteConnection(db);
// const conn = new RemoteConnection((buf, _len) => {
//   if (buf === null) {
//     return;
//   }
//   const bufptr = Deno.UnsafePointer.of(buf);
//   if (bufptr === null) {
//     return;
//   }
//   const arrayBuffer = Deno.UnsafePointerView.getArrayBuffer(
//     bufptr,
//     BUFFER_SIZE,
//   );
//   // const arrayBuffer = (buf as Uint8Array).buffer;
//   const size_buffer = new Uint32Array(arrayBuffer, 0, 1);
//   const [size] = size_buffer;
//   const request_buffer = new Uint8Array(
//     arrayBuffer,
//     size_buffer.byteLength,
//     size,
//   );
//   const key = new TextDecoder().decode(request_buffer.slice(0, size));
//   const value = conn2.get(key) ?? "";
//   const response_buffer = new Uint8Array(arrayBuffer, size_buffer.byteLength);
//   const { written } = new TextEncoder().encodeInto(value, response_buffer);
//   size_buffer[0] = written;
// });

// // 470 us (storage not in kvmserve)
// import { UnixConnection } from "./libc.ts";
// const conn = new UnixConnection("data.sock");

const ids = [
  "/awards/UM1HG009411/",
  "/biosample-types/cell_line_EFO_0001182/",
  "/biosamples/ENCBS435HZC/",
  "/human-donors/ENCDO000ABF/",
  "/labs/richard-myers/",
  "/organisms/human/",
  "/publications/b42243ab-26d8-4ff6-b801-d368df994167/",
  "/sources/richard-myers/",
  "/users/5e189705-c6ca-4849-ab5c-e6d679dc96ae/",
  "/users/a62cfec5-57a0-45ab-b943-8ca0e0057bb6/",
];

function handler(_req: Request): Response {
  let size = 0;
  for (const id of ids) {
    size += (conn.get(id) ?? "").length;
  }
  return new Response(`total ${size}\n`);
}

const [arg = "8000"] = Deno.args;
const options = Number.isInteger(Number(arg))
  ? { port: Number(arg) }
  : { path: arg };
Deno.serve(options, handler);
