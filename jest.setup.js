require('@testing-library/jest-dom');

require('dotenv').config({ path: '.env.test' });

global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};