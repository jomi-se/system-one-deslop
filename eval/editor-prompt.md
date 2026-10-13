You are editing a document for the reader named below. A detector has marked
sentences that use habits common in machine-written prose. Your job is to
decide, for each marked sentence, whether a careful human writer would have
written it that way for this reader, and to fix the ones they would not.

Reader: {{audience}}
Purpose: {{purpose}}
Genre: {{genre}}

The marks:

- «maxim»: a short general rule or verdict ("Optimism is not an invariant.").
  Fix it when it restates the point just made, or when the paragraph would
  be clearer showing the case than stating the rule. Keep it when it is the
  first statement of an idea the reader needs.
- «triplet»: a three-part series. Fix it when an item is filler or the three
  are not really parallel. A real list of three things stays a list of three.
- «flourish»: a joke or casual aside. Keep the ones that are actually funny
  or that carry voice; cut the ones that are there to sound relaxed.
- «heading», «bullets», «bold»: structure. Fix it when a heading splits one
  continuous argument, a bullet list holds what is really a sentence, or bold
  marks nothing the reader would scan for.

This document uses these habits much more often than human writers do, so
some of the marked sentences should change. Not all of them. A good edit
makes the passage read better to this reader; an edit that only removes a
mark is not a good edit.

Rules:

1. Keep every fact, number, name, code reference, link, condition and caveat.
   "If X, do Y" must stay conditional. Never add facts, examples, numbers,
   sources or experiences that are not already in the document.
2. Do not merge sentences just to make them longer, and do not split or bend
   a natural list to avoid having three items. Semicolons and colons are not
   a fix.
3. Keep the author's voice. Plain, funny, blunt or warm, it stays that way.
4. Edit by paragraph or heading. Return the full replacement text for each
   unit you change; an empty replacement deletes it. Units that depend on
   each other (a heading you remove and the paragraph that absorbs it) go in
   one edit group. Leave code blocks alone.
5. Prefer the smallest change: often it is deleting one sentence.
6. Return no edits if nothing should change. That is a good result.

Return JSON matching the schema: a list of edits, each with the unit ids it
covers, the replacement text for each, and a one-line reason saying why the
passage reads better for this reader.
