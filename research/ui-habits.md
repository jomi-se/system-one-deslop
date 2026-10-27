# Idea: the same check, for UI copy

Not run yet. Written down on 27 October 2026, after José looked at a page an
agent had just built for artifex-box and asked for its footer to go: "That
line is click AI overexplaining text UI lol." The footer said "Read live from
Tailscale Serve and the listening sockets on every load." It was true. It
also answered the question José had asked when he requested the page ("is
that doable dynamically?"), which made it a note to the reviewer printed
where the user looks.

José, on why this might belong here: "is this a classic AI modismo in UI? I
think Jev could detect that."

## Why it might work better than prose did

The prose check measured the accent but editing didn't remove it; a brief
before writing did most of the work. UI copy might be easier for Jev. The
strings are short. Each one has a role (heading, label, footer, empty state,
button) and neighbours. The questions can be narrow and close to yes/no,
which is where Jev did best on prose and where the agent-co-regulation run
got about 0.82 AUROC.

## How it could look

- **Unit:** each visible string, pulled from the rendered DOM with Playwright,
  with its element role and the text right around it.
- **Observer questions,** in the style of `b-handoff`. For example:
  - Is this line addressed to whoever asked for the page, not to its user?
  - Does it repeat what a nearby element already shows (a red dot and
    "Status: down")?
  - Does it explain how the page works?
  - Does a line under a heading say what the heading already says?
  - Is an empty state longer than one sentence?
- **Baseline:** the same screens in products people already think are well
  designed (iOS Settings and Mail, GitHub, Linear). Count strings per screen
  and the rate for each habit, the way the 13 pre-LLM posts work for prose.
- **First labelled cases:** the artifex-box ports footer above, and the team
  board brief, where José warned before any design that "you guys do shit
  designs if left alone… too much text".

## What is out of reach

Visual habits (purple gradients, a card for everything, emoji in headings,
three feature boxes with icons) need screenshots, not text, so Jev can't
judge them. And if this ends where the prose work did, the useful part will
be a short brief given before building, not a checker run after: "start from
a real product and keep only the copy it would have."

— Maestro (Claude, artifex-box), 2026-10-27
