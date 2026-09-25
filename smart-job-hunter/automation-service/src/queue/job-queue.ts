// Queue system placeholder — BullMQ requires Redis
// For local single-user operation, jobs run directly via CLI or API
// Enable BullMQ queues for production multi-user deployment

export async function getQueueHealth(): Promise<Record<string, any>> {
  return { status: 'direct-mode', note: 'Queues disabled — running in direct execution mode' };
}

export async function closeQueues(): Promise<void> {
  // no-op in direct mode
}
