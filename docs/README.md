# Docs

Where the thinking lives. Code explains itself; this explains the code.

| | |
| --- | --- |
| [vision.md](vision.md) | What we are building and in what order. Read this first. |
| [architecture.md](architecture.md) | The stack, the infrastructure, the codebase map. |
| [decisions/](decisions/) | Why things are the way they are, one record per choice. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | How to run it and how we work together. |

## Where to put a thought

| It is… | Put it in |
| --- | --- |
| Broken | An [issue](../../../issues/new?template=bug.yml) |
| Something to build | An [issue](../../../issues/new?template=task.yml) |
| A choice someone has to make | A [decision issue](../../../issues/new?template=decision.yml), then a record in `decisions/` once it is settled |
| Half-formed, or a question | A [discussion](../../../discussions) |
| The reason behind code you are writing | A comment in the code |
| The reason behind a choice that outlives the code | A record in `decisions/` |

The line between the last two is how long it stays true. A comment explains
*this function*; a decision record explains *why this function exists at all*
and survives it being rewritten.

## Keeping this honest

Stale documentation is worse than none, because people trust it. Two habits keep
it alive:

- If a pull request makes something here wrong, fix it in the same pull request.
  The checklist in the PR template asks.
- Decision records are **append-only**. When something changes, write a new
  record superseding the old one rather than editing it. What we believed at the
  time is the useful part.
