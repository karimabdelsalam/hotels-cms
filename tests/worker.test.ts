/**
 * The background worker.
 *
 * The case worth reading: a reservation that succeeded while the response was
 * lost, left on a retry schedule. Nothing but the worker will ever pick it up,
 * and when it does it must adopt the existing reservation rather than create a
 * second one.
 *
 *   pnpm test
 */
import { prisma } from "@fantazia/db";
import {
  search, createHold, createBookingFromHold, confirmBooking, transition, resetSimulator,
} from "@fantazia/booking";
import { confirmDueBookings, expireHolds, reportReviewQueue, purgeKeys } from "@fantazia/worker/jobs";

let fails = 0;
const check = (n: string, ok: boolean, d = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${n}${d ? "  — " + d : ""}`); };
const day = (o: number) => { const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()+o); return d.toISOString().slice(0,10); };

async function paid(reference: string, offset: number) {
  const results = await search({ checkIn: day(offset), checkOut: day(offset+2), occupancy: { adults: 2, children: 0, childAges: [] }, roomsCount: 1 });
  const first = results.find((r) => r.rooms.length > 0)!;
  const room = first.rooms[0]!;
  const hold = await createHold({ resortId: first.resortId, sessionId: `s-${reference}`, checkIn: day(offset), checkOut: day(offset+2),
    lines: [{ roomTypeId: room.roomTypeId, ratePlanId: room.ratePlanId, quantity: 1, occupancy: { adults: 2, children: 0, childAges: [] } }] });
  const b = await createBookingFromHold({ holdId: hold.holdId, guest: { firstName: "W", lastName: "T", email: "w@example.test" }, locale: "en" });
  await prisma.booking.update({ where: { id: b.bookingId }, data: { reference } });
  await transition({ bookingId: b.bookingId, to: "PENDING_PAYMENT", type: "payment.started", actorType: "guest" });
  await transition({ bookingId: b.bookingId, to: "PAID", type: "payment.captured", actorType: "provider" });
  return b.bookingId;
}
async function clean() {
  await prisma.bookingEvent.deleteMany({}); await prisma.bookingRoom.deleteMany({});
  await prisma.payment.deleteMany({}); await prisma.booking.deleteMany({});
  await prisma.bookingHold.deleteMany({}); await prisma.guest.deleteMany({});
  await prisma.idempotencyKey.deleteMany({}); await prisma.integrationLog.deleteMany({});
  await resetSimulator();
}

async function main() {
  await clean();

  // ---------- the case the worker exists for ----------
  // A reservation that succeeded while the response was lost, left on a
  // schedule. Nothing but the worker will ever pick it up.
  const lost = await paid("FNT-FAIL-LOST", 92);
  const first = await confirmBooking(lost);
  check("the booking is left on a retry schedule", first.status === "retry_scheduled", JSON.stringify(first));
  const stuck = (await prisma.booking.findUnique({ where: { id: lost } }))!;
  check("nothing has confirmed it", stuck.status === "CONFIRMING" && stuck.externalConfirmationNumber === null);

  // Not due yet — the worker must leave it alone.
  const early = await confirmDueBookings();
  check("a retry that is not due yet is left alone", early.summary === "nothing due", early.summary);
  check("...and the booking has not moved",
        (await prisma.booking.findUnique({ where: { id: lost } }))!.status === "CONFIRMING");

  // Now it is due.
  await prisma.booking.update({ where: { id: lost }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await prisma.idempotencyKey.deleteMany({ where: { key: `reservation:${lost}` } });
  const run = await confirmDueBookings();
  console.log(`   worker said: ${run.summary}`);
  const rescued = (await prisma.booking.findUnique({ where: { id: lost } }))!;
  check("the worker rescues the stuck booking", rescued.status === "CONFIRMED", rescued.status);
  check("it adopted rather than duplicated",
        (await prisma.simulatorReservation.count()) === 1, `${await prisma.simulatorReservation.count()} reservations`);
  check("the confirmation number is stored", Boolean(rescued.externalConfirmationNumber));

  // ---------- the review queue is shouted about ----------
  const rej = await paid("FNT-FAIL-REJECT", 96);
  await confirmBooking(rej);
  const shout = await reportReviewQueue();
  check("a booking in review is reported loudly", /PAID WITH NO RESERVATION/.test(shout.summary), shout.summary);
  check("...with the oldest named", shout.summary.includes("FNT-FAIL-REJECT"));

  // ---------- expiring holds ----------
  const results = await search({ checkIn: day(100), checkOut: day(102), occupancy: { adults: 2, children: 0, childAges: [] }, roomsCount: 1 });
  const r0 = results.find((x) => x.rooms.length > 0)!;
  const room = r0.rooms[0]!;
  const hold = await createHold({ resortId: r0.resortId, sessionId: "abandoned", checkIn: day(100), checkOut: day(102),
    lines: [{ roomTypeId: room.roomTypeId, ratePlanId: room.ratePlanId, quantity: 1, occupancy: { adults: 2, children: 0, childAges: [] } }] });
  const abandoned = await createBookingFromHold({ holdId: hold.holdId, guest: { firstName: "A", lastName: "B", email: "a@example.test" }, locale: "en" });

  const notYet = await expireHolds();
  check("a live hold is not expired", notYet.summary === "none stale", notYet.summary);

  await prisma.bookingHold.update({ where: { id: hold.holdId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const expired = await expireHolds();
  check("an elapsed hold expires its booking", /1 expired/.test(expired.summary), expired.summary);
  check("the booking is EXPIRED", (await prisma.booking.findUnique({ where: { id: abandoned.bookingId } }))!.status === "EXPIRED");

  // A confirmed booking must never be expired by this job.
  await prisma.bookingHold.updateMany({ where: {}, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const again = await expireHolds();
  check("a confirmed booking is never expired",
        (await prisma.booking.findUnique({ where: { id: lost } }))!.status === "CONFIRMED", again.summary);

  // ---------- purging ----------
  await prisma.idempotencyKey.create({ data: { key: "old", scope: "t", requestHash: "x", status: "done", expiresAt: new Date(Date.now() - 1000) } });
  await prisma.idempotencyKey.create({ data: { key: "fresh", scope: "t", requestHash: "x", status: "done", expiresAt: new Date(Date.now() + 60_000) } });
  const purged = await purgeKeys();
  check("expired keys are purged", /purged/.test(purged.summary), purged.summary);
  check("live keys are kept", (await prisma.idempotencyKey.findUnique({ where: { key: "fresh" } })) !== null);

  await clean();
  console.log(fails === 0 ? "\nWORKER PASSES" : `\n${fails} FAILURES`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
main();
