const pageCells = new Map();

function getDisplayUrl(pdfUrl) {
  try {
    return decodeURI(pdfUrl);
  } catch {
    return pdfUrl;
  }
}

function removePdf(pdfUrl) {
  // Same lock as the viewer, so a PDF opening in another tab can't undo this.
  return navigator.locks.request("pdfs", async () => {
    const { pdfs = [] } = await chrome.storage.local.get("pdfs");
    await chrome.storage.local.set({ pdfs: pdfs.filter((existing) => existing !== pdfUrl) });
    await chrome.storage.local.remove([`page:${pdfUrl}`, `title:${pdfUrl}`]);
  });
}

function createConfirmRow(pdfUrl, row, itemTitle) {
  const message = document.createElement("span");
  message.className = "confirm_message";
  message.textContent = "Remove from list?";

  const removeButton = document.createElement("button");
  removeButton.className = "confirm_remove";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => removePdf(pdfUrl));

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";

  const content = document.createElement("div");
  content.className = "confirm_cell";
  content.append(message, removeButton, cancelButton);

  const cell = document.createElement("td");
  cell.colSpan = 3;
  cell.append(content);

  const confirmRow = document.createElement("tr");
  confirmRow.className = "confirm_row";
  confirmRow.title = itemTitle;
  confirmRow.append(cell);

  cancelButton.addEventListener("click", () => confirmRow.replaceWith(row));
  return { confirmRow, cancelButton };
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

  const removeButton = document.createElement("button");
  removeButton.className = "remove_button";
  removeButton.textContent = "✗";
  removeButton.title = "Remove from list";
  removeButton.setAttribute("aria-label", `Remove ${title ?? displayUrl} from list`);

  const removeCell = document.createElement("td");
  removeCell.className = "remove";
  removeCell.append(removeButton);

  const row = document.createElement("tr");
  row.title = displayUrl;
  row.append(titleCell, pageCell, removeCell);

  removeButton.addEventListener("click", (event) => {
    // Keep the click from reaching the row, which would open the PDF.
    event.stopPropagation();

    const { confirmRow, cancelButton } = createConfirmRow(pdfUrl, row, title ?? displayUrl);
    row.replaceWith(confirmRow);
    cancelButton.focus();
  });

  row.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: pdfUrl });
  });
  return row;
}

function createEmptyItem() {
  const cell = document.createElement("td");
  cell.className = "empty";
  cell.colSpan = 3;
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
