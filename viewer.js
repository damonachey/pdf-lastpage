// Connects the bundled PDF.js viewer to chrome.mimeHandler and saves the last page.

function savePdfToList(pdfUrl) {
  console.log("PDF opened:", pdfUrl);

  // The lock stops viewers in other tabs from overwriting each other's update.
  return navigator.locks.request("pdfs", async () => {
    const { pdfs = [] } = await chrome.storage.local.get("pdfs");
    const others = pdfs.filter((existing) => existing !== pdfUrl);
    await chrome.storage.local.set({ pdfs: [pdfUrl, ...others] });
  });
}

// Not every PDF has a usable title, so failing to read one is not an error.
async function saveTitle(pdfUrl) {
  try {
    const { info, metadata } = await PDFViewerApplication.pdfDocument.getMetadata();
    const title = (metadata?.get("dc:title") || info?.Title || "").trim();

    if (title && title !== "Untitled") {
      await chrome.storage.local.set({ [`title:${pdfUrl}`]: title });
    }
  } catch (error) {
    console.warn("Could not read PDF title:", error);
  }
}

function trackLastPage(pageKey) {
  const { eventBus, page, pdfDocument } = PDFViewerApplication;

  chrome.storage.local.set({ [pageKey]: page });

  eventBus.on("pagechanging", ({ pageNumber }) => {
    // The viewer's own "Open file" button can load a different document.
    if (PDFViewerApplication.pdfDocument !== pdfDocument) return;

    chrome.storage.local.set({ [pageKey]: pageNumber });
  });
}

async function openPdf() {
  const { originalUrl, streamUrl } = await chrome.mimeHandler.getStreamInfo();
  const response = await fetch(streamUrl);
  const data = new Uint8Array(await response.arrayBuffer());

  const url = new URL(originalUrl);
  const linkedLocation = url.hash.slice(1);
  url.hash = "";
  const pdfUrl = url.href;

  const pageKey = `page:${pdfUrl}`;
  const { [pageKey]: lastPage } = await chrome.storage.local.get(pageKey);

  await PDFViewerApplication.initializedPromise;

  // A location in the link, such as #page=3, takes priority over the saved page.
  PDFViewerApplication.initialBookmark =
    linkedLocation || (lastPage ? `page=${lastPage}` : null);

  await PDFViewerApplication.open({ data, originalUrl: pdfUrl });

  trackLastPage(pageKey);
  await saveTitle(pdfUrl);
  await savePdfToList(pdfUrl);
}

document.addEventListener("webviewerloaded", () => {
  // Without this the viewer loads its bundled default document on startup.
  PDFViewerApplicationOptions.set("defaultUrl", "");

  openPdf().catch((error) => {
    console.error("Could not open PDF:", error);
    chrome.mimeHandler.abortAndFallbackToNativeHandler();
  });
});
