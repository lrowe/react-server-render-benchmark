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

// 450 us (but over tcp as unix socket errors)
import { RemoteConnection } from "./shared.ts";
const kvmserverguest = Deno.dlopen("libkvmserverguest.so", {
  remote_resume: { parameters: ["buffer", "usize"], result: "void" },
});
const conn = new RemoteConnection(kvmserverguest.symbols.remote_resume);

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
