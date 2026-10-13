# System One Deslop implementation handoff

Project: system-one-deslop
Version: 0.3
Research snapshot: 13 October 2026
Audience: coding agents implementing the signal engine and rewriting loop

Build an iterative writing system in which Jev supplies bounded semantic signals and probabilities, a reasoning model interprets those signals and revises the text, and code controls the workflow. The intended result is writing that is pleasing to read and valuable to its intended reader. Evaluate those outcomes separately from the detection of stylistic features.

Use Jev for bounded observations with explicit answer definitions. Keep broad judgments about pleasure, usefulness, reader effort, and rhetorical payoff with the reasoning model and independent outcome evaluation. Typed outputs alone do not make those concepts operational. This brief describes a proposed first implementation; it assumes none of the earlier question designs has been implemented.

The companion catalogue contains 13 proposed bounded questions, including five initial pilot candidates. None has been run on Jev or validated with readers. Preserve that status in documentation and results. The count is a design proposal, not a requirement to ship all questions or a claim of optimal coverage.

## 1 Responsibilities and implementation mandate

Code owns source parsing, stable spans, exact counts, retrieval, state adapters, request composition, thresholds, candidate provenance, budgets, and stopping rules. Use the repository's existing language, framework, provider abstractions, and instructions. This handoff does not require a web interface or authorize deployment.

Jev supplies focused judgments with a defined answer space. It may classify semantic relations that require context; System One does not mean keyword matching. It must not be expected to produce editorial explanations or discover an unrestricted ontology of writing quality.

The reasoning model owns the writing brief, editorial hypotheses, selection of additional evidence, decisions about usefulness and aesthetic function, proposed edits, and a whole-text reread. Its hypotheses and explanations are generated judgments, not established facts. Preserve supplied intent separately from inferred intent.

Humans and authors supply the primary outcome labels: pleasure, value, preservation, and voice. A reasoning model's self-assessment is useful workflow evidence, but cannot independently validate its own improvement. Optional Jev predictions of those outcomes require their own experiments and are outside the default signal contract.

- Support overall-text, paragraph, sentence, passage, relationship, and revision passes. A pass determines evidence and coverage; it does not require a universal quality score.
- Attach each result to exact source units and its question definition. A document-level result must not silently become a verdict on every sentence.
- Preserve skipped, partial, uncertain, failed, and not-applicable statuses. An unanalyzed unit is not clean text.
- Give the reasoning model raw signals and definitions. Do not translate signal presence directly into an instruction to delete.
- Keep retain, move, expand, clarify, qualify, support, cut, and abstain available as editorial actions.
- Keep no-change as a valid result. Prevent repetitive rewriting merely to drive signal counts toward zero.
- Record model identities, question versions, source coverage, request fingerprints, and actual runtime cost.

## 2 Signals and editorial decisions

There is no universally validated slop ontology. Keep authorship, model-associated style, communication defects, and reader outcomes distinct. A person can write hollow prose; a model can write useful prose. Community dislike helps nominate features to investigate, while reader studies determine whether the system improves writing.

Every question must identify the input, the exact distinction to classify, the answer boundaries, insufficient-context behavior, and positive controls. A high probability indicates that the defined feature or relation applies. It does not indicate that the feature is harmful or that removing it will improve the text.

For example, a sentence announcing the next section can provide necessary navigation. Two equivalent claims can make a useful recap. Praise can suit an interpersonal exchange. A causal explanation may be unnecessary in a short status update. The editor needs genre, audience, position, and purpose to interpret those observations.

Do not use reader effort, usefulness, rhetorical payoff, authenticity, or pleasantness as undefined primitive labels. Break a proposed concern into an observable relation where possible. If the concern resists a stable definition, retain it as an editorial hypothesis or human outcome rather than manufacturing a precise-looking probability.

### Candidate research concerns and observations

| Research concern | Candidate observation | Decision owned by the editor |
| --- | --- | --- |
| Inflated significance | Explicit importance or exceptional-status assertion | Does evidence and purpose justify the wording |
| Excessive praise | Positive evaluation of the addressee | Does the praise fit this relationship and situation |
| Empty staging | Announcement of upcoming content | Does it help navigation or delay the needed content |
| Generic development | No particular instance or mechanism in the supplied view | Is such development needed and available |
| Semantic repetition | Equivalent source-backed propositions | Does repetition help emphasis, recall, pacing, or clarity |
| Decorative contrast | Compatibility of the contrasted propositions | Does the contrast establish a worthwhile distinction |
| Unsupported authority | Authority invocation and excerpt support relation | Is more evidence, qualification, or attribution needed |
| Meaning drift | Changed scope, uncertainty, attribution, or limitation | Is the change authorized and acceptable |

These are candidate translations of research concerns. None of the cited studies validates these exact questions or their usefulness as Jev features. The ancestry metadata distinguishes empirical observations in bounded settings (D), community reports (C), and engineering transfers or hypotheses (H). A derivative community project does not supply independent confirmation.

## 3 Research findings and evidence limits

### Direct slop measurement

Measuring AI Slop in Text collects definitions from 19 respondents and annotates news and question-answering material. Five copyeditors participated in a pilot and three in the main annotation; 11 definition respondents already knew the term. In its January 2026 revision, agreement on problematic spans is stronger than agreement on the overall binary label; this does not establish agreement about all defect categories or warranted edits. The 213 news and 123 question-answer annotation assignments are repeated annotations, not counts of distinct source items. Tested general-purpose judges strongly under-predict slop, with reported recall of 0.08 to 0.12. Which defects matter varies by domain. Its linked data repository currently says Coming soon. These results support localized, domain-aware evaluation; they do not establish that Jev will succeed. [S01](https://arxiv.org/html/2509.19163v2) COLM 2026 acceptance is independently listed; the numerical results here refer to arXiv v2. [S02](https://colm.eventhosts.cc/Conferences/2026/AcceptedPapers)

### Recent benchmarks

Academic SlopBench, September 2026, evaluates 18 served models across 112 scenarios and 19,928 outputs. It separately measures length inflation, repeated openers, paragraph rhythm, and lexical constructions. Rankings depend on weighting and sampling; crowd results are too noisy to settle whether the mechanical score captures reader perception. Historical domain baselines are not matched human answers to each task. Use its release as a behavior scorecard and robustness reference. Repeated model outputs are not independent human opinions, and released scoring choices and historical baselines require sensitivity analysis. [S03](https://arxiv.org/html/2609.33905v1)

Science or Slop, first posted 30 September 2026, studies 390 paired AI and human scientific papers. Its measures address cross-section references, redundancy, argument structure, citation isolation, figure exposition, and evidence gaps. Reported pair discrimination is 85.9%, not general-purpose detection accuracy. Direct metric optimization can erase useful evidence; its record-grounded revision harness addresses that failure. The measures are scientific-document-specific and the paper is a recent preprint. The human anchors include accepted papers, while AI examples include generated submissions, creating a quality confound. Date or detector eligibility does not establish unassisted human authorship. The reported 63% reduction concerns distance from human metric means, not a measured improvement in reading pleasure. [S04](https://arxiv.org/html/2610.00531v1)

### Evaluator biases

Flattery, Fluff, and Fog, ICLR 2026, examines length, structure, jargon, sycophancy, and vagueness using counterfactual pairs. Tested preference models favor amplified superficial features in more than 60% of instances and show about 40% disagreement with majority human preferences. The paper calls this miscalibration; it is not a probabilistic calibration error such as Brier score. Its tested structure perturbations also show that human readers can prefer formatting, so structure presence is not inherently a defect. [S05](https://proceedings.iclr.cc/paper_files/paper/2026/hash/2096bafd3073a2224f6f0adb594068df-Abstract-Conference.html)

From Lists to Emojis, ACL 2025, finds preference biases toward formatting such as lists, links, bold text, and emojis. [S12](https://aclanthology.org/2025.acl-long.1308/) Length-Controlled AlpacaEval supplies a method for controlling response-length bias. [S26](https://arxiv.org/abs/2404.04475) Test content-preserving formatting changes and matched-length pairs instead of assuming the judge ignores surface presentation.

### Diversity and voice

More Aligned, Less Diverse, ACL 2026, reports lower syntactic and especially lexical diversity in newer instruction-tuned models in the studied English-news setting. It does not isolate instruction tuning as the sole cause. [S06](https://aclanthology.org/2026.acl-long.1803/)

The shrinking landscape of linguistic diversity, Nature Human Behaviour, published 24 August 2026, reports three studies across seven datasets and over 880,000 texts. Its published abstract links writing-assistant use with reduced linguistic diversity and changed inferences about authors. The original dossier inspected an earlier full preprint; the published full text was inaccessible. [S07](https://www.nature.com/articles/s41562-026-02550-0)

An ACL 2025 workshop paper finds increased LLM-style vocabulary in English news without homogenization on its selected diversity metrics. Avoid equating vocabulary shifts, diversity, and quality. [S16](https://aclanthology.org/2025.acl-srw.95/)

### Authorship and perception

A preregistered June 2026 medRxiv analysis reports an increase in em-dash presence from 4.23% before ChatGPT to 11.58% afterward. It explicitly supports population-level observation rather than causal proof or individual-paper detection. [S08](https://arxiv.org/abs/2606.29540)

A June 2026 study of Hacker News and Reddit examines AI accusations as social behavior. Its broad narrative claim that selected prose proxies do not predict accusation conflicts with Table 4: mean token length and log body length have statistically significant matched-control differences. Do not repeat a blanket null claim. Other selected style proxies were nonsignificant in that analysis. Accusation labels are not verified authorship or quality labels. [S09](https://arxiv.org/abs/2606.12073)

Russell and colleagues find strong expert-majority authorship detection in a bounded news setting; that result does not establish general slop recognition. [S13](https://arxiv.org/html/2501.15654v2) Liang and colleagues show non-native-English bias in tested detectors. Include plain and non-native English among false-positive controls. [S14](https://pmc.ncbi.nlm.nih.gov/articles/PMC10382961/)

### Editing evidence

LAMP supplies 1,282 draft and expert-edited paragraph pairs from creative writing. [S10](https://arxiv.org/html/2409.14509v3) WQ combines 4,729 writing-quality judgments; its specialized reward models achieve 74% benchmark accuracy, and the paper reports 66% reward-model and human-preference alignment in its expert revision experiment. Do not interpret that figure as a universal 66% improvement rate over original drafts. These are useful baselines with domain limits. [S11](https://arxiv.org/html/2504.07532v2)

The full original research dossier is included in the implementation bundle for further detail. The reference catalogue at the end of this document preserves the primary links and evidence status.

## 4 Pass architecture and iterative editing

A pass is a bounded purpose with specified evidence and coverage. The same signal definition may be reused at different scales. Whole-text passes construct coverage and editorial context; they need not ask Jev to be an expert reviewer.

### Ingestion and brief

Keep the original immutable. Parse sections, paragraphs, sentences, quotations, code, and format information. Use stable unit IDs, content hashes, revision IDs, and an explicit half-open offset convention, such as UTF-16 code units. Preserve mappings when normalization is used. Keep the original rendering structure for formatting analysis.

Record the audience, purpose, genre, language, and edit mandate when supplied. Mark every inferred field as inferred and retain its source. Unknown intent must remain unknown. An initial English technical/professional pilot is a proposed scope, not the user's final product boundary; French, Spanish, and other genres need separate evaluation.

### Whole text pass

Code computes inexpensive observations: word counts, sentence lengths, repeated n-grams, heading and list density, and location of candidate phrases. These are features, not defects. Record counts and source spans rather than an unvalidated composite slop score.

The reasoning model reads the full text and brief, proposes editorial hypotheses, and selects candidate claims, relations, or regions for focused checks. Jev can evaluate a precise existence condition over the whole text if the state fits, but a positive result alone does not localize its occurrence. Use per-unit questions or a bounded candidate-selection operation when localization is needed.

For long documents, use section views and retrieval with explicit coverage. A summary is not interchangeable with the full source. Do not make a global negative result the sole gate to local analysis. Sample unselected regions to measure routing misses.

### Paragraph and passage passes

Construct inputs for example-instance, causal-mechanism, evidence-relation, or claim-relationship questions when there is a specific target claim. Preserve preceding and following context where required. Candidate claim extraction can be performed by the reasoning model or a parser, but every candidate must link to source spans. Independently check that its paraphrase does not invent scope, certainty, or facts.

Do not require every paragraph to explain a mechanism or add a fact. Humor, atmosphere, transitions, tact, summaries, characterization, and deliberate pacing can serve the text. The reasoning model evaluates those functions. A role classifier may help route tests later, but role inference is not a quality label and must not exclude all other checks.

### Sentence and relationship passes

Run rhetorical-act questions on selected sentences or passages. For relationships, compare source-backed single propositions with their conditions. Use retrieval for distant repetitions, but retain location and intervening context for the editor. Compatible claims at different times or configurations are not contradictions.

Do not use phrase matching as a substitute for meaning. A significance phrase quoted and rejected by the narrator differs from the narrator endorsing it. Conversely, removing a stock phrase may leave the same hollow assertion intact.

### Editorial reconciliation and rewrite

Before editing, the reasoning model reconciles the signal report against the complete text and brief. It may reject a suspected problem, retain a useful repetition, request more evidence, or change its own hypothesis. Earlier labels are observations or hypotheses, never instructions embedded as facts about the source.

Produce a bounded edit plan and a revision, using only supplied facts or separately authorized research. The plan records the target spans, suspected problem, intended reader benefit, factual constraints, and whether any substantive change is authorized. The editor must not invent personal experience to make prose seem human.

### Fresh assessment after editing

Reparse the revision and rerun applicable signals with new anchors. Reusing an earlier result is valid only when its source, context, definition, and relevant conditions are unchanged. Compare protected claims and limitations, exact values, negations, attribution, and uncertainty. Preserve original and revision separately; deleted claims require an explicit alignment outcome, not omission from the checklist.

The reasoning model then rereads the assembled revision against the brief without treating the earlier critique as ground truth. It checks coherence, pacing, voice, and actual usefulness. This reread can catch damage invisible in isolated local checks. In evaluation, independent readers supply outcome judgments without seeing the signal labels or alleged authorship.

### Accept or iterate

Code enforces the edit mandate, unresolved preservation checks, maximum iterations, token/cost limits, and text-version validity. Proposed defaults are two editing attempts and a no-change option; choose limits to fit the repository and measured results. If a candidate fails a required preservation check, retain the previous acceptable version or escalate it. An authorized correction is a substantive edit, not proof of stylistic fidelity.

Do not stop or accept solely because signals decreased. A supported important claim may legitimately retain its significance language. An unchanged signal can coexist with a better explanation. The application may use an editor's provisional assessment for interactive selection, while reporting that actual reader improvement remains unvalidated.

## 5 Initial bounded question catalogue

The five initial pilot candidates are significance assertion, content announcement, example instance, claim relationship, and limitation presence. They cover rhetorical acts, development, relationships, and preservation. This subset is a reversible starting point chosen for inspectable boundaries, not an empirically optimal feature set. Add optional questions only when their detection and editing utility justify the complexity.

The JSON catalogue defines 13 questions, required fields, answer criteria, research ancestry, editor use, and 40 synthetic boundary examples. The Markdown catalogue contains the same definitions for review. Only each definition's question object belongs in the TypeSafe API payload; the surrounding metadata is application data.

No broad Score questions are required in this version. Score remains useful when a single ordinal dimension can be expressed with concrete, independently understandable levels. The problem with the earlier reader-effort score was its undefined target and mixed criteria, not an intrinsic inability of Jev to make contextual judgments.

Noul is the probability that its condition holds. A value near 0.5 is uncertainty, not medium intensity. Choice probabilities compare competing labels; preserve the complete distribution and applicable confidence fields. A probability for praise, repetition, or an announcement is not an edit-benefit probability. Do not multiply correlated feature probabilities as though the features were independent. [S27](https://docs.typesafe.ai/primitives/noul)

### Explicit contrast example

For source-backed claim pairs, the question is what semantic relationship holds. These are author-proposed examples, not recorded Jev results.

- A says a cache hit reuses an embedding; B says the stored embedding is used again on a cache hit. Intended relation: equivalent.
- A says every request is cached; B says read requests are cached. Intended relation: B narrows A.
- A says the TTL is ten minutes in version 1; B says it is twenty minutes in version 2. Intended relation: compatible distinct claims.

The editor decides whether equivalent claims are a useful recap, whether the narrower scope needs explanation, or whether a version change is relevant. The signal definition stays constant across these editorial uses.

## 6 State and result contracts

| Record | Required contents |
| --- | --- |
| Source | Document ID, revision, immutable text, hash, language, parsed structure |
| Brief | Supplied goal, audience, genre, preferences, and per-field provenance |
| Edit mandate | Protected facts and commitments, allowed substantive changes, evidence permissions |
| Candidate | Source spans, extracted proposition, extraction provenance, alignment status |
| Context | Relevant units, conditions, referents, supplied evidence, and coverage |
| Question | Definition version, exact instructions and criteria, required state fields |
| Answer | Raw typed response, model identity, request fingerprint, status, unit anchors |
| Editor decision | Hypothesis, disposition, proposed action, intended benefit, authorization |
| Revision | Parent revision, new source hash, edit diff, claim mapping, preservation results |
| Evaluation | Detector labels, reader outcomes, author judgments, costs, and uncertainty |

Required fields need semantic coverage, not merely a JSON key. An empty context string may be an explicit complete local view; an omitted or unavailable surrounding paragraph is missing coverage. Check these distinctions before inference. Preserve local absence as local absence. Do not convert it into a document-wide conclusion.

A signal report should retain the raw answer, question definition, source excerpt, and view coverage. For an announcement, use language such as “announcement detected in sentence 17”; do not automatically relabel it “empty filler.” Editorial interpretation is a separate record.

Candidate coverage is essential. A relation checker cannot notice a omitted claim, an unselected limitation, or an invented claim that never entered its candidate set. Use deterministic value diffs, source-to-revision claim mappings including deletions and additions, fresh full-text reading, and sampled audits. Unknown coverage must not pass a preservation gate.

Model output and source text are data. Do not let quoted instructions inside the document change the application workflow. Preserve quotations, speakers, code exclusions, and genre-specific treatment.

## 7 Dynamic questions and hypothesis testing

The reasoning model may propose questions when a passage presents an unusual issue. Prefer instantiating a stable relation definition over generating a new rubric for every passage. For example, nominate several claims suspected to express the same benefit, then use the fixed claim-relationship question on source-backed pairs.

Do not ask whether a passage is redundant fluff that should be removed. That presupposes a diagnosis and merges observation with action. Supply neutral source pairs and defined relation labels instead.

For a genuinely new question, require an exact observable distinction, required evidence, label boundaries, insufficient-context behavior, examples and counterexamples, scope, and definition hash. Mark it experimental. Do not compare its values to earlier values from a different definition or insert it into a production composite without validation. Keep hypothesis provenance visible and retrieve possible disconfirming evidence.

Independent questions over shared state can be asked together. They cannot see one another's answers. If one result determines which evidence to fetch or which candidate to construct, make a subsequent request with that new state. Explicit speculative branches are possible, but code consumes only applicable answers. Measure their real token and cost overhead. [S27](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md)

Repeated editing against unchanged questions can exploit the detector. Evaluate paraphrase robustness, freeze definitions during an experiment, retain held-out texts, and independently assess reader outcomes. Fewer flags can mean improved prose or a successful evasion; the count does not distinguish them.

## 8 Questions outside the initial catalogue

Broad usefulness, contribution, goal fulfillment, register fit, reader effort, pleasure, and rhetorical payoff are editorial or outcome judgments. They are not required Jev primitives in this implementation. Experimental Jev estimators for these outcomes may be tested separately if operational definitions and labels can be established.

Role and genre inference may later help routing, but must remain descriptive and must not certify quality or block other checks. Start with supplied reader intent where available and preserve unknown fields. A candidate signal becomes a product feature only after its boundaries and incremental utility have been tested.

Historical research and reviewer proposals are included for evidence and context. Their question suggestions are not an additional implementation checklist. The current handoff and JSON define the proposed first build.

## 9 Validation plan

### Signal detection

Build annotation tasks around the exact defined condition or label. Annotators identify whether praise is present, how two claims relate, or whether a limitation is expressed. Do not ask them to infer whether a signal deserves an edit unless that is a separate annotation field.

Use the synthetic examples for schema, adapter, and boundary smoke tests. They are author-proposed expectations, not empirical labels. Add natural text and independent annotations, retain disagreements, and split by underlying document, author, prompt family, and topic. Avoid treating generated variants or repeated judgments of one source as independent samples.

For Noul, measure precision/recall, precision-recall curves, Brier score, and calibration on held-out labels. For Choice, measure confusion, unclear/inapplicable coverage, and option-order sensitivity. Track performance by language, genre, evidence coverage, and scope. Record errors caused by extraction, retrieval, missing context, question ambiguity, Jev, or code separately.

Test paraphrases, quoted and rejected claims, useful announcements, legitimate praise, examples that merely contain a number, implied limitations, version changes, and uncertainty language with different meanings. Preserve positive controls containing em dashes, lists, formal language, deliberate repetition, and non-native English. None is inherently poor writing.

### Editing utility

Evaluate whether providing a signal improves the reasoning model's revisions. Compare no edit, prompt-only editing, deterministic observations plus editing, the initial Jev candidates plus editing, and added signals. Match model, source facts, context, editing budget, and allowed iterations. Ablate signals and routing passes. A detectable feature can have no incremental editorial value.

Intended readers compare complete original and edited texts with origin and intervention hidden and A/B order randomized. Measure pleasure and value separately, allow ties, and retain disagreement. Measure comprehension, task or decision accuracy when relevant; use experience-appropriate criteria for narrative rather than imposing a factual quiz on every genre. Obtain author assessments of voice and intent, and independently audit protected claims.

Include pleasant/useful, pleasant/hollow, useful/awkward, and neither. Include useful longer revisions, improved flow without shortening, clear technical prose, warm concise correspondence, and restrained narrative. Evaluate unnecessary intervention in already good text. Do not prime all raters with the phrase AI slop. Perceived slop is a secondary outcome, and disclosed-authorship effects need a separate same-text experiment.

Choose sample sizes and practical improvement targets after a pilot. Report uncertainty clustered by underlying text and reader. A result improving pleasure with noninferior value supports that limited claim; claiming improvement in both requires evidence on both. Do not declare success from signal reduction, a single model judge, or an arbitrary composite.

### Whole pipeline and stopping

Measure routing misses, unselected claims, source anchoring, quote handling, revision invalidation, claim extraction coverage, cost, latency, failure status, and partial coverage. A later stage must be able to reject an earlier hypothesis. Deduplicate repeated signals without counting them as independent defects.

Calibration of the returned probabilities must be evaluated for these definitions and domain. Product thresholds depend on the consequences of errors; no universal cutoff or actionable-flag precision target is established here. Accepting an edit requires separate preservation and editorial policy, not only a signal threshold.

Stop at budget limits, no proposed benefit, repeated identical revisions, unresolved missing evidence, or a required preservation failure. Keep the last acceptable version. Do not let the editor repeatedly paraphrase toward zero signals.

## 10 Sequenced implementation plan

1. Inspect the repository scaffolding, provider interfaces, and instructions. Read the current TypeSafe docs. Choose implementation details consistent with the existing stack.
2. Implement immutable source units, brief provenance, edit mandate, coverage, and revision anchoring. Verify Unicode, source round trips, code and quotes, additions, deletions, and mapping invalidation.
3. Implement typed question loading and state adapters with a fake provider for workflow tests. Validate only the question objects are sent, missing evidence stays missing, dependencies require fresh requests, and failures cannot become clean results.
4. Implement the five pilot signal candidates and code observations. Keep raw answers and distributions. Add targeted relation candidate construction and provenance; test coverage and extraction independently of semantic accuracy.
5. Integrate the reasoning model as an editor. Provide neutral signal reports and the complete brief. Record hypotheses and dispositions, allow no change, bound attempts, and implement targeted preservation plus a fresh full-text reread.
6. Run signal detection and editing-utility pilots when credentials and cost limits are configured. Freeze definitions for held-out evaluation. Report actual calls and observations, not simulated probabilities.
7. Add optional signals or genre profiles only where measured incremental utility or demonstrated gaps justify them. Evaluate French and Spanish with native readers and examples. Keep broad Jev outcome estimators experimental.

Build on the repository scaffolding and conventions. Tests should check meaningful behavior and contracts rather than mirror implementation. Mocked responses verify orchestration, not Jev capability.

## 11 Agent starting instructions

Use this handoff and its companion JSON as the proposed implementation brief. Read the research dossier and reviewer notes for evidence and cautions; their earlier question suggestions are background, not extra requirements. Keep the exact-question validation status false until measured. Do not describe the question pool as a validated slop detector.

Implement a reasoning-model editing loop around bounded Jev signals. Do not assign the complete editorial job to Jev, and do not make the reasoning model mechanically obey its flags. The purpose is reader benefit; the features are instruments to test along the way.

When reporting, distinguish implemented workflow, measured signal accuracy, measured editing utility, independent reader outcomes, and untested coverage. Include substantive preservation failures and unnecessary edits, not just successful examples. Routine implementation choices can remain reversible and documented; ask only when a missing product decision blocks progress.

## 12 Reference catalogue


Research status is current to 13 October 2026. New preprints and project-reported benchmarks require interpretation within their stated task. The original dossier contains expanded comparisons and access details.

- **S01** [Measuring AI “Slop” in Text](https://arxiv.org/html/2509.19163v2). Shaib, Chakrabarty, Garcia-Olano and Wallace. 2026-01-24 (v2; first preprint 2025-09). Research paper; COLM 2026 acceptance separately verified.
- **S02** [COLM 2026 accepted papers](https://colm.eventhosts.cc/Conferences/2026/AcceptedPapers). 2026. Official conference listing.
- **S03** [SlopBench: How Well Can We Rank Language Models by Slop?](https://arxiv.org/html/2609.33905v1). Roongta, Gaddipati and Huynh. 2026-09-27. Preprint.
- **S04** [Science or Slop? Benchmarking and Mitigating Scientific Slop in AI-Generated Papers](https://arxiv.org/html/2610.00531v1). Oh, Lee, Ahn, Kim and Kang. 2026-09-30. Preprint.
- **S05** [Flattery, Fluff, and Fog](https://proceedings.iclr.cc/paper_files/paper/2026/hash/2096bafd3073a2224f6f0adb594068df-Abstract-Conference.html). Bharadwaj, Malaviya, Joshi and Yatskar. ICLR 2026; preprint 2025. Peer-reviewed conference paper.
- **S06** [More Aligned, Less Diverse? Analyzing the Grammar and Lexicon of Two Generations of LLMs](https://aclanthology.org/2026.acl-long.1803/). Gude et al. 2026-07. ACL 2026 long paper.
- **S07** [The shrinking landscape of linguistic diversity in the age of large language models](https://www.nature.com/articles/s41562-026-02550-0). Sourati et al. 2026-08-24. Nature Human Behaviour.
- **S08** [Em-ergence of the em-dash](https://arxiv.org/abs/2606.29540). Czuma. 2026-06-28. Preregistered observational preprint.
- **S09** [“That’s AI Slop, You Bot!”](https://arxiv.org/abs/2606.12073). Miklian and Katsos. 2026-06-10. Observational preprint.
- **S10** [Can AI writing be salvaged?](https://arxiv.org/html/2409.14509v3). Chakrabarty, Laban and Wu. CHI 2025; preprint 2024. Peer-reviewed conference paper.
- **S11** [AI-Slop to AI-Polish?](https://arxiv.org/html/2504.07532v2). Chakrabarty, Laban and Wu. 2025-04-20 (v2). Preprint.
- **S12** [From Lists to Emojis: How Format Bias Affects Model Alignment](https://aclanthology.org/2025.acl-long.1308/). ACL 2025. Peer-reviewed conference paper.
- **S13** [People who frequently use ChatGPT for writing tasks are accurate and robust detectors of AI-generated text](https://arxiv.org/html/2501.15654v2). Russell, Karpinska and Iyyer. 2025-05-19 (v2). Research paper.
- **S14** [GPT detectors are biased against non-native English writers](https://pmc.ncbi.nlm.nih.gov/articles/PMC10382961/). Liang et al. 2023. Patterns research paper.
- **S15** [Delving into LLM-assisted writing in biomedical publications through excess vocabulary](https://pubmed.ncbi.nlm.nih.gov/40601754/). Kobak, González-Márquez, Horvát and Lause. 2025-07-04; online 2025-07-02. Science Advances.
- **S16** [Testing English News Articles for Lexical Homogenization Due to Widespread Use of Large Language Models](https://aclanthology.org/2025.acl-srw.95/). Fitterer, Gangl and Ulbrich. 2025-07. ACL Student Research Workshop.
- **S17** [Detection and Measurement of Syntactic Templates in Generated Text](https://aclanthology.org/2024.emnlp-main.368/). Shaib, Elazar, Li and Wallace. EMNLP 2024. Peer-reviewed conference paper.
- **S18** [Wikipedia Signs of AI writing](https://en.wikipedia.org/w/index.php?oldid=1380067895&title=Wikipedia:Signs_of_AI_writing). Snapshot accessed 2026-10-13. WikiProject AI Cleanup advice page; not Wikipedia policy.
- **S19** [blader/humanizer](https://github.com/blader/humanizer). Current repository accessed 2026-10-13. Community agent skill; SKILL.md metadata 3.1.0.
- **S20** [EQ-Bench Slop Score](https://github.com/sam-paech/slop-score). Samuel J. Paech. Repository cites 2025; accessed 2026-10-13. Open-source heuristic benchmark.
- **S21** [Dan Cleary SlopBench](https://github.com/Dan-Cleary/slopbench). Accessed 2026-10-13. Community deterministic benchmark.
- **S22** [bheijden/slop](https://github.com/bheijden/slop). Accessed 2026-10-13. Community prose linter.
- **S23** [The load-bearing vocabulary of Claude](https://github.com/louisabraham/load-bearing). Louis Abraham. Accessed 2026-10-13. Exploratory corpus analysis and classifier.
- **S24** [How LinkedIn is Continuing to Tackle AI Slop](https://news.linkedin.com/2026/how-linkedin-is-tackling-ai-slop). 2026-09-15. Platform statement; company-reported results.
- **S25** [WritingBench: A Comprehensive Benchmark for Generative Writing](https://proceedings.neurips.cc/paper_files/paper/2025/hash/4aedf0cba303537fcb6cf948bb41b2df-Abstract-Datasets_and_Benchmarks_Track.html). Wu et al. NeurIPS 2025. Peer-reviewed Datasets and Benchmarks paper.
- **S26** [Length-Controlled AlpacaEval](https://arxiv.org/abs/2404.04475). Dubois, Galambosi, Liang and Hashimoto. 2024; revision 2025. Evaluation-method paper.
- **S27** [Typesafe AI agent skill and live documentation](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md). Accessed 2026-10-13. Official product documentation.

### Implementation links

- [Typesafe documentation index](https://docs.typesafe.ai/llms.txt)
- [Typesafe API](https://docs.typesafe.ai/api)
- [Choice](https://docs.typesafe.ai/primitives/choice), [Noul](https://docs.typesafe.ai/primitives/noul), and [Score](https://docs.typesafe.ai/primitives/score)
- [Jev 1.13 documented limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- [Academic SlopBench data and scorer](https://github.com/hgaddipati1118/slop-index)
- [ScientificSlop code](https://github.com/yerimoh/ScientificSlop) and [dataset](https://huggingface.co/datasets/yerim0210/Scientific_Slop)
- [LAMP and WQ project](https://github.com/salesforce/creativity_eval/)
- [WritingBench in Inspect Evals](https://ukgovernmentbeis.github.io/inspect_evals/evals/writing/writingbench/)

Preserve source and license metadata when importing data. Code licenses, corpus terms, article licenses, and model-output terms can differ. Pin mutable rule sets; derivatives of Wikipedia's guide do not supply independent empirical replications.

