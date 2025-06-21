import { fetcher } from '../libs/fetcher'

global.fetch = jest.fn(() => Promise.resolve({
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
