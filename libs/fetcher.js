export const fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching data.');
    error.status = res.status;
    throw error;
  }
  return res.json();
};
