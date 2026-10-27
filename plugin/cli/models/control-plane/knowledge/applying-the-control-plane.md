# Applying the control-plane model

Read the model horizontally first, then vertically.

## Horizontal: what every request crosses
- **Front door:** one stateless runtime. It owns no data; it routes by the namespace in the path.
- **Governance, in order:** authenticate, authorize, policy, lock, throttle. Policy judges the resource as it would become, a partial update merged first. A lock refuses a change even a provider would reject. Throttle reports the budget left on every answer. Quota is not a stage of the model: the project decides whether it is a stage or each provider's.
- **Shared domains:** resources (the metadata of every resource), operations (long-running status and result), deployments (a template's graph of idempotent writes), activity (the log and the events).

## Vertical: what each provider declares
- A namespace, its resource types, and for each type whether its writes are long-running. The profile's `modules[].slice` holds them; the slice-contract rule checks them.
- Its API under its namespace, in the contract grammar and the model's contract (envelope with `systemData`, lists with `nextLink`).
- An event for each write, delete and action, success or failure, named in its API.

## The rules, and where a project names its own words
- **Stage order:** `model.wiring` names the file and the pattern that list the stages.
- **Long-running:** `model.operations` names the status, result and retry headers and the marker that flags an operation.
- **Events:** `model.events` names the marker and the events files.
- **Idempotency:** every write bolt has an AC that repeats the write and finds status and state unchanged.
- **Data:** every owned table declares `(partition: <key>, class: regional|shared|global)`.

## Order of work
1. Walking skeleton: one request through every stage to one provider and back, on the target.
2. Resource metadata, so listing by scope and cascade delete work.
3. Long-running operations, then deployments that converge by re-applying.
4. Events and the activity log.
5. Each further provider as its own slice.

On existing code, `aidlc models gaps` lists what the modules miss; each gap is an increment.
