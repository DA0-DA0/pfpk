export class KnownError extends Error {
  errorString: string;

  constructor(
    public statusCode: number,
    public label: string,
    error?: unknown
  ) {
    super(label);
    this.name = "KnownError";
    this.errorString = error instanceof Error ? error.message : `${error}`;
  }

  get responseJson() {
    return {
      error: this.label,
      message: this.errorString,
    };
  }
}

export class NotOwnerError extends Error {
  constructor() {
    super();
    this.name = "NotOwnerError";
  }
}
