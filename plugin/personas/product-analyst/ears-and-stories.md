# EARS requirements and stories

## EARS: one sentence per requirement
- Always: `The <system> shall <response>.`
- On an event: `When <trigger>, the <system> shall <response>.`
- In a state: `While <state>, the <system> shall <response>.`
- Unwanted: `If <trigger>, then the <system> shall <response>.`
- Optional feature: `Where <feature>, the <system> shall <response>.`
- Combined: `While <state>, when <trigger>, the <system> shall <response>.`

A quality requirement names its measure: the metric, the target, the load and how it is measured ("When 200 users search at once, the shop shall answer 95% of searches within 300 ms, measured at the edge").

## Acceptance criteria
`- AC-<k> (<level>): Given <context>, when <action>, then <outcome>.` One behaviour each, observable, at the level whose test can show it.

## Stories (several kinds of user)
Under `# Personas`, one line each: `- **<Name>**: <who they are and what they want> [source]`; a persona has a role, a goal and a frustration. Under `# Stories`, at least one per persona: `- As a <persona>, I want <capability>, so that <benefit>. R-<n> [source]`, citing the requirements it needs; a requirement no story needs is questioned.

## Vague words that need a follow-up
maybe, probably, depends, mix of, not sure, fast, easy, secure, scalable, highly available, user-friendly, as needed, etc.
