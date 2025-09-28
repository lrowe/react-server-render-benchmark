import type sqlite from "node:sqlite";
export const BUFFER_SIZE = 4096;
export type CachedObject = Record<string | number | symbol, unknown>;

export type Connection = {
  reset?: () => void;
  get: (key: string) => string | undefined;
};

export function jsonlinesConnection(jsonlines: string): Connection {
  return new Map(
    jsonlines.split(/(?<=\n)/).map((line) => [JSON.parse(line)["@id"], line]),
  );
}

export class SqliteConnection implements Connection {
  db: sqlite.DatabaseSync;
  select: sqlite.StatementSync;
  constructor(db: sqlite.DatabaseSync) {
    this.db = db;
    this.select = this.db.prepare(`SELECT object FROM items WHERE id = ?`);
    this.db.exec("BEGIN");
  }
  get(key: string): string | undefined {
    return this.select.get(key)?.object as string | undefined;
  }
  reset() {
    this.db.exec("ROLLBACK;BEGIN");
  }
}

export class RemoteConnection implements Connection {
  remote_buffer = new Uint8Array(BUFFER_SIZE);
  size_buffer = new Uint32Array(this.remote_buffer.buffer, 0, 1);
  request_buffer = new Uint8Array(
    this.remote_buffer.buffer,
    this.size_buffer.byteLength,
  );
  remote_resume: (buf: BufferSource | null, len: bigint) => void;
  constructor(remote_resume: (buf: BufferSource | null, len: bigint) => void) {
    this.remote_resume = remote_resume;
  }
  get(key: string): string | undefined {
    const { written } = new TextEncoder().encodeInto(key, this.request_buffer);
    this.size_buffer[0] = written;
    this.remote_resume(
      this.remote_buffer,
      BigInt(this.remote_buffer.byteLength),
    );
    const [size] = this.size_buffer;
    if (size === 0) {
      return undefined;
    }
    const response_buffer = new Uint8Array(
      this.remote_buffer.buffer,
      this.size_buffer.byteLength,
      size,
    );
    return new TextDecoder().decode(response_buffer);
  }
  reset() {
    this.remote_resume(null, 0n);
  }
}

export class Cache {
  conn: Connection;
  cache: Map<string, CachedObject | null>;
  constructor(next: Connection) {
    this.cache = new Map();
    this.conn = next;
  }

  [Symbol.dispose]() {
    this.cache.clear();
    this.conn.reset?.();
  }

  getCached(key: string): CachedObject | null {
    const found = this.cache.get(key);
    if (found !== undefined) {
      return found;
    }
    const line = this.conn.get(key);
    if (line === undefined) {
      this.cache.set(key, null);
      return null;
    }
    const value = JSON.parse(line);
    const proxy = new Proxy(value, this);
    this.cache.set(key, proxy);
    return proxy;
  }

  get(target: CachedObject, p: string | number | symbol, receiver: unknown) {
    if (p === "toJSON") {
      return () => target;
    } else if (p === "toString") {
      return () => target["@id"] ?? String(target);
    }
    const value = Reflect.get(target, p, receiver);
    if (typeof value === "string") {
      if (value[0] === "/") {
        return this.getCached(value) ?? value;
      }
    } else if (typeof value === "object" && value !== null) {
      const proxy = new Proxy(value, this);
      return proxy;
    }
    return value;
  }
}
