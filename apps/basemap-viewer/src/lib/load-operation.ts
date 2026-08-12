export type LoadOperation = {
  abortController: AbortController
  generation: number
}

/** Coordinates cancellable work where only the latest request may publish. */
export class LatestLoad {
  private generation = 0
  private current: LoadOperation | null = null

  begin(): LoadOperation {
    this.current?.abortController.abort()
    const operation = {
      abortController: new AbortController(),
      generation: ++this.generation,
    }
    this.current = operation
    return operation
  }

  cancel(): void {
    this.current?.abortController.abort()
    this.current = null
    this.generation += 1
  }

  isCurrent(operation: LoadOperation): boolean {
    return (
      this.current === operation &&
      operation.generation === this.generation &&
      !operation.abortController.signal.aborted
    )
  }
}
