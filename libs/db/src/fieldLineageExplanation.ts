/** Presentation-independent operation vocabulary, retained with the implementation contract. */
export type Derivation =
  | { kind: 'read'; path: string }
  | { kind: 'literal'; value: string | number | boolean | null }
  | {
      kind: 'operation'
      operation: 'decode-json' | 'encode-json' | 'bounds' | 'geometry-collection'
      input: Derivation
    }
  | {
      kind: 'choice'
      branches: Array<{
        when: { input: string; test: 'present' | 'non-empty' }
        value: Derivation
      }>
      otherwise: Derivation
    }
  | { kind: 'fallback'; value: Derivation; otherwise: Derivation }

export type OperationExplanation = {
  version: 1
  result: Derivation
  /** Producer contract; does not assert which branch ran for a particular record. */
  upstream?: { stage: 'publisher-preparation'; result: Derivation; boundary: string }
}

export function validateOperationExplanation(
  value: unknown,
): asserts value is OperationExplanation {
  const fail = () => {
    throw Error('Invalid structured operation explanation')
  }
  function expression(raw: unknown, depth = 0): void {
    if (!raw || typeof raw !== 'object' || depth > 40) fail()
    const v = raw as Record<string, any>
    const next = (child: unknown) => expression(child, depth + 1)
    switch (v.kind) {
      case 'read':
        if (typeof v.path !== 'string' || !v.path.trim()) fail()
        break
      case 'literal':
        if (
          v.value !== null &&
          !['string', 'number', 'boolean'].includes(typeof v.value)
        )
          fail()
        break
      case 'operation':
        if (
          !['decode-json', 'encode-json', 'bounds', 'geometry-collection'].includes(
            v.operation,
          )
        )
          fail()
        next(v.input)
        break
      case 'choice':
        if (!Array.isArray(v.branches) || !v.branches.length) fail()
        for (const branch of v.branches) {
          if (
            !branch?.when ||
            typeof branch.when.input !== 'string' ||
            !branch.when.input.trim() ||
            !['present', 'non-empty'].includes(branch.when.test)
          )
            fail()
          next(branch.value)
        }
        next(v.otherwise)
        break
      case 'fallback':
        next(v.value)
        next(v.otherwise)
        break
      default:
        fail()
    }
  }
  const v = value as OperationExplanation
  if (v?.version !== 1) fail()
  expression(v.result)
  if (v.upstream) {
    if (
      v.upstream.stage !== 'publisher-preparation' ||
      typeof v.upstream.boundary !== 'string' ||
      !v.upstream.boundary.trim()
    )
      fail()
    expression(v.upstream.result)
  }
}
