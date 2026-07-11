import "server-only";

// Pragmatic vCard (RFC 6350/2426) parser — enough for Apple/Google address
// book exports. Handles line folding, Apple's itemN. property prefixes,
// escaping, and multi-value TEL/EMAIL. PHOTO and other binary blobs are
// ignored (and the client strips them before upload anyway).

export type ParsedContact = {
  name: string;
  org: string | null;
  title: string | null;
  emails: string[];
  phones: string[];
  bday: string | null;
  note: string | null;
  uid: string | null; // vCard UID — the CardDAV sync's stable remote key
};

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeV(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function splitProp(line: string): { prop: string; value: string } {
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ":" && !inQ) return { prop: line.slice(0, i), value: line.slice(i + 1).trim() };
  }
  return { prop: line, value: "" };
}

// "item1.EMAIL;TYPE=WORK" → "EMAIL" (Apple prefixes grouped props with itemN.)
function baseName(prop: string): string {
  const first = prop.split(";", 1)[0]!;
  return first.replace(/^item\d+\./i, "").toUpperCase();
}

export function parseVcf(text: string): ParsedContact[] {
  const lines = unfold(text);
  const out: ParsedContact[] = [];
  let cur: Record<string, any> | null = null;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") {
      cur = { emails: [], phones: [] };
      continue;
    }
    if (upper === "END:VCARD") {
      if (cur) {
        const name = (cur.fn || cur.nName || "").trim();
        if (name || cur.emails.length || cur.org) {
          out.push({
            name: name || cur.emails[0] || String(cur.org ?? "Unknown"),
            org: cur.org ?? null,
            title: cur.title ?? null,
            emails: [...new Set(cur.emails as string[])],
            phones: [...new Set(cur.phones as string[])],
            bday: cur.bday ?? null,
            note: cur.note ?? null,
            uid: cur.uid ?? null,
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const { prop, value } = splitProp(line);
    if (!value) continue;
    switch (baseName(prop)) {
      case "FN":
        cur.fn = unescapeV(value);
        break;
      case "N": {
        // family;given;middle;prefix;suffix → "given family"
        const parts = value.split(";").map((p) => unescapeV(p).trim());
        cur.nName = [parts[1], parts[0]].filter(Boolean).join(" ");
        break;
      }
      case "ORG":
        cur.org = unescapeV(value.split(";")[0] ?? value).trim() || null;
        break;
      case "TITLE":
        cur.title = unescapeV(value).trim() || null;
        break;
      case "EMAIL": {
        const e = value.trim().toLowerCase();
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) cur.emails.push(e);
        break;
      }
      case "TEL": {
        const t = value.trim();
        if (t.replace(/\D/g, "").length >= 5) cur.phones.push(t);
        break;
      }
      case "BDAY":
        cur.bday = value.trim().slice(0, 20);
        break;
      case "NOTE":
        cur.note = unescapeV(value).slice(0, 400);
        break;
      case "UID":
        cur.uid = value.trim().slice(0, 200);
        break;
      default:
        break; // PHOTO, ADR, URL, UID… ignored in v1
    }
  }
  return out;
}
