import {
  getRepositoryMetadata,
  getContainerRegistryURL
} from '../src/api-client'

const url = 'https://registry.example.com'

let fetchMock: jest.SpyInstance

beforeEach(() => {
  fetchMock = jest.spyOn(global, 'fetch')
})

afterEach(() => {
  fetchMock.mockRestore()
})

describe('getRepositoryMetadata', () => {
  it('returns repository metadata when the fetch response is ok', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '123', owner: { id: '456' } }))
    )
    const result = await getRepositoryMetadata(url, 'repository', 'token')
    expect(result).toEqual({ repoId: '123', ownerId: '456' })
  })

  it('throws an error when the fetch errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('API is down'))
    await expect(
      getRepositoryMetadata(url, 'repository', 'token')
    ).rejects.toThrow('API is down')
  })

  it('throws an error when the response status is not ok', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect(
      getRepositoryMetadata(url, 'repository', 'token')
    ).rejects.toThrow(
      'Failed to fetch repository metadata due to bad status code: 500'
    )
  })

  it('throws an error when the response data is in the wrong format', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ wrong: 'format' }))
    )
    await expect(
      getRepositoryMetadata(url, 'repository', 'token')
    ).rejects.toThrow(
      'Failed to fetch repository metadata: unexpected response format'
    )
  })
})

describe('getContainerRegistryURL', () => {
  it('returns container registry URL when the fetch response is ok', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://registry.example.com' }))
    )
    const result = await getContainerRegistryURL(url)
    expect(result).toEqual(new URL('https://registry.example.com'))
  })

  it('throws an error when the fetch errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('API is down'))
    await expect(getContainerRegistryURL(url)).rejects.toThrow('API is down')
  })

  it('throws an error when the response status is not ok', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect(getContainerRegistryURL(url)).rejects.toThrow(
      'Failed to fetch container registry url due to bad status code: 500'
    )
  })

  it('throws an error when the response data is in the wrong format', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ wrong: 'format' }))
    )
    await expect(getContainerRegistryURL(url)).rejects.toThrow(
      'Failed to fetch repository metadata: unexpected response format'
    )
  })
})
