import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import worker from '../src'

const IncomingRequest = Request

describe('pfpk worker', () => {
  it('responds with 404 for /', async () => {
    const request = new IncomingRequest('http://example.com/')

    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(await response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})
