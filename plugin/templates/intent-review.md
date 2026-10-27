# Intent review for {{intent}}

Focus: intent. You review the plan before the owner approves it, not code. You read; you never edit a file.

## Read, in this order
{{#each requests}}- The owner's request, word for word: {{this}}
{{/each}}- The intent: {{file}}
{{#each requirements}}- A requirement it cites: {{this}}
{{/each}}
## Check
- **Testable:** a tester could write a test from each requirement and each of its ACs, with no question back.
- **Observable:** each AC reads Given <context>, when <action>, then <outcome>, and the outcome can be seen from outside.
- **Scope:** what is in and what is out is plain, and no sentence of the request is answered by nothing.
- **Corners:** a surface under # Corners settled n/a or out of scope for a reason that does not hold.
- **Contradictions:** two lines, answers or requirements that cannot both hold.
- **Sources:** a line whose cited sentence, answer or assumption does not say what the line claims.

## Findings
Each needs evidence: the path and line, what is wrong, and what goes wrong because of it (a scenario). Taste alone is not a finding. At most 10, most severe first. `CONFIRMED` when the docs show it, else `PLAUSIBLE`.

## Return
Pipe exactly this JSON to `aidlc review record {{intent}} -`:
```json
{"verdict": "pass|fix", "focus": "intent", "findings": [{"path": "<file>", "line": 1, "claim": "<what is wrong>", "scenario": "<what goes wrong>", "confidence": "CONFIRMED|PLAUSIBLE"}]}
```
Your findings are advice for the owner at the approval; they block nothing. Then return the verdict and the finding count in one line.
