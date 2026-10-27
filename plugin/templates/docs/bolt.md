---
type: Bolt
title: <the bolt in a few words>
description: <the bolt's goal in one sentence>
intent: I-<n>
increment: I-<n>.<k>
requirements: [R-<n>]
depends: []
slices: []
modules: [<module id>]
scope: ["<glob the builder may write>"]
reserves: []
---

# Why
<the reason for this bolt>

# Acceptance criteria
- AC-1 (<level>): Given <context>, when <action>, then <observable outcome>; tested before the code.

# Domain
<full lane: the entities this bolt adds or changes, the one domain owning each, how domains interact; no technology. Else delete this section>

# Logical
<the services, interfaces and data shapes this bolt adds or changes, and why; or delete both sections and set design: "<why none>">

# Interfaces
- [<spec it consumes or provides>](<path>): <what it consumes or provides>; a web page or database as a link or a name with its location

# Out of scope
- <what the builder must not do>
