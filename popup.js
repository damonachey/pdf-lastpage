function getDisplayUrl(pdfUrl) {
  try {
    return decodeURI(pdfUrl);
  } catch {
    return pdfUrl;
  }
}

function createItem(pdfUrl) {
  const link = document.createElement("a");
  link.href = pdfUrl;
  link.textContent = getDisplayUrl(pdfUrl);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: pdfUrl });
  });

  const item = document.createElement("li");
  item.append(link);
  return item;
}

function createEmptyItem() {
  const item = document.createElement("li");
  item.className = "empty";
  item.textContent = "No PDFs opened yet.";
  return item;
}

async function render() {
  const { pdfs = [] } = await chrome.storage.local.get("pdfs");
  const items = pdfs.length > 0 ? pdfs.map(createItem) : [createEmptyItem()];

  document.getElementById("pdf_list").append(...items);
}

render();
