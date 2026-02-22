require('@testing-library/jest-dom');
const { TextEncoder, TextDecoder } = require('util');

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}

require('dotenv').config({ path: '.env.test' });

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json(payload, init = {}) {
      return {
        status: init.status || 200,
        headers: init.headers || {},
        async json() {
          return payload;
        },
      };
    },
  },
}));

if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class Request {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this.headers = init.headers || {};
      this.body = init.body;
    }

    async json() {
      return this.body ? JSON.parse(this.body) : {};
    }
  };
}

global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};