import { prisma } from "@fantazia/db";
import { field, formatMoney } from "@fantazia/db/content";
import type { Message } from "./transport";

/**
 * The four messages a guest gets.
 *
 * Written out per language rather than run through the UI translation system:
 * an email is sent once and cannot be corrected afterwards, and a missing key
 * falling back to English mid-sentence is worse in an inbox than on a page
 * where the rest of the screen gives context.
 *
 * Layout is tables and inline styles because that is what email clients
 * support. Outlook renders with Word; anything else is a gamble on someone's
 * confirmation.
 */

export type NotificationKind =
  | "confirmed"
  | "pending_confirmation"
  | "needs_review"
  | "cancelled";

type Copy = {
  subject: (ref: string) => string;
  heading: string;
  intro: string;
  outro: string;
  labels: {
    reference: string;
    confirmation: string;
    dates: string;
    guests: string;
    rooms: string;
    total: string;
    policy: string;
    contact: string;
  };
};

const COPY: Record<string, Record<NotificationKind, Copy>> = {
  en: {
    confirmed: {
      subject: (ref) => `Your booking is confirmed — ${ref}`,
      heading: "You are booked",
      intro: "Everything is arranged. Here is your stay in full.",
      outro: "We look forward to having you with us.",
      labels: labelsEn(),
    },
    pending_confirmation: {
      subject: (ref) => `We have your payment — ${ref}`,
      heading: "We are confirming your stay",
      intro:
        "Your payment went through and we are completing your reservation with the hotel. You will have your confirmation shortly. Nothing is needed from you.",
      outro: "Quote the reference below if you need to reach us before then.",
      labels: labelsEn(),
    },
    needs_review: {
      subject: (ref) => `About your booking — ${ref}`,
      heading: "We need to sort something out",
      intro:
        "Your payment went through, but we have not been able to complete your reservation with the hotel. Our reservations team has been alerted and will contact you directly. You do not need to do anything, and you have not been charged twice.",
      outro: "If you would rather reach us first, quote the reference below.",
      labels: labelsEn(),
    },
    cancelled: {
      subject: (ref) => `Your booking is cancelled — ${ref}`,
      heading: "Your booking is cancelled",
      intro: "This booking has been cancelled. Any refund due follows the policy below.",
      outro: "We hope to welcome you another time.",
      labels: labelsEn(),
    },
  },
  ar: {
    confirmed: {
      subject: (ref) => `تم تأكيد حجزك — ${ref}`,
      heading: "حجزك مؤكد",
      intro: "كل شيء جاهز. إليك تفاصيل إقامتك كاملة.",
      outro: "في انتظار استقبالك.",
      labels: labelsAr(),
    },
    pending_confirmation: {
      subject: (ref) => `استلمنا دفعتك — ${ref}`,
      heading: "نؤكد إقامتك الآن",
      intro:
        "تمت عملية الدفع بنجاح، ونحن بصدد استكمال حجزك لدى الفندق. ستصلك رسالة التأكيد قريبًا. لا يلزمك فعل أي شيء.",
      outro: "إذا احتجت التواصل معنا قبل ذلك، اذكر الرقم المرجعي أدناه.",
      labels: labelsAr(),
    },
    needs_review: {
      subject: (ref) => `بخصوص حجزك — ${ref}`,
      heading: "نحتاج إلى معالجة أمر ما",
      intro:
        "تمت عملية الدفع بنجاح، لكننا لم نتمكن من استكمال حجزك لدى الفندق. تم إخطار فريق الحجوزات وسيتواصل معك مباشرة. لا يلزمك فعل أي شيء، ولم يتم خصم المبلغ مرتين.",
      outro: "إذا فضّلت التواصل معنا أولًا، اذكر الرقم المرجعي أدناه.",
      labels: labelsAr(),
    },
    cancelled: {
      subject: (ref) => `تم إلغاء حجزك — ${ref}`,
      heading: "تم إلغاء حجزك",
      intro: "تم إلغاء هذا الحجز. أي مبلغ مستحق للاسترداد يخضع للسياسة أدناه.",
      outro: "نأمل أن نستقبلك في وقت آخر.",
      labels: labelsAr(),
    },
  },
};

function labelsEn() {
  return {
    reference: "Your reference",
    confirmation: "Hotel confirmation",
    dates: "Dates",
    guests: "Guests",
    rooms: "Rooms",
    total: "Total paid",
    policy: "Cancellation",
    contact: "Questions?",
  };
}

function labelsAr() {
  return {
    reference: "الرقم المرجعي",
    confirmation: "رقم تأكيد الفندق",
    dates: "التواريخ",
    guests: "النزلاء",
    rooms: "الغرف",
    total: "الإجمالي المدفوع",
    policy: "سياسة الإلغاء",
    contact: "لديك سؤال؟",
  };
}

/** Falls back to English for a language with no written copy yet. */
function copyFor(locale: string, kind: NotificationKind): { copy: Copy; locale: string } {
  const set = COPY[locale] ?? COPY.en!;
  return { copy: set[kind], locale: COPY[locale] ? locale : "en" };
}

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function render(
  bookingId: string,
  kind: NotificationKind,
  requestedLocale: string,
): Promise<Message | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: true,
      resort: { include: { translations: true } },
      rooms: {
        include: {
          roomType: { include: { translations: true } },
          ratePlan: { include: { translations: true, policy: { include: { translations: true } } } },
        },
      },
    },
  });
  if (!booking) return null;

  const { copy, locale } = copyFor(requestedLocale, kind);
  const rtl = locale === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";

  const fmt = new Intl.DateTimeFormat(rtl ? "ar-EG" : locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const resortName = field(booking.resort.translations, locale, "name") ?? booking.resort.code;
  const money = formatMoney(booking.totalAmount, booking.currency, locale) ?? "";
  const policy = field(
    booking.rooms[0]?.ratePlan.policy?.translations ?? [],
    locale,
    "summary",
  );

  const rows: [string, string][] = [[copy.labels.reference, booking.reference]];
  if (booking.externalConfirmationNumber && kind === "confirmed") {
    rows.push([copy.labels.confirmation, booking.externalConfirmationNumber]);
  }
  rows.push(
    [copy.labels.dates, `${fmt.format(booking.checkIn)} → ${fmt.format(booking.checkOut)}`],
    [
      copy.labels.guests,
      `${booking.adults}${booking.children ? ` + ${booking.children}` : ""}`,
    ],
    [
      copy.labels.rooms,
      booking.rooms
        .map(
          (r) =>
            `${field(r.roomType.translations, locale, "name") ?? ""}${r.quantity > 1 ? ` × ${r.quantity}` : ""}`,
        )
        .join(", "),
    ],
  );
  if (kind !== "cancelled") rows.push([copy.labels.total, money]);

  const contactEmail = process.env.RESERVATIONS_EMAIL ?? process.env.SMTP_FROM ?? "";

  const html = `<!doctype html>
<html lang="${escape(locale)}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(copy.subject(booking.reference))}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}"
         style="max-width:560px;background:#fbfaf6;border-radius:16px;overflow:hidden;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                color:#0f2b36;text-align:${align};">
    <tr><td style="background:#0d7f8c;padding:22px 28px;">
      <div style="color:#fbfaf6;font-size:18px;letter-spacing:0.14em;font-weight:600;">FANTAZIA</div>
      <div style="color:#a9e8e2;font-size:11px;letter-spacing:0.2em;">MARSA ALAM</div>
    </td></tr>
    <tr><td style="padding:30px 28px 8px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;">${escape(copy.heading)}</h1>
      <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#3c5a66;">${escape(copy.intro)}</p>
      <p style="margin:14px 0 0;font-size:17px;font-weight:600;">${escape(resortName)}</p>
    </td></tr>
    <tr><td style="padding:18px 28px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${rows
          .map(
            ([label, value]) => `<tr>
          <td style="padding:8px 0;color:#5f7b85;border-bottom:1px solid #e6e1d6;">${escape(label)}</td>
          <td style="padding:8px 0;font-weight:600;text-align:${rtl ? "left" : "right"};border-bottom:1px solid #e6e1d6;">${escape(value)}</td>
        </tr>`,
          )
          .join("")}
      </table>
    </td></tr>
    ${
      policy
        ? `<tr><td style="padding:18px 28px 0;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5f7b85;">${escape(copy.labels.policy)}</div>
      <p style="margin:4px 0 0;font-size:13px;line-height:1.6;color:#3c5a66;">${escape(policy)}</p>
    </td></tr>`
        : ""
    }
    <tr><td style="padding:22px 28px 30px;">
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#3c5a66;">${escape(copy.outro)}</p>
      ${
        contactEmail
          ? `<p style="margin:0;font-size:13px;color:#5f7b85;">${escape(copy.labels.contact)}
             <a href="mailto:${escape(contactEmail)}" style="color:#0d7f8c;">${escape(contactEmail)}</a></p>`
          : ""
      }
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  const text = [
    copy.heading,
    "",
    copy.intro,
    "",
    resortName,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(policy ? ["", `${copy.labels.policy}: ${policy}`] : []),
    "",
    copy.outro,
    ...(contactEmail ? [`${copy.labels.contact} ${contactEmail}`] : []),
  ].join("\n");

  return { to: booking.guest.email, subject: copy.subject(booking.reference), html, text };
}
