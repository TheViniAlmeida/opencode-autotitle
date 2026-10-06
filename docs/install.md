# Install opencode-autotitle for OpenCode V2

Clone [TheViniAlmeida/opencode-autotitle](https://github.com/TheViniAlmeida/opencode-autotitle), then run `npm ci --ignore-scripts` and `npm run build` in the checkout. Add the absolute checkout path to the `plugins` array in your `opencode.json(c)`, as shown in the [README](../README.md#installation).

The older OpenCode V1 single-file installation procedure does not load this V2 plugin. The package directory must include `server.js`, `dist/`, and its installed dependencies.
