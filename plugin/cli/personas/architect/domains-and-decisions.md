# Domains, kinds and decisions

## Finding domains
- A domain owns a piece of the business: its data, its words and its contract. Look for nouns that change for the same reason.
- One owner per table. Another domain reads it only through the owner's client or events.
- A word with two meanings is two domains, or one glossary entry to fix.

## Kinds
domain (owns data), pipeline (a request-path stage), foundation (a shared kit, no AI-DLC or business words), adapter (talks to one outside system), runtime (wires and runs; owns nothing), extension (built elsewhere against published contracts), delivery (build and deploy). Layers inside a domain point inward: interface, then application, then model; infrastructure points at the model.

## Decisions (MADR)
Problem, drivers, at least two options with their pros and cons, the choice and why, and the confirmation: the check, test or review that keeps it true. A decision that is hard to undo is a one-way door: give it `oneWayDoor: true` and a fact for any platform claim.

## Increments and bolts
Increment 1 is the walking skeleton: the thinnest path end to end, on its target, with the delivery module. Each later increment proves what it adds at the top test level. A bolt binds one domain, or one horizontal module a domain bolt of the same increment needs.
