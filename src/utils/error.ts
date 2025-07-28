export class KnownError extends Error {
  extraError: string

  constructor(
    public statusCode: number,
    public label: string,
    error?: unknown,
    /**
     * Whether or not this is fatal and should instantly fail the request. This
     * is used when supporting both JWT and signature auth. Some JWT errors
     * should be fatal, but some should fallback to signature auth.
     */
    public fatal = false
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
