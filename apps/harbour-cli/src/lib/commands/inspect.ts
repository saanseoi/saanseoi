import { note, outro } from '@clack/prompts'

import { formatField } from '../display.ts'
import { inspectLocalArtefact } from '../inspect.ts'
import { resolveInspectOptions } from '../inspectOptions.ts'
import type { ParsedArgs } from '../options.ts'

export async function runInspectCommand(args: ParsedArgs) {
  const inspectOptions = await resolveInspectOptions(args)
  const result = inspectLocalArtefact(inspectOptions)

  note(
    [
      formatField('outputPath', result.outputPath),
      formatField('stage', result.stage),
      formatField('resourceType', result.resourceType),
      formatField('releaseCode', result.releaseCode),
      ...(result.dbShard ? [formatField('dbShard', result.dbShard)] : []),
      formatField('sample', result.sample),
      formatField(
        'rowRange',
        result.rowStart == null
          ? '-'
          : `${String(result.rowStart)}-${String(result.rowEnd ?? '?')}`,
      ),
      formatField('sourceKeys', result.sourceKeys.join(', ')),
    ].join('\n'),
    'INSPECT RESULT',
  )
  outro('Harbour artefact inspection complete')
}
