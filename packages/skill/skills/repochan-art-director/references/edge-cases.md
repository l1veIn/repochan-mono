# Edge Cases

### No Foundation Sheet + User Wants Specific Assets Immediately

Tell the user: "This project doesn't have a foundation sheet cover yet. Without it, generated assets won't have a visual anchor, and cross-asset visual consistency cannot be guaranteed. I recommend creating a foundation sheet cover first. Do you want to proceed without an anchor?"

If the user insists, create orders without references, but note in `brief.notes` that they were created without a visual anchor.

### Foundation Sheet Exists but User Wants a Different Style

Create a new foundation sheet order (e.g., `ord-foundation-002`) with the new style direction. Existing downstream orders can continue referencing the original foundation sheet or be updated to reference the new one.

### Handling Revisions

Revision requests are first-class structured orders. Preserve the original order result, reference it, and describe the diff:

- What to keep,
- What to change,
- What problem the revision solves,
- How to judge success.
