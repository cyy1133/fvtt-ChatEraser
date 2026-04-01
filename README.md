# ChatEraser

Foundry Virtual Tabletop module for bulk-selecting chat messages in the chat sidebar and deleting only the ones the current user is allowed to remove.

## Features

- Adds a bulk-selection toolbar to the chat tab.
- Only shows selection controls for chat messages the current user can delete.
- Supports click-to-toggle selection.
- Supports `Shift+click` range selection across deletable chat messages.
- Confirms before deleting the current selection.

## Installation

Install from Foundry's `Install Module` dialog using this manifest URL:

```text
https://raw.githubusercontent.com/cyy1133/fvtt-ChatEraser/main/manifest.json
```

For manual installation, place the extracted files in:

```text
Data/modules/chat-eraser
```

Then enable `ChatEraser` in the world module list.

## Notes

- The module targets Foundry VTT V12 and V13.
- This initial version focuses on checkbox/range selection inside the chat sidebar UI.
