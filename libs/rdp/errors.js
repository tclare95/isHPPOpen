import "server-only";

// Only fixed codes/status leave this boundary; never retain an SDK error or body.
export class RdpError extends Error {
  constructor(code, status = 0) {
    super(`RDP ${code}`);
    this.name = "RdpError";
    this.code = code;
    this.status = status;
  }
}
