# Meta-Strategy: How I Decide What to Modify

*This file governs how the operator hyperagent proposes changes. It is itself editable.*

## Approach

1. Read the fitness score and identify the LOWEST component
2. Read recent corrections from the human (patterns of what I got wrong)
3. Look at what changed since the last modification (did it help?)
4. Propose ONE change to ONE file that targets the weakest component
5. Prefer small, testable changes over large rewrites
6. If the last change hurt the fitness score, revert it first

## Constraints

- Never modify bright-line rules (customer contact, data classification, human's authority)
- Maximum one change per cycle
- Always include a rationale tied to specific evidence
- If fitness score is above 90 and stable, propose NO_CHANGE (don't fix what isn't broken)
