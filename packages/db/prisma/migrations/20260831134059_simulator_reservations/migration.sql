-- CreateTable
CREATE TABLE "simulator_reservations" (
    "reference" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "externalReservationId" TEXT NOT NULL,
    "confirmationNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "checkIn" TEXT NOT NULL,
    "checkOut" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulator_reservations_pkey" PRIMARY KEY ("reference")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulator_reservations_externalReservationId_key" ON "simulator_reservations"("externalReservationId");
