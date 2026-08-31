/**
 * Confirmation emails, end to end through a real SMTP server.
 *
 * A local SMTP listener rather than a mocked transport: the thing most likely
 * to be wrong is the wire — auth, TLS negotiation, headers, encoding of Arabic
 * — and a stubbed `send()` proves none of it.
 *
 *   pnpm test
 */
import { SMTPServer } from "smtp-server";
import { simpleParser, type ParsedMail } from "mailparser";
import { prisma } from "@fantazia/db";
import {
  search, createHold, createBookingFromHold, confirmBooking, transition,
  resetSimulator, queueNotification, drainOutbox, outboxTrouble, render,
} from "@fantazia/booking";

let fails = 0;
const check = (n: string, ok: boolean, d = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${n}${d ? "  — " + d : ""}`); };
const day = (o: number) => { const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()+o); return d.toISOString().slice(0,10); };

const PORT = 2526;
const received: ParsedMail[] = [];
let refuseNext = 0;

function startSmtp(): Promise<SMTPServer> {
  const server = new SMTPServer({
    authOptional: false,
    disabledCommands: ["STARTTLS"],
    onAuth(auth, _session, callback) {
      if (auth.username === "resend" && auth.password === "s3cret") return callback(null, { user: "ok" });
      return callback(new Error("Invalid credentials"));
    },
    onData(stream, _session, callback) {
      if (refuseNext > 0) {
        refuseNext--;
        stream.resume();
        stream.on("end", () => callback(new Error("451 temporary failure")));
        return;
      }
      simpleParser(stream).then((mail) => { received.push(mail); callback(); }).catch(callback);
    },
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

async function clean() {
  await prisma.bookingNotification.deleteMany({});
  await prisma.bookingEvent.deleteMany({}); await prisma.bookingRoom.deleteMany({});
  await prisma.payment.deleteMany({}); await prisma.booking.deleteMany({});
  await prisma.bookingHold.deleteMany({}); await prisma.guest.deleteMany({});
  await prisma.idempotencyKey.deleteMany({}); await prisma.integrationLog.deleteMany({});
  await resetSimulator();
}

async function makePaid(reference: string, offset: number, locale: string, email: string) {
  const results = await search({ checkIn: day(offset), checkOut: day(offset+2), occupancy: { adults: 2, children: 1, childAges: [7] }, roomsCount: 1 });
  const first = results.find((r) => r.rooms.length > 0)!;
  const room = first.rooms.find((r) => r.available > 0)!;
  const hold = await createHold({ resortId: first.resortId, sessionId: `s-${reference}`, checkIn: day(offset), checkOut: day(offset+2),
    lines: [{ roomTypeId: room.roomTypeId, ratePlanId: room.ratePlanId, quantity: 1, occupancy: { adults: 2, children: 1, childAges: [7] } }] });
  const b = await createBookingFromHold({ holdId: hold.holdId, guest: { firstName: "Yara", lastName: "Kamal", email }, locale });
  await prisma.booking.update({ where: { id: b.bookingId }, data: { reference } });
  await transition({ bookingId: b.bookingId, to: "PENDING_PAYMENT", type: "payment.started", actorType: "guest" });
  await transition({ bookingId: b.bookingId, to: "PAID", type: "payment.captured", actorType: "provider" });
  return b.bookingId;
}

async function main() {
  await clean();
  const server = await startSmtp();

  // ---------- without SMTP configured, nothing is lost ----------
  delete process.env.SMTP_HOST;
  const unconfigured = await makePaid("FNT-MAIL-01", 110, "en", "yara@example.test");
  await confirmBooking(unconfigured);
  const queued = await prisma.bookingNotification.findMany();
  check("a confirmation is queued at the transition", queued.length === 1, `${queued.length}`);
  check("...as pending, not sent", queued[0]?.status === "pending");
  const skipped = await drainOutbox();
  check("with no SMTP the message waits rather than failing", /waiting/.test(skipped.skipped ?? ""), skipped.skipped ?? "");
  check("...and is still pending",
        (await prisma.bookingNotification.findFirst())?.status === "pending");

  // ---------- with SMTP, it goes ----------
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(PORT);
  process.env.SMTP_USER = "resend";
  process.env.SMTP_PASSWORD = "s3cret";
  process.env.SMTP_FROM = "reservations@fantaziahotels.test";
  process.env.RESERVATIONS_EMAIL = "reservations@fantaziahotels.test";

  const drained = await drainOutbox();
  check("the message sends", drained.sent === 1, JSON.stringify(drained));
  check("it reached the server", received.length === 1, `${received.length}`);

  const mail = received[0]!;
  check("addressed to the guest", mail.to?.text === "yara@example.test", mail.to?.text);
  check("from the reservations address", mail.from?.text?.includes("reservations@"), mail.from?.text);
  check("the subject carries the reference", /FNT-MAIL-01/.test(mail.subject ?? ""), mail.subject);
  check("there is a plain-text part", Boolean(mail.text?.trim()));
  check("there is an HTML part", Boolean(mail.html));
  check("the reference is in the body", (mail.text ?? "").includes("FNT-MAIL-01"));
  const booking = await prisma.booking.findUnique({ where: { id: unconfigured } });
  check("the hotel confirmation number is in the body",
        (mail.text ?? "").includes(booking!.externalConfirmationNumber!), booking!.externalConfirmationNumber ?? "");
  check("the cancellation policy is in the body", /Free cancellation/i.test(mail.text ?? ""));
  check("the row is marked sent",
        (await prisma.bookingNotification.findFirst())?.status === "sent");

  // ---------- never twice ----------
  await queueNotification({ bookingId: unconfigured, kind: "confirmed" });
  const again = await drainOutbox();
  check("queuing the same kind twice sends nothing more", again.sent === 0 && received.length === 1,
        `${received.length} mails`);

  // ---------- Arabic ----------
  received.length = 0;
  const ar = await makePaid("FNT-MAIL-02", 114, "ar", "nour@example.test");
  await confirmBooking(ar);
  await drainOutbox();
  check("the Arabic guest gets an email", received.length === 1, `${received.length}`);
  const arMail = received[0]!;
  check("its subject is in Arabic", /تم تأكيد حجزك/.test(arMail.subject ?? ""), arMail.subject);
  check("the body is right-to-left", /dir="rtl"/.test(String(arMail.html)));
  check("Arabic survived encoding intact", /الرقم المرجعي/.test(arMail.text ?? ""));
  check("the resort name is the Arabic one", /منتجع|فانتازيا/.test(arMail.text ?? ""),
        (arMail.text ?? "").split("\n").find((l) => /منتجع|فانتازيا/.test(l)) ?? "not found");

  // ---------- a language with no written copy falls back ----------
  const de = await render(ar, "confirmed", "de");
  check("an unwritten language falls back to English rather than breaking",
        /confirmed/i.test(de?.subject ?? ""), de?.subject);

  // ---------- the honest one ----------
  received.length = 0;
  const rejected = await makePaid("FNT-FAIL-REJECT", 118, "en", "omar@example.test");
  await confirmBooking(rejected);
  await drainOutbox();
  check("a booking that could not be made still emails the guest", received.length === 1, `${received.length}`);
  const bad = received[0]!;
  check("it does not claim to be confirmed", !/You are booked/.test(bad.text ?? ""));
  check("it says the payment went through", /payment went through/i.test(bad.text ?? ""));
  check("it says someone will make contact", /contact you/i.test(bad.text ?? ""));
  check("it gives no confirmation number it does not have",
        !/Hotel confirmation/.test(bad.text ?? ""), (bad.text ?? "").slice(0, 0));

  // ---------- a refusing server retries, then gives up ----------
  received.length = 0;
  const flaky = await makePaid("FNT-MAIL-03", 100, "en", "layla@example.test");
  await confirmBooking(flaky);
  refuseNext = 1;
  const failed = await drainOutbox();
  check("a refused send is scheduled to retry", failed.failed === 1 && failed.sent === 0, JSON.stringify(failed));
  const row = await prisma.bookingNotification.findFirst({ where: { bookingId: flaky } });
  check("...with the reason recorded", Boolean(row?.lastError), row?.lastError?.slice(0, 60));
  check("...and a future attempt time", (row?.nextAttemptAt ?? new Date(0)) > new Date());

  await prisma.bookingNotification.update({ where: { id: row!.id }, data: { nextAttemptAt: new Date(0) } });
  const recovered = await drainOutbox();
  check("the retry succeeds once the server behaves", recovered.sent === 1, JSON.stringify(recovered));

  await prisma.bookingNotification.updateMany({ where: { bookingId: flaky }, data: { status: "failed" } });
  const trouble = await outboxTrouble();
  check("undelivered messages are countable for the worker to shout about", trouble.failed === 1, `${trouble.failed}`);

  server.close();
  await clean();
  console.log(fails === 0 ? "\nEMAIL PASSES" : `\n${fails} FAILURES`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
main();
