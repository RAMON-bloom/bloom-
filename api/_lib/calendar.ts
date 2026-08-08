// Minimal Google Calendar v3 REST helper using a user's OAuth access token.
// Mirrors the plain-fetch style of _lib/drive.ts rather than pulling in googleapis.

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

async function calendarFetch(accessToken: string, url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Calendar API error (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json();
}

// Meet's "Gemini によるメモ" attachment links to the notes doc as
// https://docs.google.com/document/d/<FILE_ID>/edit?... — extract the id the same way regardless
// of which query params or view mode happen to be on the link.
function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export interface MeetingNotesMatch {
  eventSummary: string;
  eventStart: string;
  fileId: string;
  fileName: string;
}

// Finds the calendar event whose title contains `titleKeyword` closest to `dateStr`, and returns
// its auto-generated meeting-notes attachment (Google Meet's Gemini note-taker creates and
// attaches one per occurrence). This is deliberately title+date based rather than keyed to a
// fixed Meet conference code: recurring series get recreated from time to time (this one has had
// three different Meet codes across a few months), so a fixed code would stop matching the moment
// the series is next recreated, while the title stays stable.
export async function findMeetingNotesDoc(
  accessToken: string,
  dateStr: string,
  titleKeyword: string
): Promise<MeetingNotesMatch | null> {
  const centerDate = new Date(dateStr);
  if (Number.isNaN(centerDate.getTime())) return null;

  const timeMin = new Date(centerDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(centerDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    q: titleKeyword,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '10'
  });

  const data = await calendarFetch(accessToken, `${CALENDAR_API}/calendars/primary/events?${params.toString()}`);
  const events = (data.items || []).filter((e: any) => (e.summary || '').includes(titleKeyword));
  if (events.length === 0) return null;

  // The +/-24h window can catch a neighboring weekly occurrence — keep whichever one actually
  // starts closest to the requested date.
  const target = centerDate.getTime();
  events.sort((a: any, b: any) => {
    const aStart = new Date(a.start?.dateTime || a.start?.date).getTime();
    const bStart = new Date(b.start?.dateTime || b.start?.date).getTime();
    return Math.abs(aStart - target) - Math.abs(bStart - target);
  });
  const event = events[0];

  const attachments = event.attachments || [];
  const notesAttachment =
    attachments.find((a: any) => (a.title || '').includes('Gemini') && (a.title || '').includes('メモ')) ||
    attachments.find((a: any) => a.mimeType === 'application/vnd.google-apps.document');
  if (!notesAttachment?.fileUrl) return null;

  const fileId = extractDriveFileId(notesAttachment.fileUrl);
  if (!fileId) return null;

  return {
    eventSummary: event.summary || '',
    eventStart: event.start?.dateTime || event.start?.date || '',
    fileId,
    fileName: notesAttachment.title || 'Gemini によるメモ'
  };
}
