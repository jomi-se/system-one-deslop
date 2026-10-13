# System One Deslop bounded questions

Version: 0.3
Research snapshot: 13 October 2026

Current implementation catalogue: 13 candidate questions, five initial pilot candidates. These are the proposed first implementation questions. Jev returns defined signals; the reasoning model decides whether and how to edit. No question has been tested on Jev, and no probability below is an observed model result.

Noul means probability that the defined condition holds. Choice labels compare defined outcomes. Neither is a probability that rewriting will improve the text. The JSON contains the same definitions and synthetic boundary cases. D denotes empirical motivation in a bounded domain, C community observation, and H engineering hypothesis or transfer. Exact questions remain unvalidated.

## 1 significance assertion

ID: `significance_assertion`
Type: noul
Scope: sentence_or_passage
Pilot status: initial_candidate

Does `target.text` explicitly portray its subject as important, exceptional, historic, transformative, or consequential?

**Boundary:** Do not judge whether the asserted importance is justified. Evaluate the speaker's assertion, not an attributed claim that the speaker explicitly rejects.

**Required fields:** `target.text`

**Answers**

- **true**: The text makes a positive assertion of importance, exceptional status, or consequential impact.
- **false**: No such assertion is made. Technical description, an ordinary outcome, or quoting and rejecting such a claim does not establish this signal.

**Editor use:** Inspect the claim against evidence and genre before retaining, qualifying, supporting, or removing it.

**Research ancestry:** S18 (C): Community complaints about inflated significance; S19 (C): Derivative implementation of those complaints. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- target: {"text": "This release marks a historic turning point for software development."} → **true**. Presence only; truth and rhetorical merit remain undecided.
- target: {"text": "This release adds CSV export."} → **false**. A feature description does not assert exceptional significance.
- target: {"text": "The vendor calls it revolutionary, but the change is only a new icon."} → **false**. The narrator rejects the quoted significance claim.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 2 reader praise

ID: `reader_praise`
Type: noul
Scope: sentence_or_passage
Pilot status: optional_candidate

Does `target.text` positively evaluate `context.addressee`, their idea, ability, or action?

**Boundary:** Do not infer insincerity, excess, or factual correctness. The addressee must be identified.

**Required fields:** `target.text`, `context.addressee`

**Answers**

- **true**: The speaker explicitly praises the addressee or positively evaluates their idea, ability, or action.
- **false**: The speaker does not praise the addressee. Thanks, acknowledgment, emotional sympathy, and factual agreement alone are not praise.

**Editor use:** Let the editor assess proportion, relationship, and purpose. Keep emotional acknowledgment distinct from praise.

**Research ancestry:** S05 (D): Controlled sycophancy perturbations motivate separating related features; S18 (C): Community reports of excessive praise. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- target: {"text": "That is a brilliant idea."}; context: {"addressee": "the user"} → **true**. Not a judgment that praise is excessive.
- target: {"text": "I understand why that was frustrating."}; context: {"addressee": "the user"} → **false**. Emotional acknowledgment is not a positive evaluation.
- target: {"text": "Yes, the cache uses Redis."}; context: {"addressee": "the user"} → **false**. Agreement with a factual statement is not praise.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 3 content announcement

ID: `content_announcement`
Type: noul
Scope: sentence_or_passage
Pilot status: initial_candidate

Does `target.text` explicitly announce content that this text or one of its sections will present?

**Boundary:** Do not decide whether the announcement is empty, necessary, or burdensome.

**Required fields:** `target.text`

**Answers**

- **true**: The text promises, previews, or announces an explanation, discussion, comparison, summary, or other content in this document.
- **false**: The text gives content without an explicit announcement, or describes another document or a real-world future event.

**Editor use:** Inspect its location and navigation function. Never delete signposting solely because this signal is present.

**Research ancestry:** S18 (C): Community complaints about empty staging and formulaic transitions. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- target: {"text": "The next section explains cache invalidation."} → **true**. Useful navigation can still trigger this signal.
- target: {"text": "The cache expires after ten minutes."} → **false**. Substantive statement without an announcement.
- target: {"text": "The release will add caching next month."} → **false**. Future product behavior, not upcoming text.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 4 authority invocation

ID: `authority_invocation`
Type: noul
Scope: sentence_or_passage
Pilot status: optional_candidate

Does `target.text` invoke a person, institution, study, expert group, or consensus as a basis for accepting a claim?

**Boundary:** Detect the invocation only. Do not require a citation and do not verify the claim from memory.

**Required fields:** `target.text`

**Answers**

- **true**: An authority, research finding, or consensus is invoked to support acceptance of a claim.
- **false**: No authority is invoked as support. Merely naming a researcher or describing an organization is not sufficient.

**Editor use:** Retrieve supplied evidence where available, then inspect attribution specificity and support.

**Research ancestry:** S18 (C): Community concern about vague attribution and authority claims. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- target: {"text": "Experts agree that this is the safest approach."} → **true**. Support status is a separate judgment.
- target: {"text": "The experiment by Lee measured a 12 ms median latency."} → **true**. Legitimate attribution also triggers the feature.
- target: {"text": "Lee joined the team in April."} → **false**. A name alone is not an appeal to authority.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 5 example instance

ID: `example_instance`
Type: choice
Scope: passage_and_claim
Pilot status: initial_candidate

Does `target.text` give a particular instance of the general proposition in `claim.text`?

**Boundary:** Do not judge explanatory value or whether an example is needed. An abstract claim may be sufficient for its purpose.

**Required fields:** `target.text`, `claim.text`

**Answers**

- **instance_present**: A particular situation, entity, event, or worked case instantiates the target proposition.
- **no_instance**: No particular instance of that proposition is supplied. Rewording the general proposition or adding unrelated names or numbers is not an instance.
- **insufficient_context**: The proposition or passage is too ambiguous or incomplete to determine the relation.

**Editor use:** The editor decides whether to add, improve, retain, or omit an example using the brief and available facts.

**Research ancestry:** S10 (D): Expert creative edits address specificity and development; S18 (C): Community complaints about generic assertions. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- claim: {"text": "Caching can avoid repeated computations."}; target: {"text": "Reopening the same document reuses its stored embedding."} → **instance_present**. A specific situation instantiates the general claim.
- claim: {"text": "Caching can avoid repeated computations."}; target: {"text": "Caching makes repeated computations unnecessary."} → **no_instance**. Paraphrase is not an example.
- claim: {"text": "Caching can avoid repeated computations."}; target: {"text": "The office has 42 chairs."} → **no_instance**. A concrete number is not relevant specificity.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 6 causal mechanism

ID: `causal_mechanism`
Type: choice
Scope: passage_and_cause_effect
Pilot status: optional_candidate

What explanation does `target.text` supply for how `relation.cause` produces `relation.effect`?

**Boundary:** Do not require full scientific derivation, verify causal truth, or infer that the reader needs a mechanism.

**Required fields:** `target.text`, `relation.cause`, `relation.effect`

**Answers**

- **intermediate_process**: It describes at least one intervening process or operative interaction linking the supplied cause to the supplied effect.
- **association_only**: It asserts that the cause produces or accompanies the effect, but supplies no intervening process or operative interaction.
- **no_explanation**: It does not describe that causal relation.
- **insufficient_context**: The cause, effect, or passage is too ambiguous to classify.

**Editor use:** Use only where the reasoning model or user has identified a particular explanatory need.

**Research ancestry:** S01 (D): Bounded slop taxonomy includes concerns about substance and development; S04 (H): Transfer from scientific argument and evidence diagnostics. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- relation: {"cause": "cache reuse", "effect": "lower compute work"}; target: {"text": "A hit returns the stored embedding and skips the embedding model call."} → **intermediate_process**. Operative interaction is explicit; truth is not certified.
- relation: {"cause": "cache reuse", "effect": "lower compute work"}; target: {"text": "Caching reduces compute work."} → **association_only**. A perfectly appropriate short statement can fit this label.
- relation: {"cause": "cache reuse", "effect": "lower compute work"}; target: {"text": "The cache expires every ten minutes."} → **no_explanation**. Describes the cache without explaining this effect.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 7 claim relationship

ID: `claim_relationship`
Type: choice
Scope: claim_pair
Pilot status: initial_candidate

What semantic relationship holds between the single propositions in `pair.a.text` and `pair.b.text`, under `context.conditions`?

**Boundary:** Inputs must be single source-backed propositions, not invented summaries. Do not assess redundancy, usefulness, or truth. Ambiguous compound claims should be split or return insufficient_context.

**Required fields:** `pair.a.text`, `pair.b.text`, `context.conditions`

**Answers**

- **equivalent**: A and B assert substantially the same proposition under the supplied conditions.
- **b_narrows_a**: B expresses a restricted case or weaker reach of A; the restriction makes B narrower rather than an equivalent paraphrase.
- **b_broadens_a**: B asserts the proposition over a wider scope or with fewer restrictions than A.
- **compatible_distinct**: They concern the same issue and can both hold, but neither is an equivalent, narrower, or broader version of the other.
- **incompatible**: They cannot both hold under the same supplied conditions.
- **unrelated**: They do not address the same proposition or a related issue.
- **insufficient_context**: Missing scope, ambiguity, multiple unsplit propositions, or unknown conditions prevent a reliable classification.

**Editor use:** The editor uses position, audience, and genre to decide whether equivalent claims are helpful repetition. Use broader claims as candidates for scope review.

**Research ancestry:** S01 (D): Localized repetition is among studied concerns; S04 (H): Transfer from scientific redundancy and consistency measures. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- pair: {"a": {"text": "A cache hit reuses the stored embedding."}, "b": {"text": "On a cache hit, the stored embedding is used again."}}; context: {"conditions": "Same cache and same operation."} → **equivalent**. Does not imply harmful repetition.
- pair: {"a": {"text": "Every request is cached."}, "b": {"text": "Read requests are cached."}}; context: {"conditions": "Same system; read requests are a proper subset of all requests."} → **b_narrows_a**. Scope differs; do not call an equivalent paraphrase.
- pair: {"a": {"text": "The default TTL is ten minutes."}, "b": {"text": "The default TTL is twenty minutes."}}; context: {"conditions": "Same version, configuration, and time."} → **incompatible**. Conflict is anchored to explicitly comparable conditions.
- pair: {"a": {"text": "The TTL was ten minutes in version 1."}, "b": {"text": "The TTL is twenty minutes in version 2."}}; context: {"conditions": "Different versions."} → **compatible_distinct**. A change over time is not a contradiction.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 8 contrast relationship

ID: `contrast_relationship`
Type: choice
Scope: contrast_pair
Pilot status: optional_candidate

How do the propositions `contrast.a` and `contrast.b` relate under `context.definitions`?

**Boundary:** Compatibility is not a verdict on rhetorical payoff. Emphasis can deliberately contrast compatible properties.

**Required fields:** `contrast.a`, `contrast.b`, `context.definitions`

**Answers**

- **mutually_exclusive**: The propositions cannot both be true of the same subject under the supplied definitions.
- **compatible**: The propositions can both be true of the same subject under the supplied definitions.
- **insufficient_context**: Definitions, referents, or scope are insufficient to decide compatibility.

**Editor use:** Inspect whether the surrounding sentence promises a distinction it actually explains; the reasoning model owns that assessment.

**Research ancestry:** S18 (C): Community complaints about decorative negative parallelisms. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- contrast: {"a": "The release adds a feature.", "b": "The release is important."}; context: {"definitions": "Same release; adding a feature does not exclude importance."} → **compatible**. Compatibility alone does not make a rhetorical contrast bad.
- contrast: {"a": "The operation is permitted.", "b": "The operation is forbidden."}; context: {"definitions": "Same policy, time, actor, and operation; permission and prohibition are exclusive."} → **mutually_exclusive**. A genuine categorical distinction.
- contrast: {"a": "It is light.", "b": "It is heavy."}; context: {"definitions": "No referent or meaning of light is supplied."} → **insufficient_context**. Do not invent the intended dimension.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 9 limitation presence

ID: `limitation_presence`
Type: choice
Scope: claim_with_context
Pilot status: initial_candidate

Is the limitation in `limitation.text` expressed as applying to the target claim in `target.text`, considering `target.context`?

**Boundary:** Assess expression, not importance or truth. Absence is restricted to the supplied view. Do not infer permission to remove a limitation.

**Required fields:** `target.text`, `target.context`, `limitation.text`

**Answers**

- **expressed**: The limitation applies explicitly or through an unambiguous qualifier in supplied context.
- **absent_in_supplied_view**: The supplied target and context do not express the limitation as applying to that claim.
- **explicitly_contradicted**: The supplied view explicitly denies or overrides that limitation.
- **insufficient_context**: Scope attachment or wording is too ambiguous to decide.

**Editor use:** Use as a targeted preservation gate when the limitation is required by the edit mandate; escalate ambiguous attachment.

**Research ancestry:** S04 (H): Preserving evidence and limitations during metric-guided revision; S10 (H): Transfer from editing evaluation to constraint preservation. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- target: {"text": "Median latency was 12 ms.", "context": "The following results apply only to warm-cache requests."}; limitation: {"text": "Measured only with a warm cache."} → **expressed**. Context can preserve the qualifier without verbatim repetition.
- target: {"text": "Median latency was 12 ms.", "context": ""}; limitation: {"text": "Measured only with a warm cache."} → **absent_in_supplied_view**. Local absence; document-wide deletion cannot be concluded from incomplete coverage.
- target: {"text": "The result holds for both warm and cold caches.", "context": ""}; limitation: {"text": "The result is limited to warm caches."} → **explicitly_contradicted**. The limitation is explicitly overridden.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 10 evidence relation

ID: `evidence_relation`
Type: choice
Scope: claim_and_excerpt
Pilot status: optional_candidate

How does the supplied excerpt `evidence.text` relate to the single proposition `claim.text`?

**Boundary:** Do not search from memory or verify source credibility. No relevant support in an excerpt is not proof of falsity or evidence absence everywhere.

**Required fields:** `claim.text`, `evidence.text`, `evidence.coverage`

**Answers**

- **supports_as_stated**: The excerpt supports the proposition at its stated scope and strength.
- **supports_narrower_claim**: It supports a narrower or weaker form, but not the full proposition as stated.
- **contradicts**: It supplies evidence incompatible with the proposition under matching conditions.
- **no_relevant_support**: It neither supports nor contradicts the proposition in the supplied view.
- **insufficient_context**: Ambiguity or missing contextual conditions prevent determining the relation.

**Editor use:** The editor may retrieve more evidence, qualify the claim, or ask for support. Supplied evidence coverage must remain visible.

**Research ancestry:** S04 (H): Scientific evidence-gap measures motivate scoped evidence comparisons; S18 (C): Community concern about unsupported authority. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- claim: {"text": "The default TTL is ten minutes."}; evidence: {"text": "The default TTL is 600 seconds.", "coverage": "One supplied configuration excerpt."} → **supports_as_stated**. Unit conversion is allowed; code should also check exact values.
- claim: {"text": "All requests complete below 20 ms."}; evidence: {"text": "Median warm-cache latency is 12 ms.", "coverage": "One supplied result excerpt."} → **supports_narrower_claim**. Median and warm-cache scope do not support the universal assertion.
- claim: {"text": "The default TTL is ten minutes."}; evidence: {"text": "The cache uses Redis.", "coverage": "One supplied architecture excerpt."} → **no_relevant_support**. Not proof that the claim is false or unsupported elsewhere.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 11 uncertainty change

ID: `uncertainty_change`
Type: choice
Scope: aligned_claim_pair
Pilot status: optional_candidate

Compared with `original.claim`, how does `revision.claim` express certainty about the same proposition within `context.shared_scope`?

**Boundary:** Do not compare different propositions or confuse deontic permission with epistemic possibility. Code and the reasoning model must establish candidate alignment.

**Required fields:** `original.claim`, `revision.claim`, `context.shared_scope`

**Answers**

- **preserved**: The versions express materially equivalent epistemic certainty.
- **stronger**: The revision presents the proposition as more certain, established, or unconditional in epistemic terms.
- **weaker**: The revision presents it as less certain or more tentative.
- **insufficient_context**: The propositions are not aligned, scope differs, or uncertainty language cannot be interpreted reliably.

**Editor use:** Block unauthorized certainty changes on protected claims; ask the editor to resolve ambiguous alignment.

**Research ancestry:** S04 (H): Preservation during scientific revision motivates explicit certainty checks. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- original: {"claim": "The change may reduce latency."}; revision: {"claim": "The change reduces latency."}; context: {"shared_scope": "Same change, system, and conditions."} → **stronger**. Whether this change is authorized is determined separately.
- original: {"claim": "The result might reflect sampling error."}; revision: {"claim": "Sampling error could explain the result."}; context: {"shared_scope": "Same result and explanation."} → **preserved**. Meaningful certainty, not literal hedge matching.
- original: {"claim": "The change reduces latency."}; revision: {"claim": "The change may reduce latency."}; context: {"shared_scope": "Same change, system, and conditions."} → **weaker**. Weaker certainty can also be unauthorized drift.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 12 attribution change

ID: `attribution_change`
Type: choice
Scope: aligned_claim_pair
Pilot status: optional_candidate

Does `revision.claim` attribute the aligned proposition to the same source or speaker as `original.claim`, using `context.speakers`?

**Boundary:** Do not judge credibility or whether attribution is stylistically desirable. Distinguish identity changes from omitted citation formatting.

**Required fields:** `original.claim`, `revision.claim`, `context.speakers`

**Answers**

- **preserved**: The same source or speaker remains responsible for the claim, including clear pronoun resolution.
- **removed**: An attributed claim becomes an unattributed assertion by the current narrator.
- **changed**: The revision attributes it to a different source or speaker.
- **not_applicable**: The original and revision contain no attribution for this proposition.
- **insufficient_context**: Claim alignment or speaker identity is unclear.

**Editor use:** Check the edit mandate before accepting any attribution change; preserve sourced uncertainty and responsibility.

**Research ancestry:** S18 (H): Transfer from vague attribution concerns to explicit edit preservation. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- original: {"claim": "The vendor reports 12 ms latency."}; revision: {"claim": "Latency is 12 ms."}; context: {"speakers": "The current narrator is not the vendor."} → **removed**. A report became an assertion.
- original: {"claim": "Lee measured 12 ms latency."}; revision: {"claim": "Her measurement was 12 ms."}; context: {"speakers": "Her refers unambiguously to Lee."} → **preserved**. Paraphrase can retain attribution.
- original: {"claim": "Lee measured 12 ms latency."}; revision: {"claim": "Kim measured 12 ms latency."}; context: {"speakers": "Lee and Kim are different people."} → **changed**. Source identity changed.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.

## 13 personal experience assertion

ID: `personal_experience_assertion`
Type: noul
Scope: sentence_or_passage
Pilot status: optional_candidate

Does `target.text` assert a factual personal experience, action, feeling, or background fact about `context.speaker`?

**Boundary:** Do not infer truth or novelty from the sentence alone. Newness requires comparison with source material; fiction and author permissions need separate handling.

**Required fields:** `target.text`, `context.speaker`, `context.mode`

**Answers**

- **true**: The passage asserts or unambiguously implies a factual personal experience, action, feeling, or background fact about the identified speaker.
- **false**: It does not make such an assertion. Hypotheticals, clearly fictional narration, quoted others, and instructions alone do not count.

**Editor use:** Compare detected claims with the original and supplied author facts. Unsupported additions are candidates for rejection, not evidence of author dishonesty.

**Research ancestry:** S18 (C): Community complaints about manufactured human experience. These sources motivate the concern; none validates this exact question.

**Boundary examples**

- target: {"text": "I spent three weeks debugging this issue."}; context: {"speaker": "the nonfiction article author", "mode": "nonfiction"} → **true**. Detection does not establish that the experience is invented.
- target: {"text": "Imagine spending three weeks debugging this issue."}; context: {"speaker": "the nonfiction article author", "mode": "nonfiction"} → **false**. An invitation to imagine is not autobiography.
- target: {"text": "Lee said, “I spent three weeks debugging this.”"}; context: {"speaker": "the article narrator, not Lee", "mode": "nonfiction"} → **false**. The statement belongs to another speaker.

The example labels are author-proposed expectations, not human ground truth or Jev predictions.
