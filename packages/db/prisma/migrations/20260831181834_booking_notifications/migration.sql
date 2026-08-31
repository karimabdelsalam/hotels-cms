-- CreateTable
CREATE TABLE "booking_notifications" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "recipient" TEXT NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_notifications_status_nextAttemptAt_idx" ON "booking_notifications"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "booking_notifications_bookingId_kind_channel_key" ON "booking_notifications"("bookingId", "kind", "channel");

-- AddForeignKey
ALTER TABLE "booking_notifications" ADD CONSTRAINT "booking_notifications_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
