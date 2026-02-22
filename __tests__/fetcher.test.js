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

test('fetcher unwraps ok envelope payload', async () => {
  fetch.mockImplementationOnce(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ok: true, data: { value: 123 } })
  }))

  const data = await fetcher('/api/enveloped')
  expect(data).toEqual({ value: 123 })
})

test('fetcher throws error on non-ok response', async () => {
  fetch.mockImplementationOnce(() => Promise.resolve({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ ok: false, error: { message: 'Not found' } })
  }))
  
  await expect(fetcher('/api/notfound')).rejects.toThrow('Not found')
})
