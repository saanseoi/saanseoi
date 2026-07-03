export function isVerbosePipelineLoggingEnabled() {
  const value =
    process.env.HARBOUR_VERBOSE ??
    process.env.SAANSEOI_VERBOSE ??
    process.env.DEBUG_PIPELINE

  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()

  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function emitStructuredLog(method: 'error' | 'info', payload: Record<string, unknown>) {
  console[method](JSON.stringify(payload))
}

export function logStructuredInfo(payload: Record<string, unknown>) {
  if (!isVerbosePipelineLoggingEnabled()) {
    return
  }

  emitStructuredLog('info', payload)
}

export function logStructuredError(payload: Record<string, unknown>) {
  if (!isVerbosePipelineLoggingEnabled()) {
    return
  }

  emitStructuredLog('error', payload)
}

function resolveTraceIds(values: Array<string | undefined>) {
  const ids = values
    .flatMap(value => value?.split(',') ?? [])
    .map(value => value.trim())
    .filter(Boolean)

  return new Set(ids)
}

export function resolveDivisionTraceIds() {
  return resolveTraceIds([
    process.env.HARBOUR_TRACE_DIVISIONS,
    process.env.SAANSEOI_TRACE_DIVISIONS,
    process.env.DEBUG_DIVISIONS,
  ])
}

export function logDivisionTrace(
  traceIds: ReadonlySet<string>,
  divisionId: string,
  payload: Record<string, unknown>,
) {
  if (!traceIds.has(divisionId)) {
    return
  }

  emitStructuredLog('info', {
    ...payload,
    divisionId,
    resourceType: 'division',
    trace: 'divisionLifecycle',
  })
}

export function logDivisionTraceGroup(
  traceIds: ReadonlySet<string>,
  divisionIds: Iterable<string>,
  payload: Record<string, unknown>,
) {
  const matchedIds = [...new Set([...divisionIds].filter(id => traceIds.has(id)))]

  if (matchedIds.length === 0) {
    return
  }

  emitStructuredLog('info', {
    ...payload,
    divisionIds: matchedIds,
    resourceType: 'division',
    trace: 'divisionLifecycle',
  })
}
