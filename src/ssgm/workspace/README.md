# SSGM Workspace Inspector

File operation tracking and diff generation for the SSGM (Snapshot/Session Graph Manager) system.

## Feature Flag

The workspace tracker is controlled by the `WORKSPACE_TRACKING_ENABLED` environment variable:

```bash
WORKSPACE_TRACKING_ENABLED=true openclaw gateway start
```

When disabled (default), the tracker has zero performance impact.

## What It Tracks

- **File Reads**: When `fs.readFileSync` is called
- **File Writes**: When `fs.writeFileSync` is called
- **Diffs**: Unified diffs generated for file modifications (before/after snapshots)

## What's Excluded

To minimize overhead and noise, the tracker excludes:

- System directories (`node_modules`, `.git`, `__pycache__`, etc.)
- Binary files (images, videos, archives, executables, etc.)
- Files outside the workspace

## API Endpoints

### GET /api/ssgm/workspace/files

List tracked file operations.

**Query Parameters:**
- `type` - Filter by type: `read` or `write`
- `limit` - Number of results (default: 100, max: 1000)
- `offset` - Pagination offset

**Example:**
```bash
curl http://localhost:18789/api/ssgm/workspace/files?type=write&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "write",
      "path": "/path/to/file.ts",
      "timestamp": 1707580800000,
      "sessionId": "session-uuid",
      "size": 1234,
      "hasDiff": true
    }
  ],
  "meta": {
    "count": 1,
    "limit": 100,
    "offset": 0
  }
}
```

### GET /api/ssgm/workspace/diff/:file_id

Get the unified diff for a file operation.

**Example:**
```bash
curl http://localhost:18789/api/ssgm/workspace/diff/uuid
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "diff-uuid",
    "fileId": "file-uuid",
    "path": "/path/to/file.ts",
    "unifiedDiff": "--- file.ts\n+++ file.ts\n@@ -1,3 +1,3 @@\n-old line\n+new line",
    "beforeLength": 100,
    "afterLength": 120,
    "timestamp": 1707580800000
  }
}
```

### GET /api/ssgm/workspace/stats

Get tracking statistics.

**Example:**
```bash
curl http://localhost:18789/api/ssgm/workspace/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "readCount": 150,
    "writeCount": 75,
    "diffCount": 60,
    "totalTracked": 225,
    "enabled": true
  }
}
```

### GET /api/ssgm/workspace/health

Health check endpoint.

**Example:**
```bash
curl http://localhost:18789/api/ssgm/workspace/health
```

## Storage

Diffs are stored in:
- **Memory**: Last 10,000 operations kept in memory
- **Disk**: `$OPENCLAW_STATE_DIR/ssgm/diffs/` (default: `~/.openclaw/ssgm/diffs/`)

### Retention

Old diffs are automatically cleaned up based on `WORKSPACE_DIFF_RETENTION_DAYS` (default: 30 days). Set to `0` to disable cleanup.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Code                        │
├─────────────────────────────────────────────────────────────┤
│  fs.readFileSync()  │  fs.writeFileSync()                    │
└─────────┬───────────┴────────────┬──────────────────────────┘
          │                        │
┌─────────▼───────────┐   ┌────────▼────────┐
│   Read Hook         │   │   Write Hook     │
│   (trackFileRead)   │   │   (trackFileWrite)│
└─────────┬───────────┘   └────────┬────────┘
          │                        │
          └────────┬───────────────┘
                   │
        ┌──────────▼──────────┐
        │   File Operations   │
        │   (in-memory Map)   │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   Diff Generator    │
        │   (unified diff)    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   Disk Storage      │
        │   (~/.openclaw/...) │
        └─────────────────────┘
```

## Performance Considerations

- **When disabled**: Zero overhead - hooks are not installed
- **When enabled**: Minimal overhead
  - Reads: ~1-2ms to log the operation
  - Writes: ~2-5ms to capture before state and generate diff
  - Memory: ~500 bytes per tracked operation
  - Diff storage: Size depends on change magnitude

## Security

- Diffs contain file contents - ensure `~/.openclaw/ssgm/diffs/` has appropriate permissions
- API endpoints require gateway authentication
- Consider redaction for sensitive files

## Troubleshooting

### Workspace tracking not working

1. Check that `WORKSPACE_TRACKING_ENABLED=true` is set
2. Verify the gateway is using the updated code
3. Check logs for "SSGM Workspace: initializing..."

### Diffs not being generated

- Diffs are only generated for modifications (not new files)
- Binary files are excluded
- System directories are excluded

### Too much disk usage

- Reduce `WORKSPACE_DIFF_RETENTION_DAYS`
- Manually clean `~/.openclaw/ssgm/diffs/`
- Disable tracking when not needed

## Future Enhancements

- [ ] WebSocket streaming of file events
- [ ] Checkpoint/restore functionality
- [ ] Integration with task graph
- [ ] File watching for non-sync operations
- [ ] Diff compression for large files
