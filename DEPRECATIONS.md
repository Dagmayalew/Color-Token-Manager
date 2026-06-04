# Deprecations

## `colorTokenManager.importStyle` → `colorTokenManager.importMode`

|                 |                                                          |
| --------------- | -------------------------------------------------------- |
| **Status**      | Deprecated (warn once per VS Code profile on activation) |
| **Removal**     | **v1.0.0**                                               |
| **Replacement** | `colorTokenManager.importMode`                           |

### Migration

**Before** (`importStyle` only supports `named` and `default`):

```json
{
  "colorTokenManager.importStyle": "default"
}
```

**After**:

```json
{
  "colorTokenManager.importMode": "default"
}
```

`importMode` also supports `namespace` for `import * as colors from '...'`.

### Behavior today

1. If `importMode` is set, it wins.
2. If only `importStyle` is set, its value is used as a fallback (same as before).
3. If both are set, `importMode` wins and a one-time warning explains that `importStyle` is ignored.

### Remove before v1.0.0

Delete `colorTokenManager.importStyle` from user/workspace `settings.json` and use `importMode` only.
