export class KnownError extends Error {
  message: string

  constructor(
    public statusCode: number,
    public label: string,
    error?: unknown
  ) {
    super(label)
    this.name = 'KnownError'
    this.message =
      error instanceof Error ? error.message : error ? `${error}` : ''
  }

  get responseJson() {
    return {
      error: [this.label, this.message].filter(Boolean).join(': '),
    }
  }
}

export class NotOwnerError extends Error {
  constructor() {
    super()
    this.name = 'NotOwnerError'
  }
}

export const respond = (status: number, response: Record<string, unknown>) =>
  new Response(JSON.stringify(response), {
    status,
  })

export const respondError = (status: number, error: string) =>
  respond(status, { error })
