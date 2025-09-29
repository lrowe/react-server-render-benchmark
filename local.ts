import { render_page } from "./renderer.js";
import { Cache } from "./shared.ts";

// // 785 us
// import { jsonlinesConnection } from "./shared.ts";
// const conn = jsonlinesConnection(
//   Deno.readTextFileSync("./biosample.jsonlines"),
// );

// // 856 us
// import { SqliteConnection } from "./shared.ts";
// import { DatabaseSync } from "node:sqlite";
// const db = new DatabaseSync("biosample.sqlite");
// const conn = new SqliteConnection(db);

// 1225 us (frequently errors when run on unix socket)
import { RemoteConnection } from "./shared.ts";
const kvmserverguest = Deno.dlopen("libkvmserverguest.so", {
  remote_resume: { parameters: ["buffer", "usize"], result: "void" },
});
const conn = new RemoteConnection(kvmserverguest.symbols.remote_resume);

// // 1090 us / 1110 us (remote not under kvmserver or under)
// import { UnixConnection } from "./libc.ts";
// const conn = new UnixConnection("data.sock");

function handler(_req: Request): Response {
  const href = "/biosamples/ENCBS435HZC/";
  using cache = new Cache(conn);
  const context = cache.getCached(href);
  const body = render_page({
    context,
    href,
    inline: "",
    styles: "/static/build/cssFile",
  });
  return new Response(body);
}

const [arg = "8000"] = Deno.args;
const options = Number.isInteger(Number(arg))
  ? { port: Number(arg) }
  : { path: arg };
Deno.serve(options, handler);
