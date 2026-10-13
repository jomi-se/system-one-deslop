# Astra review: measure the reader's experience, not the absence of tells

Review date: 13 October 2026. I read the full research snapshot, implementation handoff, and all 35 question definitions, state requirements, interpretations, sources, and 14 synthetic cases. I checked pivotal primary-source passages separately. This is a design review; I made no Jev calls and changed none of the three inputs.

## Assessment

The architecture is substantially better than a blacklist, but the proposed measurement target is narrower than the user's goal. It predominantly asks whether text completes a task, contains supported claims, and can lose words without losing information. Those are useful checks. They do not establish that the result is pleasing to read. A dutiful, monotonous answer can pass all of them. A memorable, generous explanation can fail several because its useful effects are not new propositions.

Use three distinct outcomes:

| Outcome | What it means | What does not establish it |
| --- | --- | --- |
| Reading experience | The intended reader finds the prose enjoyable, natural for its purpose, and worth continuing; readability is one contributor | Shortness, error-free grammar, variable sentence lengths, or lack of model-associated phrases |
| Reader value | The reader gains the understanding, decision support, practical help, perspective, or experience the brief calls for | More facts, more specificity, more confidence, or a completed template by themselves |
| Preservation | The edit respects facts, uncertainty, commitments, meaningful voice, and the authorized scope of change | An attractive or useful result that silently changes the author's position |

The first two are optimization outcomes; preservation is an independent constraint. Do not average them into a compensatory score. A more enjoyable but materially less useful version is a tradeoff, not a desloping success. A useful but unpleasant version still needs work. A faithful revision can be equally dull. “Human sounding” is not a fourth substitute objective.

Keep the current working definition as one important failure family—apparent substance exceeding actual contribution—but do not let it define all writing value. A comic sentence, a scene-setting detail, tact in a refusal, or a pause before a difficult admission can earn its place without conveying another fact. Conversely, names, numbers, and technical terms can decorate an empty argument. Desloping sometimes requires development or rearrangement, not deletion.

## What the evidence actually supports

The original dossier generally distinguishes findings from proposals responsibly. The question catalogue's bare `evidence_sources` arrays weaken that distinction: a citation can look like validation of the exact question. Replace those arrays with typed ancestry records: source, relevant finding, evidence class, supported concern, transfer limitation, and whether the exact question has been validated. The answer to the last field is currently no for every question.

**D** below means a directly observed empirical concern in at least one studied domain, not validation of this wording or Jev. **C** means community or platform observation. **H** means an original design hypothesis, including a reasonable extension of a study into another domain. Product documentation establishes a primitive's contract, not a writing construct.

Primary-source audit:

| Source | Verified finding and necessary qualification |
| --- | --- |
| S01, [Measuring AI Slop v2](https://arxiv.org/html/2509.19163v2), §§3–6 | The 19 people supplied definitions; only 11 knew the term. Five copy editors joined the pilot and three continued main annotation. Each main annotator handled 71 articles and 41 QA passages; the reported 213/123 totals are annotation assignments, not distinct-item counts. Agreement was tested on overlapping subsets. Binary recall 0.08–0.12 is correct. Higher overlap on problematic spans does not imply agreement on their labels or the best edits. Tone, coherence and relevance remain difficult judgments. The study supports localized experiments, not a reliable universal slop ontology. |
| S03, [SlopBench v1](https://arxiv.org/html/2609.33905v1), §§3, 6.7 | 18 models, 112 scenarios, 19,928 outputs are correct. Repeated generations are not 19,928 independent tasks or human opinions. Crowd analysis uses model-level association across 18 models and is inconclusive; it does not validate rhythm or lexical scores as pleasure measures. Some prompts explicitly stress the authors' preferred failure modes. “Held-out” scenarios were released and used in reported results. Historical human corpora introduce genre and period confounds. |
| S04, [Science or Slop v1](https://arxiv.org/html/2610.00531v1), Appendix B, C.5 | 390 pairs, 85.9% pair accuracy, and a 63% reduction in summed absolute distance to human metric means are reported correctly. Human anchors are accepted papers, while AI items include submissions: quality and provenance can be confounded. “Human” eligibility includes first versions dated 2024 or earlier, or a low Pangram score for ICLR 2026; neither certifies unassisted authorship. Matching relaxes for some Agents4Science items, and many AI papers use PDF reconstruction while human anchors use source. The result is not reader-pleasure validation, nor a license to generalize every scientific defect to chat. |
| S05, [Flattery, Fluff, and Fog v3](https://arxiv.org/html/2506.05339v3), §§2–3 | The human comparison samples 100 triples per bias with three judgments per query. Four reward models and three LLM evaluators are studied. Approximately 39.4% “miscalibration” means disagreement with majority preference, not probabilistic calibration error. Structure has relatively low disagreement and can be preferred by humans. This supports controlled format/length tests; it does not establish that readers dislike lists, agreement, or polish categorically. |
| S07, [published Nature abstract](https://www.nature.com/articles/s41562-026-02550-0) | The three-study, seven-dataset, over-880,000-text claim is supported by the indexed published abstract. I did not obtain the published full text. Corpus diversity loss is a reason to monitor homogenization; it does not validate a single-sample voice-fit score or establish that unusual words improve reading. |
| S08, [em-dash study abstract](https://arxiv.org/abs/2606.29540) | N=69,632 is correct: eligible first-version medRxiv preprints with extractable Discussion sections. Presence rises from 4.23% to 11.58%. This is a population-frequency result, not a reader evaluation, causal attribution, or a local quality test. Keep it outside defect-grounding claims. |
| S09, [accusation study PDF](https://arxiv.org/pdf/2606.12073), §§3–4 | About 25 million comments were scanned; 7,500 candidate accusations received LLM judgments and 300 accusations received speech-act coding. The key matched comparison is 421 accused parent comments versus 2,048 controls. Its narrative claims a null for four distinguishing markers, yet the preceding paragraph includes mean token length among them and Table 4 makes token length significant (p<0.001); log body length is also significant (p=0.001). This appears internally inconsistent. Formal-register adverbs, preposition density and sentence-length variance are nonsignificant. Replace the dossier’s blanket null with these specific results. This study cannot show that style, substance, or all AI cues do not affect accusation. The PDF's language sometimes calls accused parents “human” without independent authorship verification. The dossier's qualification is safer. Treat accusation as a socially situated secondary outcome, not the quality target. |
| S10, [LAMP v3](https://arxiv.org/html/2409.14509v3), §§4–5 | Eight writers participated in formative editing; 18 in the main collection. Its creative-writing categories include cliché, redundant exposition, purple prose, poor structure, lack of specificity/detail, and awkward phrasing. This is stronger grounding for narrative overexplanation and expressive weakness than a generic anti-padding rule, but the domain and expert sample limit transfer. Edited pairs are not independent reader-pleasure trials. |
| S11, [WQ v2](https://arxiv.org/html/2504.07532v2), §§5–6 | 4,729 judgments and approximately 74% benchmark accuracy are correct. The human study uses 100 drafts from 90 instructions, nine writers, and three ranks per triplet. The 66% figure is described as reward/human preference alignment; it should not be casually restated as a universal 66% revision-win rate against original drafts. Best-of-20 selection is also part of the tested intervention. |
| S24, [LinkedIn statement](https://news.linkedin.com/2026/how-linkedin-is-tackling-ai-slop) | The September 15 statement explicitly includes generic substance, absent perspective, repetition, and attention gaming; proofreading is intended to preserve voice. These are product and community signals, not published validity evidence or an independently auditable classifier. |
| S27, [Typesafe skill](https://raw.githubusercontent.com/typesafe-ai/skills/main/skills/typesafe-ai/SKILL.md), [jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13) | Independence of questions within a request, Noul probability semantics, and the need to validate thresholds are confirmed. The limitations page is marked reviewed October 2, 2026. The handoff correctly separates code work and typed semantic judgment. This does not establish accuracy on pleasure, voice, inference, or any proposed rubric. |

I also opened S06's official ACL record; it supports the stated English-news comparison, not a causal claim about alignment alone. I did not independently reverify every other bibliography entry, venue acceptance, repository release, or license. No study was rerun. Wikipedia, Humanizer and derivative skills belong to one overlapping observation lineage; forks, stars, and repeated adoption do not add independent empirical replications.

Two consequential provenance repairs: `document_repeated_thesis` cites S17, but syntactic templates are not semantic thesis repetition. The six new paragraph roles and several relationship questions cite S04 as though its measures directly instantiated them. Much of this is H: sensible editorial engineering inspired by scientific-document analysis. Label that extension explicitly.

## Disposition of all 35 questions

“Merge” means remove the redundant production question, retain its examples and scope adapter. “Optional” means a selected profile or targeted diagnostic, not deletion of the concern.

| ID | Decision | Grounding | Reason or required repair |
| --- | --- | --- | --- |
| `information_padding` | Change; core | D | Recast as avoidable reader effort, with relational, aesthetic and navigational functions protected. Existing levels mix extent, repetitiveness and low value. |
| `redundant_restatement` | Keep, merge implementation with relationship variant | D | Require audience, position and surrounding material. Repetition can provide rhythm, reassurance, emphasis or retrieval support without new facts. |
| `generic_assertion` | Change; core | C; D-adjacent vagueness | Judge whether needed specificity is missing, not subject-swappability. Named entities can camouflage generic content. Supply surrounding development. |
| `inflated_significance` | Change; targeted | C | Require evidence coverage and distinguish absent evidence from demonstrated overstatement. “Clearly marked opinion” is not a blanket exemption from empty grandiosity. |
| `decorative_reframe` | Merge into rhetorical-payoff question | C | The construction is too prominent relative to its importance. Evaluate the claimed insight; genuine emphasis can be valuable without a new fact. |
| `unearned_validation` | Optional dialogue profile; narrow | D + C | Separate unsupported agreement about a factual belief from excessive praise. Empathy and encouragement do not need factual proof. |
| `register_mismatch` | Keep as selected-context diagnostic | D + C | Assess fit, not preferred bland professionalism. Make genre and reader expectations explicit. |
| `irrelevant_detour` | Merge with contribution/effort | D | Current redundancy increases correlated flags and deletion pressure. Include following context, where an apparent detour can pay off. |
| `unsupported_authority` | Optional evidence profile | C + H | Good support-versus-truth distinction. Missing citation is a finding about supplied support, not automatically a style defect or edit mandate. |
| `logical_connection_gap` | Optional argument profile | H, inspired by S04 | Useful but generic reasoning QA. Preserve ordinary shared premises and contextual ellipsis; do not demand textbook deduction. |
| `rewrite_fidelity` | Change; mandatory preservation gate | H | Strict preservation blocks authorized corrections and removal of unsupported claims. Separate unauthorized drift, authorized change and uncertainty using an edit mandate. |
| `rewrite_usefulness` | Change; core outcome | D-motivated H | Keep independent from pleasure. Use neutral A/B names; target the reader's gain rather than prose polish. |
| `author_voice_fit` | Change; preservation gate when feasible | D-motivated H | Compare original and revision against several relevant samples or explicit preferences. Absolute fit alone cannot detect whether an edit worsened voice. Do not infer biography. |
| `introduced_personal_claim` | Keep; factual-prose gate | C + H | Valuable explicit guard against manufactured authenticity; include implied biography and experiences attributed to others. Fiction requires different permissions. |
| `document_goal_gap` | Keep; core | H, informed by D | Validates task completion, not pleasure. Include reader experience when it is the actual task; skip or abstain when intent is unknown. |
| `document_answer_location` | Optional transactional/explanatory profile | H + C | A late thesis can be purposeful. In essays, suspense and earned discovery can be the value. Not a universal lead-with-answer rule. |
| `document_repeated_thesis` | Keep as routing hypothesis | D concern, H wording | Do not count it independently of localized repetition. Remove S17 as direct semantic support. |
| `document_register_mismatch` | Merge with register family across scopes | D concern, H wording | A whole-text variant is useful, but not an additional independent penalty. |
| `document_argument_development` | Optional explanatory/argument profile | H | Good detection of asserted-but-unearned substance; include audience and section scope. An announcement need not become an essay. |
| `document_conclusion_scope` | Optional evidence/argument profile | H | Retain as hypothesis followed by anchored support checks. Allow explicitly speculative or exploratory endings. |
| `infer_genre` | Keep as optional routing metadata | H; S27 is API only | Infer apparent form, not author intent. Never infer “marketing” from puffery and then excuse puffery because it is marketing. |
| `paragraph_role` | Optional soft routing; expand | H | Current roles omit atmosphere, characterization, humor, emotional acknowledgment and interpersonal coordination. A primary-role Choice cannot settle mixed function. |
| `paragraph_new_contribution` | Change; core | D concern, H wording | Missing “useful noninformational function” option is a serious false-positive trap: useful transitions fit none of the positive labels. Require audience and coverage. |
| `paragraph_relevance` | Merge into contribution diagnostic | D concern, H wording | Relevance and contribution are different concepts but do not warrant simultaneous deletion votes. Keep separate only if measured incremental benefit justifies it. |
| `explanation_mechanism` | Keep in explanation profile | D concern, H wording | Valuable against labels masquerading as explanations. Neighboring paragraphs may supply the mechanism; do not require it in every paragraph. |
| `evidence_claim_support` | Keep in evidence profile; change options | H | Split contradiction from merely irrelevant/insufficient support; those demand different responses. Include evidence coverage and source boundaries. |
| `example_explanatory_value` | Optional explanation profile | H | Examples can establish stakes, motivation or relevance, not only mechanism. Add useful/irrelevant/confusing/uncertain alternatives if those distinctions drive action. |
| `qualification_materiality` | Change; preservation-oriented | H | A low score must not authorize deletion. Qualifications can calibrate certainty, delimit expertise, or prevent misuse without changing the immediate action. |
| `transition_connection` | Change; optional | H + C | Mere signposting can reduce effort. “Not needed” overlaps with “empty staging”; use useful signpost, relation bridge, burdensome staging, uncertain. |
| `summary_usefulness` | Keep in long-form/explanation profile | H + C | Add actual location, distance and intended reading mode. A skimmable document needs repetition that continuous reading does not. |
| `relationship_contradiction` | Keep in evidence/technical profile | H | Generic consistency QA, not intrinsically desloping. Use source conditions, dates, definitions, quotation status and speaker. |
| `relationship_repetition` | Merge with restatement family | D concern, H wording | Pairwise similarity is insufficient; supply placement and intervening context, not just a goal. |
| `relationship_dropped_limitation` | Keep as preservation check; targeted diagnostic | H | A limitation may remain in force through nearby context without verbatim repetition. Judge likely scope interpretation. |
| `relationship_term_consistency` | Optional technical profile | H | Useful for precise terminology, dangerous as universal lexical consistency. Legitimate polysemy and metaphor are not faults. |
| `sentence_empty_announcement` | Merge into effort/contribution | C | Same deletion mechanism as transition/padding questions. Reader navigation and pacing can justify it. |

No concern needs to disappear entirely. Several standalone questions should disappear from the default production path. Thirty-five correlated prompts do not create thirty-five independent dimensions of writing quality.

## Missing dimensions worth testing

1. **Positive reading pleasure.** Add an independent whole-text pairwise outcome: which version is more pleasing for this reader and purpose? This is a proposed estimator, not a measured Jev capability. It prevents the system from declaring victory solely because flags disappeared.
2. **Rhetorical promise and payoff.** A sentence can sound revelatory while making a banal claim. Test whether the surrounding passage earns the asserted insight, importance, emotional resolution or surprise. This unifies decorative reframing and contrived profundity without banning a construction. Community observation is the main grounding; the exact question is H.
3. **Actual specificity.** Ask whether a needed mechanism, observation, example, distinction or reason is present. Specificity should matter to the reader's understanding. Invented numbers, token anecdotes and proper nouns must not receive credit merely for looking concrete.
4. **Packaging that obstructs use.** Assess whether formatting hides hierarchy, fragments a thought, or makes a short answer cumbersome. Format-bias research motivates testing; it does not say formatting is harmful. Necessary procedures are positive controls.
5. **Formulaic cadence only when it imposes a cost.** Repeated climactic closers, identical setup–contrast–moral units, or mechanically isolated fragments can make the reader anticipate the machinery more than the ideas. This is an optional H informed by structural observations. Do not use sentence-length variance as a target or require irregularity.
6. **Narrative overexplanation.** In a narrative profile, test whether explicit moral or emotional explanation duplicates an implication the scene already makes, weakening the intended experience. Narrative editing evidence motivates this; accessible teaching and necessary interpretation are counterexamples.

“Generic smoothness,” “authenticity,” “reader trust,” and “effort” are too broad to turn directly into binary defects. Generic smoothness should yield an identifiable issue—interchangeable claims, suppressed voice, unearned rhetoric or predictable structure—or remain a reader reaction. Evaluate trust as warranted reliance: can the reader tell what is known, inferred or uncertain? More confidence is not necessarily better. Never infer the writer's actual effort or sincerity from smooth prose.

## A smaller coherent core

For an initial English explanatory/professional pilot, use six diagnostic families: goal completion; communicative contribution/avoidable effort; meaningful specificity; harmful repetition; rhetorical payoff; and packaging only where formatting exists. These are a proposed experiment, not an empirically optimal subset. Local variants explain actionable findings; the document variants supply coverage and context. Keep descriptive role and genre inference outside the quality score.

Evaluate candidate revisions on two independent whole-text outcomes: reader value and reading pleasure. Preservation gates cover unauthorized meaning drift, critical facts and limitations, introduced personal claims, and avoidable voice loss. A local style gain cannot compensate for a preservation failure. A neutral revision should usually lose to doing nothing because it introduces change without demonstrated benefit.

Optional profiles add the following without redefining the core:

- **Explanation/teaching:** mechanism, example value, answer location, useful recap; preserve scaffolding matched to the learner.
- **Technical/evidence/argument:** evidence relation, conclusion scope, contradiction, limitation and terminology consistency.
- **Dialogue/interpersonal:** unsupported agreement and disproportionate praise, with tact and emotional acknowledgment protected.
- **Narrative/essay:** overexplanation, cadence, imagery and voice; preserve purposeful delay and aesthetic detail.
- **Promotional/social:** supported claims and rhetorical payoff; distinguish a legitimate invitation from hollow attention bait. Treat platform observations as context, not universal taste.

The companion JSON contains ten proposed definitions, with narrow instructions, required state, criteria, counterexamples and ancestry labels. It is a candidate design package, not a drop-in validated API library. Only each `question` object belongs in the API question map.

## Passes and context

The handoff is right that relationships are not merely another lower level, and that global flags must not exclusively gate local work. Its main architectural risk is building a confident hierarchy on several uncertain classifications.

Use a cheap orientation pass to preserve the brief and identify broad candidate regions. A paragraph's role should route possible checks, never certify their premise. For mixed or uncertain cases, run self-contained conditional questions or a small set of likely checks. Later state should contain original source text, neighboring units, referenced claims and coverage—not an assertion that a prior model already found slop. When a prior judgment is needed, mark it explicitly as a hypothesis and keep it out of instructions describing the passage.

Whole-text input is essential for whole-text outcomes; narrowed input is essential for bounded local judgments. Neither always wins. Preserve source anchoring for every extracted target claim and include neighboring/following development. Retrieval should seek disconfirming support as well as similar statements: an apparent generic claim may be developed later, and a limitation may still apply globally. Sample unflagged units and measure missed defects end to end. Missing coverage is not clean prose.

**Yes, add a final whole-text pass after local judgments and after edits.** Before editing, use it to reconcile localized findings with rhetorical and reader functions. After editing, read the assembled version afresh against the brief; separately compare original/revision for pleasure, value and preservation. Local edits can remove antecedents, destroy pacing, accumulate choppiness, flatten a voice, or leave transitions dangling even when each isolated edit looks good. Do not feed earlier labels to the fresh outcome judges. Compare both A/B orders in evaluation; another pass on the same model is not independent human validation.

Avoid repeated score-chasing. Make a bounded set of candidate edits and accept only demonstrated improvement within preservation limits. A finding should permit “retain,” “develop,” “move,” or “ask for missing support,” not only “cut.” Strict fidelity needs an explicit edit mandate: unsupported puffery can require changing a claim. The system may propose that substantive change for review, but cannot certify it as merely stylistic preservation.

Two state-contract repairs are necessary before implementation: required fields should include semantic coverage/provenance, not just key existence; and several rubrics mention audience, genre or rhetorical intention without actually requiring those fields. A populated but inferred goal is weaker than a supplied brief. Choice criteria should distinguish uncertainty from inapplicability. Noul values near 0.5 are not intensity; Score levels should form one coherent ordinal dimension.

## Validation that matches the goal

The 14 synthetic cases are useful smoke tests, but mostly obvious technical contrasts and omissions. They do not test the added hierarchy, literary restraint, ordinary tact, source coverage, subtle blandness, or positive pleasure. Some intended labels should be conditional: the caching closer may be a useful summary for a different audience, and the validation example mixes exaggerated praise with unjustified factual agreement. A fixed intended label without full context teaches the wrong certainty.

Keep the 240-passage proposal as rubric development, not a powered product test. Add naturally occurring whole texts and genuine edits. Freeze source-author, document, prompt-family and topic splits. Build a second set enriched for disagreements and false-positive traps. Recruit intended readers as well as editors: editorial preference is informative but not a proxy for every audience. Hide authorship and editing condition in the primary study, randomize order, and retain rater disagreement.

Measure the outcomes separately:

| Outcome | Human evaluation |
| --- | --- |
| Pleasure | Overall enjoyment or pleasantness for the stated purpose; pairwise preference with tie option; desire to keep reading where meaningful. Separately ask whether prose feels strained, monotonous, patronizing or overproduced. Do not seed every reader with the phrase “AI slop.” |
| Readability/effort | Ease of following, confusing transitions, rereading; task completion time where appropriate. Faster reading alone can reflect skipping or shallowness. |
| Value | Actual comprehension, retention of important conditions, decision/task accuracy, or meaningful insight. For narrative tasks use experience-specific criteria rather than an information quiz. |
| Preservation | Expert claim and constraint audit; author judgment of voice and intention; distinct counts for changed quantities, certainty, attribution, promises and invented experiences. |
| Perception of slop | Secondary unprompted complaints followed by a separate slop-perception question. In a separate experiment, vary disclosed authorship while holding text constant to measure label effects. |

Include four deliberately discordant conditions: pleasant/useful, pleasant/hollow, useful/awkward, and neither. Add an editor's revision that improves flow without shortening; a useful longer explanation; vivid restrained narrative; a warm concise refusal; clear prose containing em dashes, lists and contrasts; and bare-bones prose that fails the task. These are positive controls for the desired capabilities, not just negatives for a detector. Include technically correct but forgettable text, polished overpackaging, subtle repeated rhetorical beats, and minimally edited clean text to measure unnecessary intervention.

Compare no edit, deterministic linting, prompt-only editing, the small typed core, and the full hierarchy under the same editing budget. Ablate role routing, global hypotheses, new pleasure checks and preservation gates. Ask whether each addition improves human outcomes or merely adds flags. Evaluate routing recall including unselected defects, calibration on held-out data, actionable-flag precision, and harm from false edits. Cluster uncertainty by underlying text/prompt and reader; repeated generated variants are not independent observations. Choose sample sizes from pilot variance and a prespecified practical effect, rather than retrofitting significance to 240 passages.

Define success before testing: a meaningful improvement on pleasure with noninferior value, or a meaningful improvement on value with noninferior pleasure, and no unacceptable preservation failures. For the stronger claim that desloping improves both, require evidence on both. Report the two-dimensional results and tradeoffs rather than one win rate. A long-run goal can demand both; a single edit may reasonably improve one while leaving the other unchanged.

Stratify by genre, reader expertise, length and author. Test novice and expert audiences on the same explanation. Use multiple voice samples from the same genre and obtain the author's assessment; do not train toward one house style. Track whether repeated edits shrink variation across authors. Separate multilingual writers' English from other languages. Plain English, translated idioms, dialect and culturally appropriate indirectness are essential controls. French and Spanish need native-reader rubrics and data, not translated English tell lists. Until evaluated, report unsupported language/genre coverage rather than extrapolating.

The useful next step is a revised core and a reader study, not adding more labels. The design can become a strong desloping critic if it learns when rhetorical or structural choices earn their place, and if whole-text outcomes—not disappearing flags—determine success.
