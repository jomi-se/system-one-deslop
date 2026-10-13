# System One Deslop

## Research dossier and implementation specification

**Date:** 13 October 2026  
**Status:** Research-backed engineering proposal. The Jev prompts, thresholds, quality claims and pipeline described here **have not yet been benchmarked as a system**.  
**Intended readers:** implementation agents, maintainers, technical reviewers and evaluators.  
**Companion artifact:** [`jev-questions.json`](jev-questions.json), containing **52 independently addressable Jev questions** with full natural-language instructions and criteria.

> **Product objective:** Make text more valuable and more pleasurable to read while preserving what the author means, the evidence behind it, and any deliberately distinctive voice. Reduce recognizable AI-writing mannerisms only where they interfere with that objective.

---

## 0. Read this first: ten decisions

1. **Slop is a defect in the reader's experience, not a claim about authorship.** Good AI-assisted writing and bad human writing are both possible. Optimize reader value, not undetectability.
2. **Use a three-part diagnostic model:** information utility, information quality, and style quality. These are related but not equivalent. [R01]
3. **Do not use a single binary “is slop?” score as the main control signal.** Expert agreement is limited, and the importance of each flaw differs by genre. [R01]
4. **Look at the whole document first.** An elegant sentence cannot rescue a document with no argument, no evidence, or a broken section sequence. [R04]
5. **Pass through document → targeted paragraphs → selected sentences/spans → revision verification.** Run the cheap deterministic checks before semantic evaluation and route only promising edits onward.
6. **Jev diagnoses; a separate generative editor revises.** TypeSafe explicitly positions Jev as a typed judgment model, not a prose generator. [R09–R11]
7. **Do not equate surface tell-removal with substantive improvement.** Removing em dashes, triads or vocabulary can camouflage text while preserving all its defects. Wikipedia warns of this, and SciSlopHarness demonstrates the problem for scientific work. [R04, R05]
8. **Any suggestion to add a fact requires evidence.** An absent example or an unsupported claim is a content-acquisition task, not permission for the editor to fabricate detail.
9. **Make no-edit a normal and desirable outcome.** Human preference is the ultimate validation; revision loops that must always make changes will overedit.
10. **Calibrate with real readers and their tasks.** The registry is a versioned hypothesis, not a set of universal thresholds; maintain genre, language and audience-specific evaluation sets.

## 1. What the evidence actually supports

### 1.1 Most directly relevant studies

| Source | What was done | Result relevant to this project | Important limitation |
|:--|:--|:--|:--|
| **Shaib et al., *Measuring AI “Slop” in Text*** [R01] | A qualitative taxonomy elicited from 19 experts; three annotators later assessed spans in news and QA texts. First published 2025, revised into 2026. | Relevance, information density, coherence and tone help account for negative slop judgments. The useful unit is often a **localized span**, not a document-wide origin label. | Overall binary slop agreement was poor to fair; genre influenced which attributes mattered. Prompted models struggled at exact span extraction. |
| **Chakrabarty et al., *Can AI Writing Be Salvaged?*** [R02] | 18 professional writers made 8,035 edits to 1,057 LLM-generated paragraphs; LAMP taxonomy. Updated March 2025. | Seven concrete editing defects: cliché, redundant exposition, purple prose, poor sentence structure, missing specificity, awkward wording, inconsistent tense. Paragraph-level editing is a practical unit. | Primarily literary fiction and creative nonfiction; not directly a technical-document scorecard. |
| **Chakrabarty et al., *AI-Slop to AI-Polish?*** [R03] | 4,729 comparative quality judgments in WQ Benchmark; trained WQ reward models. | Reported 74% WQ accuracy for their reward-model approach; 9 experienced writers preferred selected revisions **66%** of the time. Supports generating multiple candidate edits and selecting by reader value. | Dataset, model, and human-test conditions matter; a single WQ score does not prove usefulness or factuality. |
| **Oh et al., *Science or Slop?*** [R04] | 2026 preprint: 390 AI-generated research papers paired with accepted human papers; six cross-paper structural/argument/artifact measures; revision harness. | Six-measure aggregate achieved **85.9% pair accuracy** vs **68.7%** for Binoculars on its constructed pairs. Evidence-grounded repair reduced the remaining AI-human gap by **63%** over strongest revision baseline. Directly optimizing slop measures caused reward hacking. | As of 13 Oct 2026, a **preprint under review**, not an independently reproduced universal result. Benchmark pairing may partly capture quality differences, not pure authorship signals. Scientific-paper-only measures do not generalize unchanged to essays or blogs. |
| **Russell et al., ACL 2025** [R06] | Human readers judged 300 nonfiction articles and explained decisions. | Majority vote among five frequent LLM-writing users misclassified only **1 of 300** in that setup; their explanations cited style, originality, formality and clarity, not just word lists. | This is authorship detection under particular study conditions, **not** proof that all AI prose is bad or that typical readers spot it. |
| **Miletić & Falk, LREC 2026** [R07] | 37,000+ ACL papers examined diachronically; 3,000 human passages and LLM revisions; 20-expert reader pilot. | LLM-modified writing exhibited longer/more complex words, some recurring constructions, and lower lexical diversity. Experts often rated modified passages **more understandable and exciting**, despite negative qualitative attitudes toward AI. | Small subjective reader pilot, NLP-paper domain. Important **counterevidence** to the idea that recognizable AI style always makes reading worse. |
| **Bharadwaj et al., ICLR 2026** [R08] | Tested preference-model distortions around length, structure, jargon, sycophancy and vagueness with controlled pairs. | Models often overvalue the very features readers may dislike; biased preference judgments can reward verbosity and polished emptiness. | A study of preference-model judgments, not a direct measurement of this project's users. |

**Interpretation:** There is convergence on observable **defect families**, but not consensus on a universal “AI slop” metric. Some surface patterns make text recognizable, while other problems directly cost readers time or mislead them. Both matter, but they need separate treatment. This is the core inference from [R01–R08], not a direct result from one benchmark.

### 1.2 What the community has converged on

**Strongest recurring complaints (prioritize because they harm the reader):**

- **Low information density.** A long answer containing little information; expansive setup, recap, and platitudes instead of facts, reasoning or examples. [R01, R02, R08]
- **Irrelevance and scope drift.** Broad scene-setting or adjacent facts displace what the user actually needs. [R01]
- **Flat reasoning and missing links.** Claims appear credible individually but do not accumulate into an argument; citations are name-dropped, results never receive concrete examples, or sections are mechanically connected. [R04]
- **Genericity / missing specificity.** Repeated abstractions such as “innovation,” “impact,” and “transformation” where an actor, process, measurement, limitation or case would explain more. [R01, R02, R05]
- **Unwarranted certainty or significance.** Claims of being pivotal, revolutionary, inevitable, a testament to something, or emblematic of a grand trend without showing why. [R05]
- **Repetition and padding.** Multiple sentences or sections reformulate the same claim as though reformulation were evidence. [R01, R02, R04]
- **Inappropriate register.** Overly promotional, congratulatory, blandly positive, faux conversational, self-consciously profound, or oddly formal prose when the reader expects informed language. [R01, R05, R08]
- **Credibility defects.** Unsupported facts, invented or incorrectly attached citations, or a sheen of professionalism hiding a lack of evidentiary grounding. [R01, R04]

**Recognizable mannerisms, useful as weak diagnostic cues rather than prohibitions:**

- “Not just X, but Y” when there was never a real contrast; artificial binary oppositions.
- Unnecessary rule-of-three lists and identical section templates.
- Padded discourse connectors (“Furthermore,” “Moreover,” “In today’s rapidly evolving…”) where the relation is trivial or nonexistent.
- Participial interpretation tacked on after a factual statement (“highlighting,” “underscoring,” “showcasing”) without explaining a mechanism.
- Hype and staged profundity (“At its core…”, “a testament to…”, “a pivotal moment…”).
- Jargon substitutions for ordinary verbs (“serves as” vs “is” when no additional meaning is conveyed).
- Generic “Challenges and Future Prospects” endings, unnecessary summaries, and chatbot-style closings.
- Stock words, em dashes, boldface, title-case headings, emoji or bullet lists **only when overused or genre-inappropriate**.

These observations are most comprehensively collected in Wikipedia's community-maintained *Signs of AI writing* [R05] and the public *Humanizer* skill [R12]. Both are **field guides and engineering inspiration, not controlled evidence that any single pattern makes writing inferior**. Wikipedia explicitly warns against treating patterns as bans or simply making suspected AI text harder to detect.

### 1.3 The subjective experience to optimize

This subsection is a **proposed product interpretation** of the literature and community complaints, not a validated psychometric instrument. A reader tends to reject prose when it feels:

- **Wasteful:** too many tokens of attention for too little understanding.
- **Performative:** the writer repeatedly tells the reader how significant, nuanced or fascinating something is instead of demonstrating it.
- **Untrustworthy:** confidence, specificity or polish exceeds the evidence.
- **Interchangeable:** the same paragraphs could be pasted into almost any article without changing much.
- **Frictional:** transitions, formality, repetition and rhythm make the reader do unnecessary work.
- **Impersonal in the wrong way:** humor, edge, an actual position, dialect or intentional oddity has been sanded off.

But these are conditional. A legal memo, a lively essay, a scientific methods section and a joke have very different expectations. *Pleasant to read* does not mean casual, short, funny or full of personality in every genre. Nor is rich or repetitive writing necessarily bad: repetition, rhetorical questions and dramatic fragments can be artistically effective when earned.

### 1.4 What **not** to infer

- A word such as “delve” or punctuation such as an em dash **cannot establish AI authorship**, much less poor quality.
- “Human-like” is not the same as better. It can produce stereotypes of good human writing, erase non-native or dialectal voices, and game detectors.
- Readability indices, lexical diversity and other proxies can illuminate tendencies but do not measure factual correctness or reader utility.
- A polished rewrite can change a claim's epistemic strength by removing important qualifiers.
- A generative model saying “this is better” is not a substitute for blinded reader preference.

## 2. Requirements and non-goals

### Functional requirements

**FR-01.** Accept a document and its declared `purpose`, `genre`, `audience`, `language`, `author_voice`, `must_preserve`, and optionally `evidence`. When missing, keep the uncertainty explicit instead of silently inventing a target voice.

**FR-02.** Analyze at multiple granularities, with stable document, section, paragraph, sentence and source-span IDs and offsets. Each finding has a code, severity, supporting observed text, context and proposed type of action.

**FR-03.** Produce a prioritized edit plan, not just a score. It must distinguish **delete**, **merge**, **reorder**, **rewrite locally**, **research/ask for evidence**, **retain**, and **defer for human judgment**.

**FR-04.** Make limited, inspectable changes with a generative editor. Maintain a diff and an explicit `no_change` route.

**FR-05.** Verify both factual/semantic preservation and whether the target defect was actually repaired. Revert unsupported edits or escalate them.

**FR-06.** Support dry-run / audit-only mode and configurable genre/voice profiles. Do not edit literal code, URLs, factual numbers, citations or quoted material without explicit authorization.

**FR-07.** Log exact model identifier, question-registry version, state hash, selected questions, scores/distributions, decision thresholds, generator version, diff, source evidence and final accepted edits.

### Non-goals

- Detecting whether the original author used a model.
- Evading AI detectors or impersonating an unrelated author.
- Replacing fact-checking, reporting, original experiments or expert review.
- Making every text shorter, more colloquial or “punchier.”
- Automatically changing a technical document into a marketing article or vice versa.
- Treating a universal composite slop number as truth.

## 3. System architecture

```text
                   ORIGINAL TEXT + PURPOSE + AUDIENCE + EVIDENCE
                                      |
                           0. Parse and protect
                   text spans, sections, quote/code locks
                                      |
              +-----------------------+----------------------+
              |                                              |
   Deterministic signals                           Jev pass A: DOCUMENT
   repetitions, lengths,                         13 focused assessments
   structural indexes                            architecture/utility
              |                                              |
              +--------------------+-------------------------+
                                   |
                      Rule-based finding router
                 issues + confidence + genre + risk
                                   |
                      Jev pass B: PARAGRAPHS
                   17 questions on selected blocks
                    with neighboring context
                                   |
                  Cheap candidate span identification
                                   |
                      Jev pass C: SENTENCES
                  16 selective checks, NOT all sentences
                                   |
                      Prioritized edit instructions
                                   |
                     GENERATIVE EDITOR / RESEARCHER
                      minimal patch or add source data
                                   |
                    Deterministic factual diff checks
                                   |
                       Jev pass D: VERIFICATION
                          6 targeted judgments
                                   |
                      PASS / REVERT / ESCALATE
                                   |
                         HUMAN READER EVALUATION
```

### 3.1 TypeSafe/Jev integration constraints

The current TypeSafe skill [R09] and live documentation [R10–R11] describe three primitives:

- **`Score`** for an ordered, explicitly described spectrum. Its numeric `score` is the probability-weighted mean of level indices, **not** the probability that writing is bad. Use the full distribution and confidence when diagnosing ambiguity.
- **`Noul`** for a tightly specified yes/no condition. Its value is the probability of *yes*; a value around 0.5 reflects yes/no ambiguity, **not** “medium severity.”
- **`Choice`** for a closed set of alternatives. Include `none` or `unclear` whenever applicable. Use it to choose an action or compare revisions, not to extract unlimited passages.

Send independent questions over **one supplied state** in one request when efficient. Question IDs are application labels and do **not** carry semantic meaning to the model; every `instructions` field must stand alone. Use different states when the target focus or relevant context changes.

As of 2 October 2026, the Jev 1.13 jaggedness notes [R11] warn of literal readings, numerical weakness, indirection, irrelevant large state, order sensitivity and inability to generate text. Accordingly: **do arithmetic, diffing, citation bookkeeping, candidate finding and routing in code**; use Jev only for well-scoped semantic judgments. English is the best supported language [R10]; French and Spanish should be separate empirical validation slices rather than assumed equivalent.

### 3.2 State contracts

**Global document context** (provided once per evaluation state or in a compact summary):

```json
{
  "document": {
    "id": "doc-17", "language": "en", "genre": "technical_explanation",
    "purpose": "Explain an architectural tradeoff to experienced engineers",
    "audience": "Senior software engineers",
    "author_voice": "Specific, opinionated, direct; occasional dry humor",
    "text": "... full document for document-level calls ...",
    "summary": "... trusted section map / extracted claims ..."
  },
  "constraints": {
    "must_preserve": ["All source-backed numbers", "Author's stated conclusion"],
    "locked_spans": [{"start": 192, "end": 335, "kind": "quotation"}],
    "edit_permission": "meaning_preserving"
  },
  "evidence": [{"id": "src-1", "excerpt": "...", "uri": "..."}]
}
```

**Paragraph state** adds `focus` with `paragraph_id`, `text`, `section_goal` and `span_offsets`, plus `neighbors.previous`, `neighbors.next`, a concise preceding argument summary and **only the relevant evidence**. **Sentence state** includes the target sentence plus its paragraph and immediate neighboring sentences, and any matching lexical candidate signals. **Verification state** includes `{original, candidate, diff, finding, evidence, constraints}`. Avoid pushing complete source libraries into every call.

A Jev request looks like this (structural example; use official SDK types and current documentation):

```json
{
  "model": "jev-latest",
  "state": {
    "document": {"genre": "technical_explanation", "audience": "Engineers"},
    "focus": {"text": "The change marks a pivotal milestone in our journey toward innovation."}
  },
  "questions": {
    "S02": {
      "type": "noul",
      "instructions": "Does the sentence portray an ordinary fact or event as pivotal, profound, transformative, historic, or emblematic without supporting that significance?",
      "criteria": {
        "true": "Importance is asserted through sweeping significance language without specific warrant.",
        "false": "Significance is modest or grounded by relevant evidence in the context."
      }
    }
  }
}
```

**Important:** `jev-questions.json` is a **question design registry**, not an assertion that any untested score is calibrated. Create the API `questions` map by projecting each registry item to `{type, instructions, criteria}`; exclude metadata like `phase`, `priority`, `orientation` and `references`.

### 3.3 Routing logic

Use a transparent policy rather than asking the model to make the entire process opaque:

1. **Structural blockers outrank line polish.** If a section is irrelevant, repeated, or lacks the necessary evidence, do not spend calls polishing each of its sentences. Delete, merge, research or restructure first.
2. **Evaluate paragraphs selectively.** Route paragraphs with a negative document finding, deterministic repetition signal, voice-shift signal, or explicit human complaint. Sample a few apparently good paragraphs as controls.
3. **Evaluate sentences only after a plausible span has been nominated.** Deterministic phrases/structures can nominate candidates, but Jev decides whether they are contextually bad. No blanket replacements.
4. **Do not conflate evaluation and editing.** Jev returns structured judgments; code constructs a patch instruction grounded in the finding; the writer model proposes the patch.
5. **Risk-sensitive verification.** Every candidate patch passes source/claim-preservation checks (V01–V04), not merely stylistic improvement. Contradictions or uncertainties cause revert/review, not ungrounded acceptance.
6. **Retain raw answers.** Thresholds and weights are code configuration trained on the user's evaluation data. Do not invent a “0.7 = bad” convention in the API integration.

For a first implementation use **at most two edit rounds** as a configurable limit (engineering proposal, **not** a research-derived optimum). After each round, rerun only affected paragraphs, plus a final document-level regression scan for structural damage. Stop early if the editor makes no authorized improvement.

## 4. Four-pass protocol

### Pass A — Document architecture and reader utility

**Input:** complete text when it fits a reliable context, section map, declared audience, purpose, source/evidence summary. For long texts, use hierarchical section summaries plus direct excerpts; avoid assuming a model understood material omitted from its state.

**Questions:** `D01–D13` (13). Look for unclear purpose, flat argument progression, section-level redundancy, off-topic material, ungrounded central claims, unwarranted significance, generic synthesis, forced symmetry, weak beginnings and endings.

**Output:** an ordered map of structural interventions, each tied to section IDs and specific text. A `D02` issue should produce an instruction like “move Section 4 before Section 3 because the former defines the premise,” **only if code/human analysis has identified these sections**. Jev alone is not a free-form plan generator.

**Handoff:** If document-level purpose or evidence is genuinely missing, request author input or route to research, rather than polishing sentences to conceal the problem.

### Pass B — Targeted paragraph review

**Input:** paragraph, neighboring paragraphs, section purpose, preceding argument state, genre and source snippets.

**Questions:** `P01–P17` (17). Especially important: local relevance, information added versus repetition, paragraph role, missing specificity, unsubstantiated claims and causal steps, unwarranted transitions and tone.

**Output:** one of `{keep, delete, merge, move, rewrite, needs_evidence, human_review}` plus a structured finding: location, dimension, issue statement, original passage, cited evidence and intended repair. Do not feed all 17 questions to every paragraph by default; select by issue family. A negative Noul or poor Score on an unrelated dimension is noise.

**Handoff:** Each paragraph rewrite instruction names **what information must remain** and the exact defect to remove. Prefer edits that preserve the author's original sentence whenever a surgical deletion suffices.

### Pass C — Sentence and selected-span diagnostics

**Input:** candidate sentence/span, whole paragraph, adjacent sentences, audience profile and any lexical prefilter signal. The candidate generator identifies *possible* defects with deterministic heuristics; it does not declare them present.

**Questions:** `S01–S16` (16). Use Nouls for precise patterns: unsupported significance inflation, marketing diction, false contrasts, forced triads, vague attributions, hollow “-ing” analyses, excess jargon, obscure agents, stacked qualifiers, purple prose, and staged drama.

**Output:** edit or preserve. Do not replace a phrase merely because it appears in the wiki catalog. For instance, a genuine comparison between alternatives **should** retain “rather than.” A purposeful triple cadence in a speech should remain. Punctuation is not a defect absent a contextual readability problem.

**Handoff:** Provide only the defect and local constraints to the editor. The goal is a local improvement, not a wholesale tone reset.

### Pass D — Verification and preservation

**Input:** original paragraph/document, candidate, actual patch/diff, author's constraints, relevant sources, target finding.

**Questions:** `V01–V06` (6). Detect unsupported new details, changed meaning, broken citations, loss of distinctive voice, whether the revision improves the reading experience, and whether the original issue survived.

**Output:** `{accept, revert, escalate}` with explicit reasons. If a fact cannot be adjudicated from supplied sources, mark it **unverified** and escalate. Even a confident Jev Noul is not a fact-checker when the needed evidence is not in the state. Consider automated diff guards for numeric literals, URLs, named entities, citations, quotations, and protected sections before calling Jev.

**Handoff:** Accept only changes with demonstrated, task-relevant benefit and no blocking source/meaning issue. A style-only improvement is not enough to override a failure in V01–V04.

## 5. Defect taxonomy and recommended action

| Family | Examples of signals | Dominant pass | Preferred action |
|:--|:--|:--|:--|
| Content-free padding | Recaps, announced insights, repeated definitions | A/B | Delete or condense |
| Broken argumentative structure | Claims disconnected from premises; sections not building | A/B | Reorder or supply missing argument/evidence |
| Unsupported source claims | Unnamed experts, fake specificity, unattached citations | A/B/D | Verify/research/revert; never invent |
| Scope drift | Broad tangents replacing the intended answer | A/B | Remove or relocate |
| Redundant paragraphs | Paraphrases of earlier sections | A/B | Merge/delete, retain unique evidence |
| Formulaic prose | Triads, fake contrasts, generic conclusions | B/C | Edit only when weak or unnecessary |
| Register mismatch | Marketing voice in scientific text; corporate optimism in a postmortem | A/B/C | Tone-correct without erasing stance |
| Purpleness/awkward style | Stock metaphors, forced rhythm, poor referents | B/C | Replace locally with precise phrasing |
| Overclaiming | Big significance or causal claims unsupported by records | A/B/C | Qualify or attach authentic evidence |
| Authorship/style drift | Intentional opinions, humor, dialect removed | D | Revert or ask the author |

**Prioritization heuristic (proposal):** `risk_of_misleading > lost_reader_value > structural_frustration > signature_mannerisms`. This ordering is for action planning, not an empirically determined universal weight vector. A damaging factual distortion must block the edit even if the overall average score improves.

## 6. Examples for acceptance tests

All examples below are **synthetic examples authored for this specification**; they are not quotations from the cited papers.

### Example A: recognizable slop and actual value

**Input:** “The caching initiative marks a pivotal milestone in our ongoing journey toward unprecedented speed, scalability, and operational excellence. In fact, it reduced p95 latency from 450 ms to 220 ms.”

**Candidate:** “The cache reduced p95 latency from 450 ms to 220 ms.”

**Expected diagnostics:** S02=yes (unjustified significance), P06≥1 (padding), S06 may be yes only if the triad is unneeded. V01=no; V02=no if this was merely a technical status update. **Pass**: preserve the numbers; avoid replacing them with generic claims about improved performance.

### Example B: missing evidence is not an invitation to hallucinate

**Input:** “Industry experts widely agree that the system has transformed developer productivity.”

**Proposed response:** Flag `P05`/`S07`. Ask for named data or documented expert claims; otherwise remove the sentence or label it explicitly as an unverified opinion. **Fail**: changing it to “A 2026 study found a 38% increase in productivity” without any such source.

### Example C: false contrasts are conditional

**Flag:** “It is not merely a tool; it is a revolution.” This asserts a false dramatic escalation.  
**Do not flag solely for grammar:** “For this workload, the batch API reduces cost rather than latency.” This is a real operational distinction.

### Example D: no-edit control

**Input:** “The cache is cold after a deploy. The first requests still hit the database, so the improvement appears after warm-up.”

**Expected behavior:** Retain as written unless surrounding evidence contradicts it or the stated voice calls for a change. An aggressive rewrite such as “A robust warm-up strategy is critical for optimizing scalability” is a regression.

### Example E: distinctive literary rhythm

**Input:** “He waited. Then he waited some more. Nobody came.”

**Expected behavior:** Preserve if the passage intentionally conveys time and disappointment. A regex ban on repetition or fragments would make this worse.

### Example F: research-paper structural defect

**Input:** Method section promises an evaluation, Results section only gives a headline percentage, and none of the supplied records describe a representative case.

**Expected behavior:** `D06`, `D07`, `P04` surface a missing evidence/example need. The editor requests or uses actual experiment records; it does not generate plausible-looking examples. This is the part of SciSlopHarness [R04] most worth adapting beyond scientific papers.

## 7. Scoring, calibration and decision policy

### 7.1 Do not start with a magic composite

Recommended internal representation:

```typescript
type Finding = {
  id: string;
  documentId: string;
  focusSpan: {start: number; end: number};
  questionId: string;
  questionRegistryVersion: string;
  answer: {type: "score" | "noul" | "choice"; raw: unknown};
  evidenceSpans: Array<{start: number; end: number; sourceId?: string}>;
  category: "utility" | "quality" | "style" | "preservation";
  action: "keep" | "delete" | "merge" | "move" | "rewrite" | "research" | "review";
  status: "candidate" | "verified" | "rejected" | "unverified";
};
```

For **Score**, compare `score/(levels.length - 1)` only within matched dimension and prompt version; also retain `probabilities` and `confidence`. For **Noul**, threshold its explicit yes-probability only after labeled calibration. For **Choice**, preserve option probabilities and an `unclear` outcome. Question-level outputs are **features**, not calibrated probabilities of reader dissatisfaction unless empirically shown to be so.

Use block rules for preservation: `(V01 || V02 || V03 || V04)` when high-confidence and supported by evidence ⇒ **revert/escalate**, never average away in a utility composite. If the evidence needed for a gate is absent, the correct result is **needs source review**, not “safe.”

### 7.2 Example *experimental* policy

```text
if deterministic_diff_breaks_locked_span:
    REVERT
elif important_source_fact_change and insufficient_evidence:
    ESCALATE_FOR_FACT_CHECK
elif important_structural_finding:
    RESTRUCTURE_OR_RESEARCH_BEFORE_LINE_EDIT
elif candidate_improves_blinded_reader_quality and no_blocking_gate:
    ACCEPT
elif no_material_change OR feedback_uncertain:
    KEEP_ORIGINAL
else:
    HUMAN_REVIEW
```

Treat these as logic placeholders, not a specification of deployed thresholds. Define separate **severity** and **confidence** fields in code, keep the original text as a competing candidate, and make false positives observable.

### 7.3 Source integrity

Maintain a `claim_manifest`: important claims, qualifiers, numbers, named entities and associated evidence IDs before and after editing. Use deterministic literal comparisons first, then semantic assessment on affected claims. Validate URLs and citation references separately. Numbers can change harmlessly in formatting (“450ms” → “450 ms”), so diffing requires normalization and context rather than naïve byte equality. Conversely, syntactically similar sentences can alter scope or certainty considerably.

## 8. Evaluation program

**North-star metric:** On blind A/B comparisons, does the intended reader prefer the revised text **for its usefulness and reading experience** without an unacceptable factual or voice regression? This must be measured independently of Jev and the generator.

### 8.1 Build the initial dataset

Suggested **minimum viable dataset**: around **150 English texts** distributed among five genres: technical explanations, long-form essays/blogs, business communications, research-style prose, and personal/creative material (30 per genre). Mix AI-generated, human-authored and human/AI-edited material to avoid learning “AI = bad.” Include both naturally good and intentionally bad specimens and source-grounded examples. Hold out authors, topics and generators across calibration and test; retain real source records when available.

Create smaller French and Spanish **exploratory** sets before claiming language support. Use explicit voice samples for some test cases. Annotate at both document and span levels: reader relevance, density/padding, evidence/certainty, coherence, tone, originality of explanation, and value of retained voice. Include `no_problem` labels.

### 8.2 Human labeling protocol

- At least two independent readers per item where resources permit, preferably domain-matched for technical claims; adjudicate disagreement instead of forcing consensus.
- Run **blind pairwise preferences** (`original` versus `revised`, randomized order), with separate questions for *more useful*, *more pleasant*, *more trustworthy*, and *more faithful to author*.
- Add an “equivalent” outcome so models are not rewarded for pointless changes. Track annotator confidence and disagreement as informative outputs.
- Evaluate understanding with targeted questions about the text when practical, not only impressions of style. Preserve true/false verification tests where source records exist.
- Maintain a separate “AI-sounding” label, **not** part of the primary quality score. Show explicitly when the two goals diverge.

### 8.3 Baselines and ablations

Compare (1) original/no-change, (2) a single general “make it better” rewrite, (3) deterministic cue removal, (4) a community humanizer skill such as [R12], (5) full Jev+editor pipeline, (6) pipeline without document pass, (7) pipeline without verification, (8) paragraph-only pipeline. Match generator and editing budget where possible. The point is to establish whether Jev adds value beyond an expensive prompt and whether multi-pass routing is worth its complexity.

Measure: pairwise reader win/tie/loss by genre, claim-preservation failure rate, false-positive edit rate on already good prose, evidence-needed escalations, changed content fraction, average edits per document, latency, API cost, and inter-annotator agreement. Use confidence intervals rather than overinterpreting small score changes. Record distribution shift and degradation after model upgrades.

### 8.4 Red-team / adversarial tests

- A beautiful passage that intentionally uses em dashes, triads, second-person and fragments.
- A human writer using unusual but legitimate English, technical jargon, Spanish/French idiom, or a personal style sample.
- A long, error-free but content-free article that never uses stereotypical AI vocabulary.
- A document with concrete but **fabricated** metrics and citations.
- A text whose conclusion depends on hedges (“might”, “only under condition X”) that an editor is tempted to simplify away.
- A source that contradicts a claim in the draft; the pipeline must flag the discrepancy instead of smoothing it over.
- A concise, unusually opinionated document that is well supported and should remain opinionated.
- A high-level product spec where repetitive field names and parallel headings are a genuine utility feature.

### 8.5 Launch criteria (to be set with real data)

No unreviewed fabrication of facts, references or results in the gold verification set; strong preservation of author-specified style; consistent positive preference against the original and against a strong single-pass generative baseline; and acceptably low intervention on gold “already good” passages. Numerical release thresholds should be chosen *after* a pilot, not copied from unrelated papers.

## 9. Implementation backlog

### P0 — Build a safe evaluator before an editor

1. Parser with stable span IDs, context windows, protected-span handling and source manifest.
2. Registry loader with schema validation, versioning, question selection and fully typed Jev response handling.
3. Document and paragraph passes; capture structured findings and a dry-run report.
4. Deterministic candidate signals (with false-positive protections) and a small sentence pass.
5. Gold evaluation set with no-edit examples and calibration harness.
6. Minimal editor integration that produces a patch rather than regenerating everything.
7. Diff, grounding, meaning-preservation and citation/voice verification; transactional accept/revert.

### P1 — Make it genuinely better than generic rewriting

8. Hierarchical long-document analysis with source-aware claim maps and section interactions.
9. Genre/style profiles, author-supplied voice samples, preservation preferences.
10. Multiple generator candidates and independent preference-based selection; keep original as candidate.
11. Reader-study A/B infrastructure and ablations; budget/latency telemetry.
12. Calibrate routing and severity per genre with versioned thresholds.

### P2 — Research directions

13. Learned defect routing (e.g., combine Jev outputs + deterministic signals in a supervised model).
14. Better provenance/evidence linking, retrieval-assisted “needs more substance” remediation.
15. French/Spanish-specific cue discovery and genre-specific prompt profiles.
16. Explore training a quality ranker on human pairwise preferences, while auditing for the verbosity/style reward hacks found in [R08].

### Verification checkpoints

- **Checkpoint 0:** Registry loads and each item is a valid `noul`, `score` or `choice` question; invalid state, missing evidence and service failures are explicitly handled.
- **Checkpoint 1:** 20 hand-designed cases, including no-edit and adversarial prose, produce findings with quoted focus locations and no fabricated details.
- **Checkpoint 2:** Editing only changes approved spans; a failed gate reverts patches exactly.
- **Checkpoint 3:** Human preference and meaning-preservation study, split by genre, beats the single-pass baseline while retaining author voice.
- **Checkpoint 4:** Regression suite reruns when the Jev alias, generator, criteria, or routing policy changes.

## 10. Open implementation questions

These should be resolved by experiments or product defaults, **not** treated as missing prerequisites to start building:

1. **Input length:** At what point is a section-summary pass reliable, and when must raw document sections be rescored directly?
2. **Evidence contract:** Will the system receive user-provided source material, perform retrieval, or only identify missing support?
3. **Authorial control:** Which fields are locked and which edits may be semantically substantive? Can the author select “voice-sensitive,” “technical plain,” or “stylistic polish only”?
4. **Audience choice:** Who is the actual preference population — experienced engineers, casual readers, editors, scientific reviewers — and does a “good” result vary by category?
5. **Score calibration:** Which question dimensions are worth deploying given measured precision, review cost and false-positive rate?
6. **False-positives:** How do we stop the detector from punishing unusual but intentional prose, non-native English, or genre conventions?
7. **Boundary between Jev and code:** Can cheap deterministic checks replace Jev on some high-precision surface patterns? Does Jev provide useful semantic disambiguation on false contrasts and genericity?
8. **Verification independence:** Is using the same model family for judging and rewriting a source of systematic blind spots? Should high-risk changes be human-reviewed?
9. **Long-term drift:** How often should the pattern catalog change as generative models and social conventions change?
10. **Meaningful success:** Does lower “AI-likeness” ever make text **less** helpful? The product must show the full tradeoff instead of hiding it.

## 11. Handoff prompt for the implementation agent

> Implement a `system-one-deslop` evaluator/editor using this dossier and `jev-questions.json` as the product specification. Follow TypeSafe's live skill and API docs for the current SDK; do not assume a fixed Jev model version or hardcode speculative thresholds. Build a read-only diagnostic mode first. The core pipeline is parse/protect → document review → targeted paragraph review → selected sentence diagnostics → minimal editor patch → source/meaning/voice verification → accept/revert. Keep the original text intact by default. Every finding must name its question ID, span, observed defect, and authorized action. Never infer that the absence of a citation authorizes invented evidence; route to research/author. Provide a fixture-based test harness covering false positives, good prose, technical jargon, quotations and meaning-changing rewrites. Produce evaluation measurements for the new pipeline against no-change and single-pass generative baselines; do not claim improved writing quality until tested with blinded human readers.

---

## 12. References and projects

**[R01]** Chantal Shaib, Tuhin Chakrabarty, Diego Garcia-Olano, Byron C. Wallace. *Measuring AI “Slop” in Text*. First submitted September 2025; 2026 revision. [Paper](https://arxiv.org/abs/2509.19163) · [Annotations/code](https://github.com/cshaib/slop). Evidence: expert-derived taxonomy, annotation disagreement, genre differences, span-detection difficulty.

**[R02]** Tuhin Chakrabarty, Philippe Laban, Chien-Sheng Wu. *Can AI Writing Be Salvaged? Mitigating Idiosyncrasies and Improving Human-AI Alignment in the Writing Process through Edits*. 2024 preprint, revised March 2025. [HTML paper](https://arxiv.org/html/2409.14509) · [LAMP materials](https://github.com/salesforce/creativity_eval/tree/main/Writing_Alignment). Evidence: seven editing defect classes; professional edits; value of paragraph-local revision.

**[R03]** Chakrabarty, Laban and Wu. *AI-Slop to AI-Polish? Aligning Language Models through Edit-Based Writing Rewards and Test-time Computation*. 2025. [Paper](https://arxiv.org/abs/2504.07532). Evidence: WQ benchmark and reward-model-selected edits, with experienced-writer preference evaluation.

**[R04]** Yerim Oh, Young-Jun Lee, Jaewoo Ahn, Gunhee Kim, Dongyeop Kang. *Science or Slop?: Benchmarking and Mitigating Scientific Slop in AI-Generated Papers*. Posted 30 September 2026, arXiv 2610.00531; preprint. [Paper](https://arxiv.org/abs/2610.00531) · [SciSlopBench + SciSlopHarness](https://github.com/yerimoh/ScientificSlop). Evidence: six cross-paper defects; evidence-grounded local revision; direct metric gaming caveat.

**[R05]** Wikipedia / WikiProject AI Cleanup. *Signs of AI writing*, community advice page, checked 13 October 2026. [Living pattern catalogue](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). Evidence: qualitative field guide only, with explicit cautions that patterns are not proof of origin or standalone errors.

**[R06]** Jenna Russell, Marzena Karpinska, Mohit Iyyer. *People who frequently use ChatGPT for writing tasks are accurate and robust detectors of AI-generated text*. ACL 2025. [Paper](https://aclanthology.org/2025.acl-long.267/) · [Human detector dataset](https://github.com/jenna-russell/human_detectors). Evidence: the kinds of cues experienced readers identify; provenance detection, not a universal writing-quality scale.

**[R07]** Filip Miletić and Neele Falk. *What Are LLMs Doing to Scientific Communication? Measuring Changes in Writing Practices and Reading Experience*. LREC 2026. [Paper](https://aclanthology.org/2026.lrec-1.142/). Evidence: stylistic changes and mixed expert reader judgments.

**[R08]** Anirudh Bharadwaj, Chaitanya Malaviya, Nitish Joshi, Mark Yatskar. *Flattery, Fluff, and Fog: Diagnosing and Mitigating Idiosyncratic Biases in Preference Models*. ICLR 2026. [Proceedings](https://proceedings.iclr.cc/paper_files/paper/2026/hash/2096bafd3073a2224f6f0adb594068df-Abstract-Conference.html) · [Code](https://github.com/anirudhb123/preference-model-biases). Evidence: reward-model attraction to superficial features.

**[R09]** TypeSafe. *Build with TypeSafe* — official agent skill. [SKILL.md](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md).

**[R10]** TypeSafe. Official [Documentation index](https://docs.typesafe.ai/llms.txt), [state](https://docs.typesafe.ai/concepts/state), [Score](https://docs.typesafe.ai/primitives/score), [Noul](https://docs.typesafe.ai/primitives/noul), [Choice](https://docs.typesafe.ai/primitives/choice), [API](https://docs.typesafe.ai/api). Checked 13 October 2026.

**[R11]** TypeSafe. [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13), last reviewed 2 October 2026. Integration caveats and known model limitations.

**[R12]** blader. [Humanizer agent skill](https://github.com/blader/humanizer). Community implementation of a Wikipedia-derived anti-AI-mannerism pass; a competing baseline, not evidence of measured preference improvements on our target corpus.

---

# Appendix A — Complete Jev question registry

The following is a human-readable reproduction of the accompanying JSON registry. **Use the JSON as the single source of truth for implementation.** The design includes 13 document questions, 17 paragraph questions, 16 sentence questions, and 6 verification questions. Every question has a model-visible instruction and concrete criteria. All issue-oriented questions use **more problematic = higher Score / higher Noul yes-probability**. No default numeric action thresholds are specified.


## Document pass

### D01 — Purpose clarity (`score`)

**Instructions:** Does `document.text` make its intended question, claim, or practical purpose clear to `document.audience`?

- **Level 0:** The reader can identify the main purpose without reconstructing it from hints.
- **Level 1:** A purpose is discernible but buried under preamble or competing aims.
- **Level 2:** After reading the document the central point or reader task remains unclear.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R02.

### D02 — Argument progression (`score`)

**Instructions:** Do the document sections build an intelligible progression toward its intended conclusion or outcome?

- **Level 0:** Each major section advances the topic in a logical order.
- **Level 1:** Most sections connect, but some appear interchangeable or out of order.
- **Level 2:** Sections read as disconnected units or repeated resets without an accumulating argument.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

### D03 — Cross-section redundancy (`score`)

**Instructions:** How much do later sections restate points already made without adding a new implication, example, or distinction?

- **Level 0:** Later sections contribute distinct information or analysis.
- **Level 1:** One or two sections repeat earlier material with little development.
- **Level 2:** Multiple sections largely restate one another, occupying substantial space without progress.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

### D04 — Information value (`score`)

**Instructions:** Relative to length and audience, how much of the document is occupied by generic sentences rather than useful distinctions, evidence, or actionable information?

- **Level 0:** Most space conveys audience-relevant substance at an appropriate level of detail.
- **Level 1:** Several stretches are low-content but meaningful material remains dominant.
- **Level 2:** Generic exposition consumes much of the document and concrete information is hard to find.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R08.

### D05 — Reader relevance (`score`)

**Instructions:** How much of the document addresses peripheral topics rather than what `document.audience` needs for `document.purpose`?

- **Level 0:** Material is relevant and necessary for the stated reader and purpose.
- **Level 1:** Some digressions are weakly related or overexplained.
- **Level 2:** Long detours or broad background dominate over the purpose and audience needs.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01.

### D06 — Concrete grounding (`score`)

**Instructions:** Does the document make claims or recommendations without enough inspectable examples, mechanisms, measurements, or source support for its genre?

- **Level 0:** Core claims have the genre-appropriate supporting detail available in `document.evidence` or text.
- **Level 1:** Important claims are supported, but some key parts remain generic or underillustrated.
- **Level 2:** The central argument relies on abstractions and assertions with little checkable detail.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

### D07 — Claim-to-evidence continuity (`score`)

**Instructions:** When the document introduces an important conclusion, is the supporting evidence or reasoning linked to it in the text?

- **Level 0:** Readers can trace major conclusions to specific premises, examples, or records.
- **Level 1:** Some connections exist but several central claims are underexplained.
- **Level 2:** Major conclusions appear without visible inferential support or citations are merely decorative.

**Priority:** high. **Applicability:** general. **Evidence basis:** R04.

### D08 — Overclaiming (`score`)

**Instructions:** Does the document assert broader significance or stronger certainty than its own evidence warrants?

- **Level 0:** Importance and certainty remain proportional to evidence and scope.
- **Level 1:** A few conclusions overreach or use unsupported significance claims.
- **Level 2:** Broad transformations, inevitabilities, or strong outcomes are repeatedly asserted without warrant.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04, R05.

### D09 — Voice consistency (`score`)

**Instructions:** Does the voice change between incompatible registers without an audience- or genre-related reason?

- **Level 0:** Register and point of view fit the purpose and shifts are intentional.
- **Level 1:** Occasional abrupt shifts in formality, personality, or point of view.
- **Level 2:** The document alternates between incompatible voices in a way that obstructs reading.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R01, R02.

### D10 — Generic synthesis (`score`)

**Instructions:** Does the document merely summarize commonplace observations without adding a useful distinction, synthesis, test, implication, or non-obvious connection?

- **Level 0:** The document contributes a clear reader benefit beyond a generic topical survey.
- **Level 1:** Some genuinely useful ideas are present among familiar, unelaborated statements.
- **Level 2:** Nearly every major point is common knowledge or generic framing with no new reader utility.

**Priority:** high. **Applicability:** argumentative, explanatory, opinion, research. **Evidence basis:** R01, R03.

### D11 — Opening efficiency (`score`)

**Instructions:** Does the opening delay its actual point through grandiose scene-setting, self-referential setup, or general truths?

- **Level 0:** The opening quickly establishes the topic, stakes, or useful question.
- **Level 1:** A short expendable preamble delays the useful material.
- **Level 2:** Multiple opening paragraphs announce relevance or intentions without getting to the point.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R02, R05.

### D12 — Ending value (`score`)

**Instructions:** Does the conclusion merely repeat earlier points or offer a broad inspirational ending instead of completing the reader task?

- **Level 0:** The ending resolves the argument or provides a concrete next implication appropriate to the genre.
- **Level 1:** The ending partly recaps but includes at least one real synthesis or action.
- **Level 2:** The ending is mostly empty optimism, a generic summary, or a chatbot offer to continue.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R01, R05.

### D13 — Template domination (`score`)

**Instructions:** Does repeated heading/list/three-part organization impose an artificial symmetry that undermines the material?

- **Level 0:** Form follows the amount and relationships of actual content.
- **Level 1:** Some sections are shoehorned into parallel formats or unnecessary lists.
- **Level 2:** Nearly everything uses identical formats regardless of purpose, flattening distinctions.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05, R07.


## Paragraph pass

### P01 — Paragraph purpose (`score`)

**Instructions:** Does `focus.text` contain unrelated claims or moves that prevent the paragraph from serving a coherent rhetorical purpose?

- **Level 0:** The paragraph has a coherent local function even if it contains multiple sentences or ideas.
- **Level 1:** One subordinate idea distracts from an otherwise clear function.
- **Level 2:** Several unrelated claims or rhetorical moves compete without connective logic.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R01, R02.

### P02 — New information (`score`)

**Instructions:** Relative to `neighbors.previous` and `document.summary`, is this paragraph mostly a restatement of points already made?

- **Level 0:** It advances the text with a new claim, detail, distinction, or necessary synthesis.
- **Level 1:** It repeats a familiar idea but supplies some useful added information.
- **Level 2:** It almost entirely rephrases earlier content without adding value.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

### P03 — Local relevance (`score`)

**Instructions:** Does this paragraph fail to help the nearby section deliver its stated purpose for the intended audience?

- **Level 0:** Every part directly contributes or is a clearly useful aside.
- **Level 1:** Some sentences are tangential to the section goal.
- **Level 2:** The whole paragraph is largely unrelated to the nearby claim or reader task.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01.

### P04 — Specificity gap (`score`)

**Instructions:** Does the paragraph make an explanation or assertion that needs a concrete example, actor, mechanism, or limit to be useful?

- **Level 0:** The level of specificity is sufficient for its function and genre.
- **Level 1:** A useful detail is missing from one central statement.
- **Level 2:** Most claims remain abstract even where a concrete mechanism or example is necessary.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R02.

### P05 — Evidence gap (`score`)

**Instructions:** Does the paragraph contain checkable claims that are unsupported by the provided sources or neighboring argument?

- **Level 0:** Checkable claims have identifiable support in the supplied records or are clearly qualified.
- **Level 1:** A secondary factual or causal claim lacks identifiable support.
- **Level 2:** One or more central factual claims lack support despite the passage treating them as established.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

### P06 — Padding (`score`)

**Instructions:** Does the paragraph use sentences that explain the obvious, announce what it will say, or restate its own point?

- **Level 0:** Sentences make distinct necessary contributions.
- **Level 1:** One sentence could disappear with no meaningful loss.
- **Level 2:** Much of the paragraph could be cut without losing any claim or necessary nuance.

**Priority:** high. **Applicability:** general. **Evidence basis:** R02, R08.

### P07 — Internal repetition (`score`)

**Instructions:** Does the paragraph repeat information, imagery, or phrasing without a deliberate rhetorical reason?

- **Level 0:** Repetition is absent or deliberate and effective.
- **Level 1:** A phrase or claim recurs without sufficient payoff.
- **Level 2:** Several sentences say effectively the same thing or mechanically echo one another.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R01, R02.

### P08 — Unjustified transition (`score`)

**Instructions:** Does the paragraph use a connective phrase suggesting contrast, causality, sequence, or summary that the adjacent content does not warrant?

- **Level 0:** Connective language accurately reflects the relation between adjacent ideas.
- **Level 1:** One transition is weak or ornamental but recoverable.
- **Level 2:** One or more transitions imply a relationship that is missing or misleading.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R01, R05.

### P09 — Coherence break (`score`)

**Instructions:** Are the internal sentences ordered so poorly that the reader must infer missing steps to understand the paragraph?

- **Level 0:** Sentences connect and advance intelligibly.
- **Level 1:** One inferential link or ordering decision is awkward.
- **Level 2:** The reader cannot follow the claim-development sequence without supplying major missing steps.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

### P10 — Register mismatch (`score`)

**Instructions:** Is the paragraph’s register too promotional, didactic, formal, breezy, or excited for its audience and surrounding text?

- **Level 0:** Tone matches reader, stakes, and neighboring prose.
- **Level 1:** One or two expressions jar against the intended register.
- **Level 2:** The tone substantially undermines credibility or reader fit.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R01, R05, R07.

### P11 — Missing agent or mechanism (`score`)

**Instructions:** When actions or decisions matter, does the paragraph obscure who acted or how an outcome occurred?

- **Level 0:** Actors and mechanisms are clear where they affect meaning.
- **Level 1:** One central action is expressed vaguely or agentlessly.
- **Level 2:** Important events are recited without enough agency or mechanism to be informative.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R02, R05.

### P12 — Causal handwaving (`score`)

**Instructions:** Does the paragraph claim that one thing causes, enables, transforms, or demonstrates another without explaining the connection?

- **Level 0:** Causal links are explained or appropriately qualified.
- **Level 1:** A causal link is plausible but underdeveloped.
- **Level 2:** The main argument depends on an unsupported or circular causal connection.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

### P13 — Formulaic rhetorical pattern (`score`)

**Instructions:** Does the paragraph rely on repeated contrasts, parallel clauses, or triads when the rhetorical structure adds no clarity?

- **Level 0:** Rhetorical structure serves an identifiable purpose.
- **Level 1:** One patterned device sounds mechanical or redundant.
- **Level 2:** Several patterned devices make the paragraph sound engineered rather than meaning-led.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05, R06.

### P14 — Unnecessary hedging (`score`)

**Instructions:** Does the paragraph hedge statements repeatedly despite their being supported or directly observable?

- **Level 0:** Qualifications accurately express uncertainty.
- **Level 1:** Some qualifying words weaken claims without clarifying uncertainty.
- **Level 2:** The main point is obscured by stacked or contradictory caveats.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05, R08.

### P15 — Unwarranted certainty (`score`)

**Instructions:** Does the paragraph use categorical or confident statements where the supplied evidence is limited or mixed?

- **Level 0:** The degree of certainty matches the evidence.
- **Level 1:** One categorical statement needs scope or qualification.
- **Level 2:** Central claims are treated as settled despite material evidence limitations.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

### P16 — Cliché saturation (`score`)

**Instructions:** Does the paragraph depend on conventional imagery or generic aphorisms in place of actual description or reasoning?

- **Level 0:** Figurative wording is purposeful, distinctive, and suitable for the genre.
- **Level 1:** One familiar metaphor or aphorism contributes little.
- **Level 2:** The paragraph repeatedly substitutes stock imagery or slogans for substance.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R02, R05.

### P17 — Value of paragraph as a unit (`score`)

**Instructions:** If this paragraph were removed, would the reader lose no necessary fact, argument step, example, or deliberate pacing effect?

- **Level 0:** Removing the paragraph would remove meaningful content or necessary pacing.
- **Level 1:** Most could be removed, but a useful sentence would need relocation.
- **Level 2:** The entire paragraph contributes no indispensable information or justified stylistic function.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.


## Sentence pass

### S01 — Empty content (`noul`)

**Instructions:** Does `focus.text` communicate no distinct claim, example, necessary transition, or meaningful stylistic effect in its context?

- **Yes:** The sentence can be deleted without reducing reader understanding or intended effect.
- **No:** It adds a distinct point or has a clear rhetorical function.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R02.

### S02 — Inflated significance (`noul`)

**Instructions:** Does the sentence portray an ordinary fact or event as pivotal, profound, transformative, historic, or emblematic without supporting that significance?

- **Yes:** Importance is asserted through sweeping significance language without specific warrant.
- **No:** Significance is modest or grounded by relevant evidence in the context.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05, R01.

### S03 — Promotional diction (`noul`)

**Instructions:** Does the sentence use advertising-style praise or hype in a context that calls for explanation or analysis?

- **Yes:** Praise replaces informative description, or adopts a marketing register against the genre.
- **No:** Positive wording is factual, attributed, or appropriate to the intended genre.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05, R08.

### S04 — Stock AI diction used unnaturally (`noul`)

**Instructions:** Is the sentence’s vocabulary noticeably prefabricated or inflated for this topic and audience, rather than the clearest available wording?

- **Yes:** The wording is needlessly ornamental, buzzword-heavy, or conspicuously formulaic.
- **No:** The vocabulary is natural and precise, even if it contains a word sometimes associated with AI text.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05, R06, R07.

### S05 — Unmotivated false contrast (`noul`)

**Instructions:** Does the sentence use a "not just X but Y" or "rather than X, Y" construction without a real contrast that matters to the argument?

- **Yes:** The contrast is invented, trivial, or merely increases dramatic emphasis.
- **No:** The contrast distinguishes genuinely competing ideas or corrects a likely misconception.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05.

### S06 — Forced triad (`noul`)

**Instructions:** Does a three-item list or three-part rhythm contain filler added to reach a neat trio?

- **Yes:** One of the three elements adds nothing, duplicates another, or is included only for symmetry.
- **No:** Each element is necessary and meaningfully distinct, regardless of list length.

**Priority:** low. **Applicability:** general. **Evidence basis:** R05.

### S07 — Vague attribution (`noul`)

**Instructions:** Does the sentence attribute a substantive claim to unnamed experts, studies, critics, or observers despite lacking a specific available source?

- **Yes:** A vague authority label stands in for a source the reader would need to assess.
- **No:** The source is specified, the claim is clearly opinion, or attribution is unnecessary.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R05.

### S08 — Superficial participial analysis (`noul`)

**Instructions:** Does an -ing clause such as "highlighting", "reflecting", or "underscoring" merely attach unsupported significance to a fact?

- **Yes:** The trailing interpretation is generic or unsupported by a shown relationship.
- **No:** The clause gives a necessary, well-grounded description or consequence.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05.

### S09 — Unnecessary lexical complexity (`noul`)

**Instructions:** Would simpler vocabulary communicate the same precise meaning more naturally to `document.audience`?

- **Yes:** Complex synonyms or jargon obscure meaning without supplying technical precision.
- **No:** The terms are standard for the audience or have necessary nuanced meaning.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R02, R07.

### S10 — Obscured actor (`noul`)

**Instructions:** Does passive or agentless construction hide who performs an action when that identity is needed to understand responsibility or causation?

- **Yes:** The missing actor is important and context does not identify it.
- **No:** Agentless phrasing is appropriate, or the responsible actor is obvious or irrelevant.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R02, R05.

### S11 — Unclear referent (`noul`)

**Instructions:** Does this sentence contain a pronoun, abstraction, or reference with multiple plausible antecedents that materially impair meaning?

- **Yes:** The reader cannot confidently identify the referent from the neighboring sentences.
- **No:** References resolve naturally from surrounding context.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R02.

### S12 — Stacked qualifications (`noul`)

**Instructions:** Does this sentence stack synonyms, qualifiers, or caveats that can be reduced without changing uncertainty or nuance?

- **Yes:** At least two qualifiers perform the same role or obscure a clear claim.
- **No:** Multiple qualifiers express genuinely different conditions or necessary uncertainty.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R05, R08.

### S13 — Purple prose (`noul`)

**Instructions:** Is the imagery or metaphor overworked, sentimental, or discordant with the scene or informational purpose?

- **Yes:** Figurative language overwhelms the fact or effect, adding generic atmosphere rather than accuracy.
- **No:** Imagery gives useful specificity, emotion, or a deliberate stylistic effect.

**Priority:** medium. **Applicability:** creative, editorial, essays, evocative prose. **Evidence basis:** R02.

### S14 — Manufactured drama (`noul`)

**Instructions:** Does a standalone fragment or short sentence create artificial gravitas without conveying a meaningful turn?

- **Yes:** Short dramatic syntax is interchangeable with a slogan and adds no interpretive value.
- **No:** Brevity serves contrast, pacing, character, or emphasis supported by the content.

**Priority:** low. **Applicability:** general. **Evidence basis:** R05, R12.

### S15 — Meta-announcement (`noul`)

**Instructions:** Does the sentence merely announce what the author will discuss or ask a rhetorical question with an obvious answer?

- **Yes:** The announcement or question creates no meaningful orientation or reader curiosity.
- **No:** The sentence frames a genuine problem, needed roadmap, or consequential question.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R02, R05.

### S16 — Awkward construction (`noul`)

**Instructions:** Is the sentence syntactically awkward in a way that slows comprehension without a deliberate stylistic reason?

- **Yes:** Word order, clause attachment, or rhythm makes comprehension unnecessarily difficult.
- **No:** The sentence is readable for its genre, even if its style is unusual or complex.

**Priority:** medium. **Applicability:** general. **Evidence basis:** R02, R07.


## Verification pass

### V01 — Unsupported new specificity (`noul`)

**Instructions:** Does `candidate.text` introduce any concrete fact, quote, named entity, number, example, or citation not grounded in `original.text` or `evidence`?

- **Yes:** At least one added concrete detail lacks the required grounding.
- **No:** Every new concrete detail is supported by source text or provided evidence.

**Priority:** blocking. **Applicability:** general. **Evidence basis:** R04, R12.

### V02 — Meaning changed (`noul`)

**Instructions:** Does the candidate materially alter any claim, qualifier, causal relationship, commitment, or important implication of the original without authorization?

- **Yes:** A material change to intended meaning appears in the revision.
- **No:** Meaning is preserved or changed only where authorized by the instructions.

**Priority:** blocking. **Applicability:** general. **Evidence basis:** R02, R04.

### V03 — Citation integrity broken (`noul`)

**Instructions:** Does the candidate remove, misattach, or change a citation or quoted passage such that an important assertion no longer has its original source context?

- **Yes:** A reference, quote, or source-to-claim relationship is lost or distorted.
- **No:** Source pointers and the claims they justify retain their intended relationships.

**Priority:** blocking. **Applicability:** text with citations or quotes. **Evidence basis:** R04.

### V04 — Distinctive voice erased (`noul`)

**Instructions:** Does the candidate flatten deliberate humor, idiom, sentence rhythm, technical voice, stance, or personality that the author intended to keep?

- **Yes:** A distinctive intentional feature is replaced by generic neutral copy without reader benefit.
- **No:** The revision retains author choices unless they are specifically approved for editing.

**Priority:** blocking. **Applicability:** general. **Evidence basis:** R02, R07, R12.

### V05 — Reader-value comparison (`choice`)

**Instructions:** Compared with `original.text`, which statement best describes `candidate.text` for the specified reader and purpose?

- **better:** The revision is more useful or more pleasurable to read, without losing important substance or voice.
- **equivalent:** Changes are mainly stylistic; a reader receives about the same value and clarity.
- **worse:** The revision loses useful meaning, precision, voice, or ease of reading.
- **unclear:** The difference is too ambiguous to judge reliably from the supplied state.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R03, R07.

### V06 — Substantive defect remains (`noul`)

**Instructions:** Does the revision leave the specific verified issue in `finding` substantially unresolved, even if its surface phrasing has changed?

- **Yes:** The targeted relevance, reasoning, specificity, or structure failure remains.
- **No:** The specific issue is resolved, or was already shown to be a false positive.

**Priority:** high. **Applicability:** general. **Evidence basis:** R01, R04.

---

*End of dossier. Version 0.1.0; research/specification only.*
