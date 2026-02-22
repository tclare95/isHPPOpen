export const fetcher = async (url) => {
  const res = await fetch(url);

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const errorMessage = payload?.error?.message || payload?.message || 'An error occurred while fetching data.';
    const error = new Error(errorMessage);
    error.status = res.status;
    error.payload = payload;
    throw error;
  }

  if (payload?.ok === false) {
    const error = new Error(payload?.error?.message || 'An error occurred while fetching data.');
    error.status = res.status;
    error.payload = payload;
    throw error;
  }

  if (payload?.ok === true && Object.hasOwn(payload, 'data')) {
    return payload.data;
  }

  return payload;
};
