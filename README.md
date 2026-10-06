# opencode-autotitle

Automatic, concise titles for [OpenCode V2](https://opencode.ai/v2/docs/build/plugins). This fork is based on the original plugin by Pawel Madejski (MIT license).

OpenCode's `session.title` hook invokes this plugin when a title is being generated. It reads the conversation, selects a fast available model, and calls V2's transient `generate.text` API. Successful AI titles start with `✨`; if generation fails, a keyword title starts with `🔍`. Existing user titles are preserved. The plugin does not create temporary sessions or add messages to conversation history.

## Installation

Requires OpenCode V2 and Node.js 18 or newer. From this checkout:

```bash
npm ci --ignore-scripts
npm run build
```

Add the checkout directory to `plugins` in your OpenCode `opencode.json` or `opencode.jsonc`:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-autotitle"]
}
```

OpenCode's local directory loader resolves `server.js`, which reexports `dist/index.js`. Keep both the root file and `dist/` when moving the built plugin. The package also exports `./server` for direct imports.

## Configuration

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `OPENCODE_AUTOTITLE_MODEL` | Auto-select a fast model | Model ID, optionally `provider/model` |
| `OPENCODE_AUTOTITLE_PROVIDER` | Any available provider | Restrict auto-selection to one provider |
| `OPENCODE_AUTOTITLE_MAX_LENGTH` | `60` | Maximum title length including emoji |
| `OPENCODE_AUTOTITLE_DISABLED` | `false` | Set to `1` or `true` to disable |
| `OPENCODE_AUTOTITLE_DEBUG` | `false` | Set to `1`/`true` for stderr, or a file path |

If no fast model is available, the session's current title model is used. The configured model takes precedence over provider auto-selection. Generation errors fall back to a keyword title. Debug logs do not include message text or model responses.

## Development

```bash
npm run typecheck
npm test
npm run build
```

The plugin targets `@opencode/plugin` 2.0.22. See [V2 plugin documentation](https://opencode.ai/v2/docs/build/plugins) for the hook lifecycle.
