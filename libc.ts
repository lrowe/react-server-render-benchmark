export const AF_UNIX = 1;
export const AF_INET = 2;
export const SHUT_WR = 1;
export const SOCK_STREAM = 1;
export const SOCK_DGRAM = 2;
export const SOCK_SEQPACKET = 5;

export const libc = Deno.dlopen("libc.so.6", {
  accept4: {
    parameters: ["i32", "pointer", "pointer", "i32"] as [
      sockfd: "i32",
      addr: "pointer",
      addrlen: "pointer",
      flags: "i32",
    ],
    result: "i32",
  },
  bind: {
    parameters: ["i32", "buffer", "u32"] as [
      sockfd: "i32",
      addr: "buffer",
      addrlen: "u32",
    ],
    result: "i32",
  },
  close: {
    parameters: ["i32"] as [fd: "i32"],
    result: "i32",
  },
  connect: {
    parameters: ["i32", "buffer", "u32"] as [
      sockfd: "i32",
      addr: "buffer",
      addrlen: "u32",
    ],
    result: "i32",
  },
  errno: { type: "pointer" },
  listen: {
    parameters: ["i32", "i32"] as [sockfd: "i32", backlog: "i32"],
    result: "i32",
  },
  recv: {
    parameters: ["i32", "buffer", "i64", "i32"] as [
      sockfd: "i32",
      buf: "buffer",
      size: "i64",
      flags: "i32",
    ],
    result: "i64",
  },
  send: {
    parameters: ["i32", "buffer", "i64", "i32"] as [
      sockfd: "i32",
      buf: "buffer",
      size: "i64",
      flags: "i32",
    ],
    result: "i64",
  },
  shutdown: {
    parameters: ["i32", "i32"] as [sockfd: "i32", how: "i32"],
    result: "i32",
  },
  socket: {
    parameters: ["i32", "i32", "i32"] as [
      domain: "i32",
      type: "i32",
      protocol: "i32",
    ],
    result: "i32",
  },
  strerror: {
    parameters: ["i32"] as [errnum: "i32"],
    result: "pointer",
  },
});

const errnoPtr = new Deno.UnsafePointerView(libc.symbols.errno!);
export const errno = () => errnoPtr.getInt32();
export const strerror = (errnum: number = errno()) => {
  const ptr = libc.symbols.strerror(errnum);
  return ptr === null ? "" : new Deno.UnsafePointerView(ptr).getCString();
};
class LibcError extends Error {
  constructor(message: string) {
    super(`${message}: ${strerror()}`);
  }
}

export function sockaddr_un(path: string): Uint8Array<ArrayBuffer> {
  const chars = new TextEncoder().encode(
    path.charCodeAt(0) === 0 ? path : path + "\0",
  );
  const sockaddr = new Uint8Array(2 + chars.byteLength);
  new Uint16Array(sockaddr.buffer, 0, 1)[0] = AF_UNIX;
  sockaddr.set(chars, 2);
  return sockaddr;
}

import { BUFFER_SIZE, type Connection } from "./shared.ts";
export class UnixConnection implements Connection {
  buf = new Uint8Array(BUFFER_SIZE);
  sockaddr: Uint8Array<ArrayBuffer>;
  connfd: number = -1;
  constructor(path: string) {
    this.sockaddr = sockaddr_un(path);
  }
  open() {
    this.connfd = libc.symbols.socket(AF_UNIX, SOCK_SEQPACKET, 0);
    if (this.connfd < 0) {
      throw new LibcError("socket");
    }
    if (
      libc.symbols.connect(
        this.connfd,
        this.sockaddr,
        this.sockaddr.byteLength,
      ) < 0
    ) {
      throw new LibcError("connect");
    }
  }
  get(key: string): string | undefined {
    if (this.connfd < 0) {
      this.open();
    }
    const { written } = new TextEncoder().encodeInto(key, this.buf);
    const bytesSent = libc.symbols.send(
      this.connfd,
      this.buf,
      BigInt(written),
      0,
    );
    if (bytesSent > 0) {
      const bytesRead = Number(
        libc.symbols.recv(
          this.connfd,
          this.buf,
          BigInt(this.buf.byteLength),
          0,
        ),
      );
      if (bytesRead > 0) {
        const value = new TextDecoder().decode(
          new Uint8Array(this.buf.buffer, 0, bytesRead),
        );
        return value === "null" ? undefined : value;
      } else if (bytesRead === 0) {
        throw new Error("recv: connection closed");
      } else {
        throw new LibcError("recv");
      }
    } else if (bytesSent === 0n) {
      throw new Error("send: connection closed");
    } else {
      throw new LibcError("send");
    }
  }
  reset() {
    if (libc.symbols.close(this.connfd) < 0) {
      throw new LibcError("close");
    }
    this.connfd = -1;
  }
}

if (import.meta.main) {
  const { SqliteConnection } = await import("./shared.ts");
  const { DatabaseSync } = await import("node:sqlite");

  const db = new DatabaseSync("biosample.sqlite");
  const storage = new SqliteConnection(db);
  const buf = new Uint8Array(BUFFER_SIZE);

  const sockaddr = sockaddr_un("data.sock");
  const listenfd = libc.symbols.socket(AF_UNIX, SOCK_SEQPACKET, 0);
  if (listenfd < 0) {
    throw new LibcError("socket");
  }
  if (libc.symbols.bind(listenfd, sockaddr, sockaddr.byteLength) < 0) {
    throw new LibcError("bind");
  }
  if (libc.symbols.listen(listenfd, 1) < 0) {
    throw new LibcError("listen");
  }

  while (true) {
    const connfd = libc.symbols.accept4(listenfd, null, null, 0);
    if (connfd < 0) {
      throw new LibcError("accept");
    }
    while (true) {
      const bytesRead = Number(libc.symbols.recv(
        connfd,
        buf,
        BigInt(buf.byteLength),
        0,
      ));
      if (bytesRead > 0) {
        const key = new TextDecoder().decode(
          new Uint8Array(buf.buffer, 0, bytesRead),
        );
        const value = storage.get(key) || "null";
        const { written } = new TextEncoder().encodeInto(value, buf);
        const bytesSent = Number(
          libc.symbols.send(connfd, buf, BigInt(written), 0),
        );
        if (bytesSent > 0) {
          continue;
        } else if (bytesSent === 0) {
          storage.reset?.();
          break;
        } else {
          throw new LibcError("send");
        }
      } else if (bytesRead === 0) {
        storage.reset?.();
        break;
      } else {
        throw new LibcError("recv");
      }
    }
    if (libc.symbols.close(connfd) < 0) {
      throw new LibcError("close");
    }
  }
}
