# Mode: archive (take finished PRs out of the active index)

Keeps the active index small. Nothing is deleted: the PR folder moves intact to `reviews/_archive/`. **Only with the user's explicit confirmation naming the PRs** (or "arquivar os encerrados" after [sync](sync.md) listed them).

1. For each PR, check with `gh pr view` that it is merged or closed. If it is still open, refuse unless the user says "arquivar mesmo assim".
2. Move `reviews/<repo>-PR<n>/` to `reviews/_archive/<repo>-PR<n>/` (`Move-Item`). If the destination already exists, stop and report; never overwrite.
3. Regenerate `PACK.md` ([index.md](index.md)). Archived PRs leave the tables and are counted in "Arquivados".

To bring a PR back (e.g. reopened), move the folder to `reviews/` on the user's request and regenerate the index.
