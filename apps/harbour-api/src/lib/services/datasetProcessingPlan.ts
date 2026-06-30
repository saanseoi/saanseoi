import type { DatasetProcessingMessage, HarbourJobMessage } from '@repo/core'

export type DatasetProcessingQueue = {
  send(message: HarbourJobMessage, options?: QueueSendOptions): Promise<unknown>
  sendBatch?(
    messages: Iterable<MessageSendRequest<HarbourJobMessage>>,
    options?: QueueSendBatchOptions,
  ): Promise<unknown>
}

export type DatasetProcessingPlanOptions = {
  forceSerialAddressEnqueue?: boolean
  useAddressContinuation?: boolean
}

export const ADDRESS_PROCESSING_CHUNK_ROW_COUNT = 1024

const QUEUE_SEND_BATCH_SIZE = 100
const SERIAL_SEND_PROGRESS_INTERVAL = 25

export async function enqueueDatasetProcessingPlan(
  queue: DatasetProcessingQueue,
  message: DatasetProcessingMessage,
  rowCount: number,
  options: DatasetProcessingPlanOptions = {},
) {
  const messages = buildDatasetProcessingPlanMessages(message, rowCount, options)
  const summary = summarizeDatasetProcessingPlan(message, messages, rowCount)
  const useSendBatch =
    Boolean(queue.sendBatch) &&
    !options.useAddressContinuation &&
    !(message.type === 'address' && options.forceSerialAddressEnqueue)

  console.info(
    JSON.stringify({
      ...summary,
      forceSerialAddressEnqueue: Boolean(options.forceSerialAddressEnqueue),
      phase: 'enqueueDatasetProcessingPlan',
      status: 'started',
      useAddressContinuation: Boolean(options.useAddressContinuation),
      usingSendBatch: useSendBatch,
    }),
  )

  if (useSendBatch && queue.sendBatch) {
    for (let index = 0; index < messages.length; index += QUEUE_SEND_BATCH_SIZE) {
      const batchMessages = messages.slice(index, index + QUEUE_SEND_BATCH_SIZE)

      await queue.sendBatch(
        batchMessages.map(body => ({
          body,
        })),
      )
      console.info(
        JSON.stringify({
          ...summary,
          batchEnd: index + batchMessages.length,
          batchSize: batchMessages.length,
          batchStart: index,
          phase: 'enqueueDatasetProcessingPlan',
          status: 'batchCompleted',
        }),
      )
    }
    console.info(
      JSON.stringify({
        ...summary,
        phase: 'enqueueDatasetProcessingPlan',
        status: 'completed',
        usingSendBatch: true,
      }),
    )
    return
  }

  for (let index = 0; index < messages.length; index += 1) {
    const planMessage = messages[index]

    if (!planMessage) {
      continue
    }

    await queue.send(planMessage)

    if (
      messages.length > 1 &&
      ((index + 1) % SERIAL_SEND_PROGRESS_INTERVAL === 0 ||
        index + 1 === messages.length)
    ) {
      console.info(
        JSON.stringify({
          ...summary,
          messageEnd: index + 1,
          messageStart: Math.max(0, index + 1 - SERIAL_SEND_PROGRESS_INTERVAL),
          phase: 'enqueueDatasetProcessingPlan',
          status: 'serialProgress',
        }),
      )
    }
  }
  console.info(
    JSON.stringify({
      ...summary,
      forceSerialAddressEnqueue: Boolean(options.forceSerialAddressEnqueue),
      phase: 'enqueueDatasetProcessingPlan',
      status: 'completed',
      useAddressContinuation: Boolean(options.useAddressContinuation),
      usingSendBatch: false,
    }),
  )
}

export function buildDatasetProcessingPlanMessages(
  message: DatasetProcessingMessage,
  rowCount: number,
  options: DatasetProcessingPlanOptions = {},
) {
  if (message.type !== 'address' || rowCount <= 0) {
    return [message]
  }

  const processingRunStartedAt = new Date().toISOString()

  if (options.useAddressContinuation) {
    return [
      {
        ...message,
        addressStage: 'normalize',
        chunkSize: ADDRESS_PROCESSING_CHUNK_ROW_COUNT,
        processingRunStartedAt,
        rowStart: 0,
        rowEnd: Math.min(ADDRESS_PROCESSING_CHUNK_ROW_COUNT, rowCount),
        totalRows: rowCount,
      } satisfies DatasetProcessingMessage,
    ]
  }

  const messages: DatasetProcessingMessage[] = []

  for (
    let rowStart = 0;
    rowStart < rowCount;
    rowStart += ADDRESS_PROCESSING_CHUNK_ROW_COUNT
  ) {
    messages.push({
      ...message,
      addressStage: 'normalize',
      chunkSize: ADDRESS_PROCESSING_CHUNK_ROW_COUNT,
      preplannedAddressChunks: true,
      processingRunStartedAt,
      rowStart,
      rowEnd: Math.min(rowStart + ADDRESS_PROCESSING_CHUNK_ROW_COUNT, rowCount),
      totalRows: rowCount,
    })
  }

  return messages
}

function summarizeDatasetProcessingPlan(
  message: DatasetProcessingMessage,
  messages: DatasetProcessingMessage[],
  rowCount: number,
) {
  const firstMessage = messages[0]
  const lastMessage = messages.at(-1)

  return {
    chunkSize: message.type === 'address' ? ADDRESS_PROCESSING_CHUNK_ROW_COUNT : null,
    datasetId: message.datasetId,
    firstRowEnd: firstMessage?.rowEnd,
    firstRowStart: firstMessage?.rowStart,
    lastRowEnd: lastMessage?.rowEnd,
    lastRowStart: lastMessage?.rowStart,
    messageCount: messages.length,
    preplannedAddressChunks:
      message.type === 'address' && messages.some(item => item.preplannedAddressChunks),
    releaseCode: message.releaseCode,
    releaseId: message.releaseId ?? message.datasetId,
    rowCount,
    source: message.source,
    sourceVersion: message.sourceVersion,
    type: message.type,
  }
}
