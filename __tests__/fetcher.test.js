import { fetcher } from '../libs/fetcher'

global.fetch = jest.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ success: true })
}))

afterEach(() => {
  fetch.mockClear()
})

test('fetcher returns parsed json', async () => {
  const data = await fetcher('/api/test')
  expect(fetch).toHaveBeenCalledWith('/api/test')
  expect(data).toEqual({ success: true })
})

test('fetcher throws error on non-ok response', async () => {
  fetch.mockImplementationOnce(() => Promise.resolve({
    ok: false,
    status: 404
  }))
  
  await expect(fetcher('/api/notfound')).rejects.toThrow('An error occurred while fetching data.')
})
