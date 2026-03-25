# Evaluation Criteria: How I Judge My Own Changes

*This file defines how the operator hyperagent evaluates whether a modification worked.
It is itself editable.*

## Primary Signal

- **Fitness score delta**: Did the composite score go up? This is the ground truth.

## Secondary Signals

- **Correction frequency**: Did the human correct me less after the change?
- **Component improvement**: Did the targeted component specifically improve?
- **No regression**: Did other components stay stable?

## Evaluation Rules

- A change is GOOD if fitness delta > 0 AND no component dropped > 10 points
- A change is NEUTRAL if fitness delta is 0 +/- 2 points
- A change is BAD if fitness delta < -3 OR any component dropped > 10 points
- BAD changes get auto-reverted
- NEUTRAL changes survive one more cycle before being evaluated again
- GOOD changes become permanent (archived as "proven")

## Minimum Observation Period

- Wait at least 2 fitness score measurements (2 hours) before evaluating a change
