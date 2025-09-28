const items = new Map();

function recurse(obj: unknown): unknown {
  if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.map(recurse);
    }
    const filtered = Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, recurse(v)]),
    );
    // @ts-ignore: https://github.com/microsoft/TypeScript/issues/51903
    const id = obj["@id"];
    if (typeof id === "string") {
      items.set(id, filtered);
      return id;
    } else {
      return filtered;
    }
  }
  return obj;
}

const input = JSON.parse(Deno.readTextFileSync(Deno.args[0]));
recurse(input);
for (const item of items.values()) {
  console.log(JSON.stringify(item));
}
