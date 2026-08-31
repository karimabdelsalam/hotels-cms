import { prisma } from "@fantazia/db";

/**
 * Writes one line of the integration trail.
 *
 * Summaries only, and already redacted by the caller. Two rules hold here:
 * a logging failure never fails a booking, and nothing that reaches this
 * table may contain a credential.
 */
export async function logIntegration(entry: {
  resortId: string | null;
  connector: string;
  operation: string;
  correlationId: string;
  request: string | null;
  response: string | null;
  status: string;
  durationMs: number;
  errorCode: string | null;
}): Promise<void> {
  // Enough of the message to diagnose with, not enough to fill the disk.
  const clip = (value: string | null) =>
    value == null ? null : { body: value.length > 8000 ? `${value.slice(0, 8000)}…` : value };

  try {
    await prisma.integrationLog.create({
      data: {
        resortId: entry.resortId,
        connector: entry.connector,
        operation: entry.operation,
        correlationId: entry.correlationId,
        requestSummary: clip(entry.request) ?? undefined,
        responseSummary: clip(entry.response) ?? undefined,
        status: entry.status,
        durationMs: entry.durationMs,
        errorCode: entry.errorCode,
      },
    });
  } catch {
    // A booking must not fail because the audit trail could not be written.
    // The trail is for diagnosis; the guest's reservation is the product.
  }
}
