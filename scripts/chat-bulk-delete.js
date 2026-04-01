const MODULE_ID = "chat-eraser";
const SELECTORS = {
  toolbar: "[data-chat-bulk-delete-toolbar]",
  toolbarMode: "[data-action='chat-bulk-delete-toggle-mode']",
  toolbarDelete: "[data-action='chat-bulk-delete-delete-selection']",
  message: "[data-chat-bulk-delete-message-id]",
  checkbox: "[data-chat-bulk-delete-checkbox]",
  messageToggle: "[data-chat-bulk-delete-toggle]"
};

const state = {
  enabled: false,
  anchorId: null,
  selectedIds: new Set()
};

Hooks.once("init", () => {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      deleteSelectedMessages,
      clearSelection,
      toggleSelectionMode
    };
  }
});

Hooks.once("ready", () => {
  rerenderChatLog();
});

Hooks.on("renderChatLog", (application, rendered) => {
  const element = resolveElement(rendered);
  if (!element) return;
  bindChatLogListeners(element);
  ensureToolbar(element);
  syncLogElement(element);
});

Hooks.on("renderChatMessageHTML", (message, html) => {
  handleRenderedMessage(message, html);
});

Hooks.on("renderChatMessage", (message, html) => {
  handleRenderedMessage(message, html);
});

Hooks.on("deleteChatMessage", (message) => {
  state.selectedIds.delete(message.id);
  if (state.anchorId === message.id) state.anchorId = null;
  pruneSelection();
  syncAllToolbars();
});

function resolveElement(rendered) {
  if (!rendered) return null;
  if (rendered instanceof HTMLElement) return rendered;
  if (rendered?.jquery && rendered.length) return rendered[0];
  if (Array.isArray(rendered) && rendered[0] instanceof HTMLElement) return rendered[0];
  return null;
}

function handleRenderedMessage(message, rendered) {
  const element = resolveElement(rendered);
  if (!element) return;
  decorateMessage(message, element);
  syncMessageElement(element);
  syncAllToolbars();
}

function rerenderChatLog() {
  if (!ui.chat?.render) return;
  try {
    ui.chat.render({ force: true });
  } catch {
    ui.chat.render(true);
  }
}

Hooks.on("updateChatMessage", (message) => {
  if (state.selectedIds.has(message.id) && !canDeleteMessage(message)) {
    state.selectedIds.delete(message.id);
    if (state.anchorId === message.id) state.anchorId = null;
  }
  syncAllRenderedMessages();
  syncAllToolbars();
});

function bindChatLogListeners(element) {
  if (element.dataset.chatBulkDeleteBound === "true") return;
  element.dataset.chatBulkDeleteBound = "true";
  element.addEventListener("click", onChatLogClick);
}

function onChatLogClick(event) {
  const toggleModeButton = event.target.closest(SELECTORS.toolbarMode);
  if (toggleModeButton) {
    event.preventDefault();
    toggleSelectionMode();
    return;
  }

  const deleteButton = event.target.closest(SELECTORS.toolbarDelete);
  if (deleteButton) {
    event.preventDefault();
    deleteSelectedMessages();
    return;
  }

  if (!state.enabled) return;

  const messageElement = event.target.closest(SELECTORS.message);
  if (!messageElement) return;
  if (messageElement.dataset.chatBulkDeleteSelectable !== "true") return;
  if (!shouldHandleMessageClick(event)) return;

  event.preventDefault();
  event.stopPropagation();

  const messageId = messageElement.dataset.chatBulkDeleteMessageId;
  const shouldSelect = !state.selectedIds.has(messageId);

  if (event.shiftKey && state.anchorId) {
    applyRangeSelection(messageElement, shouldSelect);
  } else {
    setMessageSelected(messageId, shouldSelect);
  }

  state.anchorId = messageId;
  syncAllRenderedMessages();
  syncAllToolbars();
}

function shouldHandleMessageClick(event) {
  const selectorToggle = event.target.closest(SELECTORS.messageToggle);
  if (selectorToggle) return true;

  return !event.target.closest(
    [
      "a",
      "button",
      "input",
      "label",
      "select",
      "textarea",
      "[data-action]",
      ".message-delete"
    ].join(",")
  );
}

function ensureToolbar(element) {
  element.classList.add("chat-bulk-delete__root");

  let toolbar = element.querySelector(SELECTORS.toolbar);
  if (!toolbar) {
    toolbar = document.createElement("section");
    toolbar.className = "chat-bulk-delete__toolbar";
    toolbar.dataset.chatBulkDeleteToolbar = "true";
    toolbar.innerHTML = `
      <button type="button" class="chat-bulk-delete__icon-button" data-action="chat-bulk-delete-toggle-mode">
        <i class="fas fa-check-double" aria-hidden="true"></i>
      </button>
      <button type="button" class="chat-bulk-delete__icon-button chat-bulk-delete__icon-button--danger" data-action="chat-bulk-delete-delete-selection" hidden>
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
    `;
    element.append(toolbar);
  }

  updateToolbar(toolbar);
}

function updateToolbar(toolbar) {
  pruneSelection();

  const modeButton = toolbar.querySelector(SELECTORS.toolbarMode);
  const deleteButton = toolbar.querySelector(SELECTORS.toolbarDelete);
  const selectedCount = state.selectedIds.size;

  const modeLabel = state.enabled
    ? game.i18n.localize(`${MODULE_ID}.controls.disable`)
    : game.i18n.localize(`${MODULE_ID}.controls.enable`);
  modeButton.ariaLabel = modeLabel;
  modeButton.title = modeLabel;
  modeButton.classList.toggle("is-active", state.enabled);

  const deleteLabel = game.i18n.format(`${MODULE_ID}.controls.deleteSelected`, {
    count: selectedCount
  });
  deleteButton.ariaLabel = deleteLabel;
  deleteButton.title = deleteLabel;
  deleteButton.hidden = !state.enabled;
  deleteButton.disabled = !selectedCount;
  toolbar.classList.toggle("is-active", state.enabled);
}

function syncLogElement(element) {
  ensureToolbar(element);
  for (const messageElement of element.querySelectorAll(SELECTORS.message)) {
    syncMessageElement(messageElement);
  }
}

function decorateMessage(message, html) {
  html.dataset.chatBulkDeleteMessageId = message.id;
  html.dataset.chatBulkDeleteSelectable = canDeleteMessage(message) ? "true" : "false";

  let toggle = html.querySelector(SELECTORS.messageToggle);
  if (!toggle) {
    toggle = document.createElement("label");
    toggle.className = "chat-bulk-delete__toggle";
    toggle.dataset.chatBulkDeleteToggle = "true";
    toggle.innerHTML = `
      <input type="checkbox" class="chat-bulk-delete__checkbox" data-chat-bulk-delete-checkbox />
      <span class="chat-bulk-delete__box" aria-hidden="true"></span>
    `;
    html.prepend(toggle);
  }

  const checkbox = toggle.querySelector(SELECTORS.checkbox);
  checkbox.ariaLabel = game.i18n.localize(`${MODULE_ID}.messages.checkbox`);
  checkbox.disabled = html.dataset.chatBulkDeleteSelectable !== "true";
}

function syncMessageElement(messageElement) {
  const messageId = messageElement.dataset.chatBulkDeleteMessageId;
  if (!messageId) return;

  const selectable = messageElement.dataset.chatBulkDeleteSelectable === "true";
  const selected = selectable && state.selectedIds.has(messageId);
  const toggle = messageElement.querySelector(SELECTORS.messageToggle);
  const checkbox = messageElement.querySelector(SELECTORS.checkbox);

  messageElement.classList.toggle("chat-bulk-delete--mode", state.enabled);
  messageElement.classList.toggle("chat-bulk-delete--selectable", selectable);
  messageElement.classList.toggle("chat-bulk-delete--selected", selected);
  messageElement.classList.toggle(
    "chat-bulk-delete--locked",
    state.enabled && !selectable
  );

  if (toggle) {
    toggle.hidden = !(state.enabled && selectable);
  }

  if (checkbox) {
    checkbox.checked = selected;
    checkbox.disabled = !selectable;
  }
}

function syncAllRenderedMessages() {
  for (const messageElement of document.querySelectorAll(SELECTORS.message)) {
    syncMessageElement(messageElement);
  }
}

function syncAllToolbars() {
  for (const toolbar of document.querySelectorAll(SELECTORS.toolbar)) {
    updateToolbar(toolbar);
  }
}

function canDeleteMessage(message) {
  return Boolean(message?.canUserModify?.(game.user, "delete"));
}

function setMessageSelected(messageId, selected) {
  if (selected) state.selectedIds.add(messageId);
  else state.selectedIds.delete(messageId);
}

function applyRangeSelection(clickedElement, selected) {
  const container =
    clickedElement.closest("[data-application-part='log']") ??
    clickedElement.parentElement;
  if (!container) {
    setMessageSelected(clickedElement.dataset.chatBulkDeleteMessageId, selected);
    return;
  }

  const eligibleMessages = Array.from(container.querySelectorAll(SELECTORS.message)).filter(
    (element) => element.dataset.chatBulkDeleteSelectable === "true"
  );
  const clickedId = clickedElement.dataset.chatBulkDeleteMessageId;
  const anchorIndex = eligibleMessages.findIndex(
    (element) => element.dataset.chatBulkDeleteMessageId === state.anchorId
  );
  const clickedIndex = eligibleMessages.findIndex(
    (element) => element.dataset.chatBulkDeleteMessageId === clickedId
  );

  if (anchorIndex === -1 || clickedIndex === -1) {
    setMessageSelected(clickedId, selected);
    return;
  }

  const [start, end] = anchorIndex < clickedIndex
    ? [anchorIndex, clickedIndex]
    : [clickedIndex, anchorIndex];

  for (const element of eligibleMessages.slice(start, end + 1)) {
    setMessageSelected(element.dataset.chatBulkDeleteMessageId, selected);
  }
}

function clearSelection({ preserveMode = false } = {}) {
  state.selectedIds.clear();
  state.anchorId = null;
  if (!preserveMode) state.enabled = false;
  syncAllRenderedMessages();
  syncAllToolbars();
}

function toggleSelectionMode(force) {
  const nextState = typeof force === "boolean" ? force : !state.enabled;
  if (state.enabled === nextState) return;

  state.enabled = nextState;
  if (!state.enabled) {
    state.selectedIds.clear();
    state.anchorId = null;
  }

  syncAllRenderedMessages();
  syncAllToolbars();
}

function pruneSelection() {
  for (const id of Array.from(state.selectedIds)) {
    const message = game.messages?.get(id);
    if (!message || !canDeleteMessage(message)) state.selectedIds.delete(id);
  }

  if (state.anchorId) {
    const anchor = game.messages?.get(state.anchorId);
    if (!anchor || !canDeleteMessage(anchor)) state.anchorId = null;
  }
}

async function deleteSelectedMessages() {
  pruneSelection();

  const ids = Array.from(state.selectedIds).filter((id) => {
    const message = game.messages?.get(id);
    return message && canDeleteMessage(message);
  });

  if (!ids.length) {
    ui.notifications?.warn(game.i18n.localize(`${MODULE_ID}.notifications.noneSelected`));
    clearSelection({ preserveMode: true });
    return;
  }

  const confirmed = await confirmDeletion(ids.length);
  if (!confirmed) return;

  try {
    const documentClass =
      game.messages?.documentClass?.implementation ?? game.messages?.documentClass;
    await documentClass.deleteDocuments(ids);
    ui.notifications?.info(
      game.i18n.format(`${MODULE_ID}.notifications.deleted`, { count: ids.length })
    );
    clearSelection({ preserveMode: true });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to delete chat messages`, error);
    ui.notifications?.error(
      game.i18n.localize(`${MODULE_ID}.notifications.deleteFailed`)
    );
  }
}

async function confirmDeletion(count) {
  const title = game.i18n.localize(`${MODULE_ID}.confirm.title`);
  const content = `<p>${game.i18n.format(`${MODULE_ID}.confirm.body`, { count })}</p>`;

  if (foundry?.applications?.api?.DialogV2?.confirm) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title },
      content,
      rejectClose: false
    });
  }

  if (typeof Dialog?.confirm === "function") {
    return new Promise((resolve) => {
      Dialog.confirm({
        title,
        content,
        yes: () => resolve(true),
        no: () => resolve(false),
        defaultYes: false,
        close: () => resolve(false)
      });
    });
  }

  return Promise.resolve(window.confirm(game.i18n.format(`${MODULE_ID}.confirm.fallback`, { count })));
}
