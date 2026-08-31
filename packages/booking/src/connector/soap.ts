/**
 * Just enough SOAP for OWS.
 *
 * OPERA Web Services speak SOAP 1.1 with WS-Security username tokens. This
 * file builds the envelope and pulls values back out; it does not try to be a
 * general SOAP stack, because the handful of operations we call are known.
 */

/** XML-escapes a value going into an element or attribute. */
export function xml(value: string | number | undefined | null): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type SoapCredentials = {
  username: string;
  password: string;
};

/**
 * WS-Security with a plaintext password.
 *
 * That is what OPERA OWS expects, and it is only acceptable because the
 * transport is TLS on a private path. The credential is read from the secret
 * store at call time and never logged — see `redact` below, which every log
 * write goes through.
 */
export function envelope(body: string, credentials: SoapCredentials, header = ""): string {
  const WSSE =
    "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <wsse:Security xmlns:wsse="${WSSE}" soap:mustUnderstand="1">
      <wsse:UsernameToken>
        <wsse:Username>${xml(credentials.username)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${xml(credentials.password)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
    ${header}
  </soap:Header>
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`;
}

/** First value of an element, namespace prefix ignored. */
export function pick(xmlText: string, localName: string): string | null {
  const open = new RegExp(`<(?:\\w+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${localName}>`);
  const match = xmlText.match(open);
  return match ? decode(match[1]!.trim()) : null;
}

/** An attribute off the first matching element. */
export function pickAttr(xmlText: string, localName: string, attr: string): string | null {
  const el = new RegExp(`<(?:\\w+:)?${localName}(\\s[^>]*?)/?>`);
  const match = xmlText.match(el);
  if (!match) return null;
  const found = match[1]!.match(new RegExp(`${attr}\\s*=\\s*"([^"]*)"`));
  return found ? decode(found[1]!) : null;
}

export function decode(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export type SoapFault = { code: string; message: string };

/**
 * A fault, or a business error OPERA returned inside a 200.
 *
 * OWS reports "no availability" and "invalid rate code" as errors in the body
 * with an HTTP 200, so checking the status code alone would read a refusal as
 * a success.
 */
export function faultIn(xmlText: string): SoapFault | null {
  if (/<(?:\w+:)?Fault[\s>]/.test(xmlText)) {
    return {
      code: pick(xmlText, "faultcode") ?? "soap:Fault",
      message: pick(xmlText, "faultstring") ?? "The property system returned a fault.",
    };
  }
  // OTA-style: <Errors><Error Type=".." Code="..">text</Error></Errors>
  if (/<(?:\w+:)?Errors[\s>]/.test(xmlText)) {
    return {
      code: pickAttr(xmlText, "Error", "Code") ?? "OTA_ERROR",
      message: pick(xmlText, "Error") ?? "The property system rejected the request.",
    };
  }
  return null;
}

/**
 * What is safe to write to the integration log.
 *
 * The log is read by the reservations team in the admin, so it must never
 * carry a credential. Redaction happens at write time rather than at read
 * time: a secret that reaches the database is already leaked.
 */
export function redact(xmlText: string): string {
  return xmlText
    .replace(/(<(?:\w+:)?Password[^>]*>)[\s\S]*?(<\/(?:\w+:)?Password>)/gi, "$1[redacted]$2")
    .replace(/(<(?:\w+:)?Username[^>]*>)[\s\S]*?(<\/(?:\w+:)?Username>)/gi, "$1[redacted]$2")
    .replace(/(<(?:\w+:)?CardNumber[^>]*>)[\s\S]*?(<\/(?:\w+:)?CardNumber>)/gi, "$1[redacted]$2")
    .replace(/(CardNumber\s*=\s*")[^"]*(")/gi, "$1[redacted]$2");
}
