# Plugins

This directory contains custom file format handlers. Any file in this directory that exports a class implementing `FormatHandler` as its **default export** will be automatically loaded by the application.

## How to add a plugin

1. Create a new `.ts` file in this directory (e.g., `my-format.ts`).
2. Copy the structure from `example.ts` or any core handler in `../handlers/`.
3. Implement the `FormatHandler` interface.
4. Ensure you `export default` your class.

## Example

```typescript
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class MyHandler implements FormatHandler {
  // ... implementation ...
}

export default MyHandler;
```

**Note:** You do not need to register your plugin anywhere else. The build system will find it automatically.
