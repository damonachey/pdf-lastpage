const pageCells = new Map();

function getDisplayUrl(pdfUrl) {
  try {
    return decodeURI(pdfUrl);
  } catch {
    return pdfUrl;
  }
}

function createItem(pdfUrl, title, lastPage) {
  const displayUrl = getDisplayUrl(pdfUrl);

  const link = document.createElement("a");
  link.href = pdfUrl;
  link.textContent = title ?? displayUrl;

  const titleCell = document.createElement("td");
  titleCell.append(link);

  const pageCell = document.createElement("td");
  pageCell.className = "last_page";
  pageCell.textContent = lastPage ?? "–";
  pageCells.set(pdfUrl, pageCell);

  const row = document.createElement("tr");
  row.title = displayUrl;
  row.append(titleCell, pageCell);
  row.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: pdfUrl });
  });
  return row;
}

function createEmptyItem() {
  const cell = document.createElement("td");
  cell.className = "empty";
  cell.colSpan = 2;
  cell.textContent = "No PDFs opened yet.";

  const row = document.createElement("tr");
  row.append(cell);
  return row;
}

async function render() {
  const stored = await chrome.storage.local.get(null);
  const pdfs = stored.pdfs ?? [];

  pageCells.clear();
  const items = pdfs.length > 0
    ? pdfs.map((pdfUrl) => createItem(pdfUrl, stored[`title:${pdfUrl}`], stored[`page:${pdfUrl}`]))
    : [createEmptyItem()];

  document.getElementById("pdf_list").replaceChildren(...items);
}

// Page changes update just their cell, so scrolling a PDF doesn't rebuild the list.
chrome.storage.local.onChanged.addListener((changes) => {
  let listChanged = false;

  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key.startsWith("page:")) {
      const cell = pageCells.get(key.slice("page:".length));
      if (cell) cell.textContent = newValue ?? "–";
    } else {
      listChanged = true;
    }
  }

  if (listChanged) render();
});

render();
