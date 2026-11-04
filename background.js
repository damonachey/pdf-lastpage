let pendingWrite = Promise.resolve();

// Writes are chained so two quick events can't overwrite each other's update.
function recordPdf(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  const pdfUrl = url.href;

  console.log("PDF opened:", pdfUrl);

  pendingWrite = pendingWrite
    .then(async () => {
      const { pdfs = [] } = await chrome.storage.local.get("pdfs");
      const others = pdfs.filter((existing) => existing !== pdfUrl);
      await chrome.storage.local.set({ pdfs: [pdfUrl, ...others] });
    })
    .catch((error) => console.error("Could not save PDF:", error));

  return pendingWrite;
}

function getHeader(headers, name) {
  const header = headers.find((h) => h.name.toLowerCase() === name);
  return header?.value ?? "";
}

// Web PDFs are detected by content type, so URLs without a .pdf extension count
// and .pdf URLs that return an error page don't.
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.statusCode < 200 || details.statusCode >= 300) return;

    const contentType = getHeader(details.responseHeaders, "content-type");
    const disposition = getHeader(details.responseHeaders, "content-disposition");
    const isPdf = contentType.split(";")[0].trim().toLowerCase() === "application/pdf";
    const isDownload = disposition.trim().toLowerCase().startsWith("attachment");

    if (isPdf && !isDownload) recordPdf(details.url);
  },
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
  ["responseHeaders"]
);

// Local files have no response headers, so they are detected by extension.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url?.startsWith("file:")) return;

  if (new URL(tab.url).pathname.toLowerCase().endsWith(".pdf")) recordPdf(tab.url);
});
