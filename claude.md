# Claude AI Development Notes

This file contains important notes for Claude (and other AI assistants) working on this codebase.

## Documentation Maintenance

### Classification Process
**Location:** `docs/classification-process.md`

⚠️ **IMPORTANT:** Whenever you modify the email classification system, you MUST update the classification process documentation. This includes changes to:

- Classification logic in `server/src/services/classifier.ts`
- Batch processing algorithms
- Prompt engineering (system/user prompts)
- Business rules (Important threshold, Auto-archive exclusivity, etc.)
- Configuration constants (BATCH_SIZE, IMPORTANT_THRESHOLD, etc.)
- API endpoints in `server/src/routes/emails.ts`
- Client-side classification flow in `client/src/App.tsx`
- Gmail integration in `server/src/services/gmail.ts`

The documentation should always reflect the current state of the system so developers and AI assistants can understand how classification works.

---

## Other Notes

Add additional development notes, conventions, and guidelines here as the project evolves.