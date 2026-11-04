// Finds the best available title for a PDF, trying the most reliable source first.

const MAX_TITLE_LENGTH = 200;
const HEADING_MIN_LETTERS = 4;
const HEADING_MIN_SIZE_RATIO = 1.15;

const JUNK_TITLE = /^(untitled.*|title|no title|none|unknown|document|presentation|slide\s*\d*)$/i;
const OFFICE_PREFIX = /^microsoft\s+(word|powerpoint|excel)\s*-\s*/i;
const FILE_NAME = /\.(pdf|docx?|pptx?|xlsx?|rtf|txt|tex|dvi|ps|indd|qxd)$/i;
const FILE_PATH = /^([a-z]:[\\/]|[\\/])/i;
const GARBLED = /[￰-￿]/;
const GENERIC_FILE_NAME = /^(document|download|file|pdf|print|untitled|view)$/i;

function isUsableText(text) {
  return text.length <= MAX_TITLE_LENGTH && /\p{L}.*\p{L}/su.test(text) && !GARBLED.test(text);
}

function cleanMetadataTitle(rawTitle) {
  if (typeof rawTitle !== "string") return null;

  const title = rawTitle.trim().replace(OFFICE_PREFIX, "");
  if (!isUsableText(title) || JUNK_TITLE.test(title)) return null;
  if (FILE_NAME.test(title) || FILE_PATH.test(title)) return null;

  return title;
}

async function getMetadataTitle(pdfDocument) {
  const { info, metadata } = await pdfDocument.getMetadata();

  return cleanMetadataTitle(metadata?.get("dc:title")) ?? cleanMetadataTitle(info?.Title);
}

function getFontSize({ transform }) {
  return Math.round(Math.hypot(transform[2], transform[3]));
}

function countLetters(text) {
  return text.match(/\p{L}/gu)?.length ?? 0;
}

// Reads the first run of the page's largest text, skipping rotated text such as margin stamps.
async function getFirstPageHeading(pdfDocument) {
  const page = await pdfDocument.getPage(1);
  const { items } = await page.getTextContent();
  const textItems = items.filter(
    ({ str, transform }) => str !== undefined && Math.abs(transform[1]) < 0.001 && transform[0] > 0
  );

  const lettersBySize = new Map();
  for (const item of textItems) {
    const size = getFontSize(item);
    lettersBySize.set(size, (lettersBySize.get(size) ?? 0) + countLetters(item.str));
  }

  const sizes = [...lettersBySize.keys()];
  if (sizes.length === 0) return null;

  // Heading text must stand out from the size used for most of the page.
  const bodySize = sizes.reduce((a, b) => (lettersBySize.get(b) > lettersBySize.get(a) ? b : a));
  const headingSize = Math.max(...sizes.filter((size) => lettersBySize.get(size) >= HEADING_MIN_LETTERS), 0);
  if (headingSize < bodySize * HEADING_MIN_SIZE_RATIO) return null;

  let heading = "";
  let lastY = null;
  for (const item of textItems) {
    if (!item.str.trim()) {
      if (lastY !== null) heading += " ";
      continue;
    }

    const isHeading = getFontSize(item) === headingSize;
    if (lastY === null && !isHeading) continue;
    if (!isHeading) break;

    const y = item.transform[5];
    if (lastY !== null) {
      const gap = Math.abs(y - lastY);
      if (gap > headingSize * 2) break;
      if (gap > 1) heading += " ";
    }

    heading += item.str;
    lastY = y;
  }

  heading = heading.replace(/\s+/g, " ").trim();
  return isUsableText(heading) ? heading : null;
}

function cleanFileName(rawName) {
  const name = rawName
    .split(/[\\/]/)
    .pop()
    .replace(/\.pdf$/i, "")
    .trim();

  return isUsableText(name) && !GENERIC_FILE_NAME.test(name) ? name : null;
}

function getServerFileName(responseHeaders) {
  const header = Object.entries(responseHeaders ?? {}).find(
    ([name]) => name.toLowerCase() === "content-disposition"
  );
  const value = String(header?.[1] ?? "");

  const encoded = value.match(/filename\*\s*=\s*[\w-]+'[^']*'([^;]+)/i);
  if (encoded) {
    try {
      return cleanFileName(decodeURIComponent(encoded[1].trim()));
    } catch {
      // Malformed encoding: fall through to the plain filename parameter.
    }
  }

  const plain = value.match(/filename\s*=\s*(?:"([^"]*)"|([^;]+))/i);
  return plain ? cleanFileName(plain[1] ?? plain[2]) : null;
}

// URLs without a .pdf ending are usually routes like /download, not file names.
function getUrlFileName(pdfUrl) {
  const segment = new URL(pdfUrl).pathname.split("/").pop();
  if (!segment.toLowerCase().endsWith(".pdf")) return null;

  try {
    return cleanFileName(decodeURIComponent(segment));
  } catch {
    return cleanFileName(segment);
  }
}

export async function getPdfTitle(pdfDocument, pdfUrl, responseHeaders) {
  const sources = [
    () => getMetadataTitle(pdfDocument),
    () => getFirstPageHeading(pdfDocument),
    () => getServerFileName(responseHeaders),
    () => getUrlFileName(pdfUrl),
  ];

  for (const source of sources) {
    try {
      const title = await source();
      if (title) return title;
    } catch (error) {
      console.warn("Could not read PDF title source:", error);
    }
  }

  return null;
}
