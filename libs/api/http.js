import { ValidationError } from 'yup';
import { getServerSession } from 'next-auth/next';

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function methodNotAllowed(req, res, allowedMethods) {
  res.setHeader('Allow', allowedMethods);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}

export function getMethodHandler(req, res, handlers) {
  const allowedMethods = Object.keys(handlers);
  const methodHandler = handlers[req.method];

  if (!methodHandler) {
    methodNotAllowed(req, res, allowedMethods);
    return null;
  }

  return methodHandler;
}

export async function requireSession(req, res, authOptions) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    throw new HttpError(401, 'Unauthorized');
  }

  return session;
}

export function parseRequestBody(body) {
  if (typeof body === 'string') {
    return JSON.parse(body);
  }

  if (body && typeof body === 'object') {
    const bodyKeys = Object.keys(body);

    if (bodyKeys.length === 1 && body[bodyKeys[0]] === '') {
      return JSON.parse(bodyKeys[0]);
    }

    return body;
  }

  return body;
}

export function mapApiError(error) {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof SyntaxError) {
    return { statusCode: 400, message: 'Invalid request body' };
  }

  if (error instanceof ValidationError) {
    return { statusCode: 400, message: error.message };
  }

  if (error?.name === 'BSONError') {
    return { statusCode: 400, message: 'Invalid id parameter' };
  }

  return { statusCode: 500, message: 'Internal Server Error' };
}
