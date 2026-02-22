function buildPrefix({ timestamp, method, route }) {
  const methodLabel = method || 'UNKNOWN';
  const routeLabel = route || 'api';
  return `[${timestamp}] [${methodLabel}] [${routeLabel}]`;
}

export function createRequestLogger(req, route) {
  const timestamp = new Date().toISOString();
  const base = {
    timestamp,
    method: req?.method,
    route,
  };

  return {
    timestamp,
    info(message, meta) {
      if (meta !== undefined) {
        console.log(`${buildPrefix(base)} ${message}`, meta);
        return;
      }

      console.log(`${buildPrefix(base)} ${message}`);
    },
    warn(message, meta) {
      if (meta !== undefined) {
        console.warn(`${buildPrefix(base)} ${message}`, meta);
        return;
      }

      console.warn(`${buildPrefix(base)} ${message}`);
    },
    error(message, meta) {
      if (meta !== undefined) {
        console.error(`${buildPrefix(base)} ${message}`, meta);
        return;
      }

      console.error(`${buildPrefix(base)} ${message}`);
    },
  };
}
