export class KnownError extends Error {
  extraError: string

  constructor(
    public statusCode: number,
    public label: string,
    error?: unknown
  ) {
    super(label)
    this.name = 'KnownError'
    this.extraError =
      error instanceof Error ? error.message : error ? `${error}` : ''
  }

  get responseJson() {
    return {
      error: [this.label, this.extraError].filter(Boolean).join(': '),
    }
  }
}

export class NotOwnerError extends Error {
  constructor() {
    super()
    this.name = 'NotOwnerError'
  }
}
