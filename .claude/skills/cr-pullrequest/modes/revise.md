# Mode: revise (same code, new decisions)

Used when the head SHA did not change and the user returns with decisions from the requester/author, or says they published the review.

- Edit the **latest round's `review.md` in place**. Do not re-run the subagent unless the user asks.
- Per adjusted finding: set `Status` to `Resolvido`, `Aceito`, `Rejeitado` or `Mantido`, with the reason and the source (who said it, when). Out-of-scope observations (section 6) have their own `Status` column: `Aberto`, `Encaminhado` (ticket opened or handed to the owning team), `Aceito` or `Resolvido`; set it the same way and record the source in the history. Reviews written before this column existed have none: add the column when the first observation is adjusted, leaving the others `Aberto`. Keep the original finding text; add the decision under it.
- A decision that contradicts a verified fact (e.g. it assumes behavior the code does not have): say so before applying, and record the disagreement.
- Recompute the verdict line in section 1.
- "Publiquei": set `- **Publicado:** sim (<date>)` in the header of that round.
- Append to `## Histórico de revisão`: date/time (`Get-Date`), what changed, source.
- Regenerate `STATUS.md` and `PACK.md` ([index.md](index.md)).
