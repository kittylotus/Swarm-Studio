# Prompt enhancer

Open **Settings → LLM enhancer**, choose a provider, enter its API base URL, API key and exact model ID, then **Save LLM connection**. Provider selection restores each provider's saved connection. The default URLs include the appropriate API version; custom URLs should end at the API base, without `/responses`, `/messages` or `/chat/completions`.

Focus **LLM model ID** to refresh the configured provider's `/models` list automatically the first time for that connection. Matching IDs appear directly below the field as you type; search matches IDs and display names without regard to case. Click a result, or use Up/Down and Enter to select it. Escape closes the list and keeps your text, so custom IDs remain usable. The adjacent **Refresh LLM models** icon fetches again using the current unsaved connection fields. Changing the provider, URL or key clears the old catalog. Discovery follows Anthropic/Gemini pagination and filters Gemini entries that advertise only non-generation methods. OpenAI-style lists may also contain non-chat models: use the probe to check the chosen ID with the selected API contract.

**Test connection** sends a short streamed completion using the current form fields, including reasoning settings, and reports whether text arrived and how long it took. It does not require saving, change the positive prompt, or save the connection implicitly. This is a generation request and may incur a small provider charge. **Cancel check**, editing the connection, changing provider or leaving settings cancels the check. Model discovery is bounded to 20 seconds and the probe to 30 seconds; unsupported `/models` endpoints still allow manual IDs.

Supported contracts:

| Provider | API |
| --- | --- |
| OpenAI | Responses, with optional reasoning summaries |
| OpenAI compatible, Ollama, xAI | Chat Completions |
| DeepSeek | Chat Completions, thinking toggle and reasoning effort |
| OpenRouter | Chat Completions with its reasoning options |
| Anthropic | Messages; adaptive thinking for recognized newer models, token budgets for older thinking models |
| Gemini | Streaming GenerateContent; thinking budgets for 2.5 and levels for newer models |

Reasoning support varies by model. **Provider default** leaves effort unset. Use another effort only with a model that supports it. The output token limit includes reasoning on providers that count it there; raise it if a response is truncated. Studio displays only reasoning text or summaries actually returned by the provider. It cannot reveal hidden reasoning.

Keys stay in memory for the current app session unless **Remember key on this device** is checked. Remembered keys are stored in local browser storage separately from Studio project data. They are not encrypted in that storage. Enhancing sends the prompt/instruction, selected checkpoint name, canvas size and prompt preferences to the configured LLM. It does not send reference images, generated images or Swarm credentials.

## Use

1. Write an image idea or an instruction in the positive prompt.
2. Click **✦ Enhance** beside **Prompt**. The modal starts streaming automatically when the prompt is nonempty.
3. Choose **Prompt mode** to override automatic checkpoint detection, edit the instruction and click **Enhance** again if needed.
4. Review the thinking/summary and editable result. **Stop** cancels the request; partial or failed responses cannot be applied.
5. Click **Apply to positive prompt** to replace only the positive prompt. Closing the modal or pressing Escape leaves it unchanged. If the source prompt/model changed in the background, Studio refuses to overwrite the newer state.

Auto mode recognizes Anima, Illustrious/Noob/WAI, Krea and MOSS from checkpoint names, titles and architecture metadata. Unrecognized checkpoints preserve useful tags/prose without assuming a specialized format. You can always select a mode explicitly; the modal explains its syntax below the selector.

## Model syntax and host syntax

The enhancer distinguishes model conditioning text from Swarm/Comfy preprocessing. Existing LoRA/preset/wildcard/macro/region tokens and intentional weights are preserved. It does not add A1111-only operators or chat-template wrappers on assumption. Literal character qualifiers use `name \(series\)` so the host preserves parentheses, rather than treating them as emphasis. Intentional `(term:weight)` emphasis remains separate; its effect can differ by encoder. See [Comfy's parser](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/sd1_clip.py) and [Anima's encoder path](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/text_encoders/anima.py).

| Mode | Conditioning guidance |
| --- | --- |
| Anima | Tags, prose or a hybrid. Keep names/sentence capitalization, supplied `@artist` tags, series qualifiers and useful line breaks. For multiple subjects, attach each appearance/action to its owner with explicit `Left:`/`Right:`/background captions. Preserve supplied dataset prefixes on their own first line. Aesthetic checkpoints omit automatically added score tags. |
| Illustrious / Noob / WAI | Prefer compact, coherent CLIP tags with escaped qualifiers and supplied weights. Short prose relations can help, especially on later versions; do not assume this family is tags-only. Avoid contradictory framing and imported Pony score conventions. |
| Krea | Connected natural-language descriptions, subject relations and quoted visible text. Checkpoints named Krea 2 receive their own cohesive-paragraph expansion rules; FLUX.1 Krea keeps its separate guidance. Do not import Anima/SDXL operators or layout APIs from newer FLUX generations. |
| MOSS caption | Detailed captions, or ordered tags when preserving tag-oriented input. Keep exact text, punctuation and deliberate line breaks. Coordinate layouts belong to the separate JSON mode. |

For example, an Anima multi-subject prompt can keep an anchor and then bind attributes in readable clauses:

```text
2boys, upper body, festival, lanterns
Left: a blond boy in a blue yukata raises both hands in peace signs.
Right: a dark-haired boy in a red yukata holds a paper fan.
Background: fireworks illuminate the night sky behind them.
```

These labels are semantic caption structure, not guaranteed spatial masks or special tokenizer control codes. Studio's **Regions** feature uses explicit Swarm `<region:...>` directives for separate regional conditioning. The enhancer preserves those directives when supplied, rather than manufacturing them for every left/right description. Anima's model card documents mixed captions and tags; escaped parentheses are a host-parser requirement. [Anima prompting reference](https://huggingface.co/circlestone-labs/Anima)

## MOSS layouts

**MOSS · caption** writes detailed natural language. **MOSS · layout** requests an editable JSON draft with the current width/height and top-left pixel `xyxy` boxes. On Apply, Studio validates dimensions, bounds, item labels, captions and text, then compiles to the model's compact JSON with centered absolute `yxyx` boxes. The applied positive prompt is this compiled JSON, not the intermediate draft.

Keep the generation dimensions used during enhancement. A 1536×1024 draft box `[176,224,800,864]` compiles to `[-288,-592,352,32]`. Text items keep their exact visible text and line breaks. Canvas dimensions must be positive multiples of 16.

For layout JSON, disable prompt presets, regional prompting and automatic LoRA trigger insertion; these would wrap or prefix the JSON. LoRAs themselves can remain enabled. Put required trigger words in the layout captions. Studio checks this before starting generation.

## Runtime and verification

The desktop app streams through its native HTTP bridge. Browser/PWA clients use the local Studio relay supplied by `start.ps1`, `npm run dev` or `npm run preview`; a static-only deployment does not provide that relay. Browser relay requests require a same-origin session, forward only supported LLM headers and do not follow redirects.

Shared thin scrollbars use the active theme's accent, muted text and surface colors, including prompt fields, model results and the thinking card. Their tracks stay transparent, with a clearer thumb on hover/focus. Existing intentionally hidden navigation scrollbars remain hidden, and system colors take over in forced-color mode.

Provider completion markers finish enhancement immediately, even if the HTTP connection remains open. Native streams drain ordered channel deliveries rather than treating invoke resolution as the final byte. Late callbacks cannot revert a finished modal to “Writing prompt…”. An idle stream fails after 45 seconds without bytes, with a three-minute total limit; partial/failed output remains unapplied.

Offline checks: `npm run test:enhancer`, `npm run test:anima`, `npm run test:expressions`. These are included in `npm run preflight`. Browser checks: `npm run test:enhancer-ui` and `npm run test:anima-ui`. Like the repository's other UI diagnostics, they use an existing Playwright installation (`PLAYWRIGHT_MODULE` when outside local dependencies) and default to Edge (`PLAYWRIGHT_CHANNEL` to override). Fixtures run on loopback with synthetic keys and isolated browser storage, without a real LLM or GPU backend.

## Format references

- [Anima model card](https://huggingface.co/circlestone-labs/Anima)
- [Illustrious model card](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0)
- [FLUX.1 Krea model card](https://huggingface.co/black-forest-labs/FLUX.1-Krea-dev)
- [Krea 2 prompting guide](https://github.com/krea-ai/krea-2/blob/main/docs/prompting.md)
- [MOSS caption and layout contract](https://github.com/OpenMOSS/MOSS-Image/blob/main/USERGUIDE.md)
- [OpenAI reasoning summaries](https://developers.openai.com/api/docs/guides/reasoning)
- [Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)
- [Gemini thinking configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.ThinkingConfig.html)
- [DeepSeek thinking](https://api-docs.deepseek.com/guides/thinking_mode/)
