import { TextLineStream } from "jsr:@std/streams@1/text-line-stream";
import { DatabaseSync } from "node:sqlite";

const [infile, outfile] = Deno.args;
const db = new DatabaseSync(outfile);
db.exec(
  `CREATE TABLE IF NOT EXISTS items (id text primary key, object text not null) STRICT`,
);
const insert = db.prepare(`INSERT INTO items (id, object) VALUES (?, ?)`);

const lines = Deno.openSync(infile).readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream());

for await (const line of lines) {
  const item = JSON.parse(line);
  insert.run(item["@id"], line);
}
db.close();
