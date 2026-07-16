// --- File selection (click + drag/drop), backed by a DataTransfer so the
// underlying <input type=file> stays in sync with what's shown in the list.
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
let currentFiles = [];

function isDocxFile(f) {
  return f.name.toLowerCase().endsWith(".docx") ||
    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function isPdfFile(f) {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

function renderFileList() {
  fileList.innerHTML = "";
  currentFiles.forEach((file, idx) => {
    const row = document.createElement("div");
    row.className = "file-row";
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const icon = isDocxFile(file) ? "📝" : "📄";
    row.innerHTML = `<span>${icon} ${escapeHtml(file.name)} <span style="color:#999">(${sizeKb} KB)</span></span>
      <button type="button">✕ remove</button>`;
    row.querySelector("button").addEventListener("click", () => {
      currentFiles.splice(idx, 1);
      syncInput();
    });
    fileList.appendChild(row);
  });
}

function syncInput() {
  const dt = new DataTransfer();
  currentFiles.forEach(f => dt.items.add(f));
  fileInput.files = dt.files;
  renderFileList();
}

function addFiles(fileArr) {
  for (const f of fileArr) {
    if (!isPdfFile(f) && !isDocxFile(f)) continue;
    const isDuplicate = currentFiles.some(existing => existing.name === f.name && existing.size === f.size);
    if (!isDuplicate) currentFiles.push(f);
  }
  syncInput();
}

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => addFiles([...fileInput.files]));

["dragenter", "dragover"].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.add("drag");
  });
});
["dragleave", "drop"].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  });
});
dropzone.addEventListener("drop", e => {
  addFiles([...e.dataTransfer.files]);
});

// --- Submit: upload documents, analyze, and render results ---
const form = document.getElementById("upload-form");
const statusBox = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");
const resultsEl = document.getElementById("results");

function setStatus(kind, html) {
  statusBox.className = `status-box ${kind}`;
  statusBox.innerHTML = html;
}

function clearStatus() {
  statusBox.className = "status-box";
  statusBox.innerHTML = "";
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

function riskClass(level) {
  const v = (level || "none").toLowerCase();
  return ["high", "medium", "low"].includes(v) ? v : "none";
}

// --- Chat state: held only in this tab, never persisted server-side ---
let currentDocumentText = "";
let chatHistory = [];

function renderResults(data) {
  document.getElementById("result-doc-type").textContent = data.document_type || "Document Analysis";
  document.getElementById("result-confidence").textContent =
    `Overall confidence: ${data.overall_confidence != null ? data.overall_confidence : "—"}%`;
  document.getElementById("result-filenames").textContent =
    (data._filenames || []).join(", ");
  document.getElementById("result-summary").textContent = data.summary || "";

  document.getElementById("truncation-warning").style.display = data._truncated ? "block" : "none";

  currentDocumentText = data._document_text || "";
  chatHistory = [];
  document.getElementById("chat-messages").innerHTML = "";
  clearChatStatus();

  const partiesEl = document.getElementById("result-parties");
  const parties = data.parties || [];
  partiesEl.innerHTML = parties.length
    ? parties.map(p => `<div class="party-chip">${escapeHtml(p.name)} <span class="role">— ${escapeHtml(p.role)}</span></div>`).join("")
    : '<div class="empty-note">None identified.</div>';

  const datesEl = document.getElementById("result-dates");
  const dates = data.key_dates || [];
  datesEl.innerHTML = dates.length
    ? dates.map(d => `<div class="date-row"><span class="label">${escapeHtml(d.label)}:</span> ${escapeHtml(d.value)}</div>`).join("")
    : '<div class="empty-note">None identified.</div>';

  const clausesEl = document.getElementById("result-clauses");
  const clauses = data.clauses || [];
  clausesEl.innerHTML = clauses.length
    ? clauses.map(c => {
        const rc = riskClass(c.risk_level);
        return `<div class="clause-card ${rc}">
          <div class="clause-top">
            <span class="clause-title">${escapeHtml(c.category)}${c.location_hint ? ` <span class="location">(${escapeHtml(c.location_hint)})</span>` : ""}</span>
            <span class="risk-badge ${rc}">${rc === "none" ? "No risk" : rc + " risk"}</span>
          </div>
          <p>${escapeHtml(c.explanation)}</p>
          ${c.risk_note ? `<p class="risk-note">${escapeHtml(c.risk_note)}</p>` : ""}
        </div>`;
      }).join("")
    : '<div class="empty-note">No standard clauses were identified.</div>';

  const obligationsEl = document.getElementById("result-obligations");
  const obligations = data.obligations || [];
  obligationsEl.innerHTML = obligations.length
    ? obligations.map(o => `<div class="obligation-row">
        <span class="party-label">${escapeHtml(o.party)}</span>
        <span>${escapeHtml(o.obligation)}</span>
        <span class="deadline">${escapeHtml(o.trigger_or_deadline || "Ongoing")}</span>
      </div>`).join("")
    : '<div class="empty-note">No specific obligations were identified.</div>';

  const missingEl = document.getElementById("result-missing");
  const missing = data.missing_terms || [];
  missingEl.innerHTML = missing.length
    ? missing.map(m => `<div class="missing-term-card">
        <h5>${escapeHtml(m.term)}</h5>
        <p>${escapeHtml(m.why_it_matters)}</p>
        <p class="rec"><strong>Recommendation:</strong> ${escapeHtml(m.recommendation)}</p>
      </div>`).join("")
    : '<div class="empty-note">No obviously missing standard terms were identified.</div>';

  resultsEl.style.display = "block";
  resultsEl.scrollIntoView({ behavior: "smooth" });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (currentFiles.length === 0) {
    setStatus("error", "Please add at least one PDF or Word document first.");
    return;
  }

  submitBtn.disabled = true;
  resultsEl.style.display = "none";
  setStatus("info", '<span class="spinner"></span>Reading the document and analyzing clauses, risks, and obligations... this can take 30-60 seconds.');

  const fd = new FormData();
  currentFiles.forEach(f => fd.append("documents", f));

  try {
    const resp = await fetch("/analyze", { method: "POST", body: fd });
    const payload = await resp.json().catch(() => null);

    if (!resp.ok) {
      setStatus("error", (payload && payload.error) || "Something went wrong analyzing the document.");
      submitBtn.disabled = false;
      return;
    }

    clearStatus();
    renderResults(payload);
  } catch (err) {
    setStatus("error", "Network error talking to the server. Is it still running?");
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("print-btn").addEventListener("click", () => window.print());

// --- Chat about the document ---
const chatMessagesEl = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatStatusEl = document.getElementById("chat-status");

function setChatStatus(kind, html) {
  chatStatusEl.className = `status-box ${kind}`;
  chatStatusEl.innerHTML = html;
}
function clearChatStatus() {
  chatStatusEl.className = "status-box";
  chatStatusEl.innerHTML = "";
}

function appendChatBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  chatMessagesEl.appendChild(bubble);
  bubble.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function sendChatQuestion() {
  const question = chatInput.value.trim();
  if (!question) return;
  if (!currentDocumentText) {
    setChatStatus("error", "No document text available — analyze a document first.");
    return;
  }

  appendChatBubble("user", question);
  chatInput.value = "";
  chatInput.disabled = true;
  chatSendBtn.disabled = true;
  clearChatStatus();
  setChatStatus("info", '<span class="spinner"></span>Thinking...');

  try {
    const resp = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_text: currentDocumentText,
        question,
        history: chatHistory,
      }),
    });
    const payload = await resp.json().catch(() => null);

    if (!resp.ok) {
      clearChatStatus();
      setChatStatus("error", (payload && payload.error) || "Something went wrong answering that question.");
      return;
    }

    clearChatStatus();
    appendChatBubble("assistant", payload.answer);
    chatHistory.push({ role: "user", content: question });
    chatHistory.push({ role: "assistant", content: payload.answer });
  } catch (err) {
    clearChatStatus();
    setChatStatus("error", "Network error talking to the server. Is it still running?");
  } finally {
    chatInput.disabled = false;
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
}

chatSendBtn.addEventListener("click", sendChatQuestion);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChatQuestion();
  }
});
