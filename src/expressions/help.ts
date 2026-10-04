export const circleHelpIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.1-1.5 2"/><path d="M12 17h.01"/></svg>`;

/** Keep help outside the board so queue progress redraws do not close it. */
export function openExpressionHelp(): void {
    if (document.querySelector('.expression-help-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'expression-help-dialog';
    dialog.setAttribute('aria-labelledby', 'expression-help-title');
    dialog.innerHTML = `
      <header><div><span class="panel-kicker">EXPRESSIONS / USAGE GUIDE</span><h2 id="expression-help-title">Build your expression sheet</h2></div><button class="icon-button" data-help-close aria-label="Close usage guide" autofocus>×</button></header>
      <div class="expression-help-content">
        <section class="expression-help-start"><h3>A good starting point</h3><p>Start with <strong>SDXL + IPAdapter PLUS</strong>, <strong>768 × 768</strong>, <strong>24 steps</strong>, and the <strong>Semirealism</strong> style. Studio renders one portrait at a time. These are starting settings; the checkpoint and reference determine the final look.</p><p>Use identity strength <strong>0.65</strong>, start <strong>0</strong>, and end <strong>0.8</strong>. Raise strength for closer identity. Lower strength or shorten end time if the reference emotion overpowers your expression prompt.</p></section>
        <section><h3>From reference to finished sheet</h3><ol>
          <li><strong>Add your character.</strong> Upload a clear, front-facing portrait with visible eyes and a neutral expression. Studio resizes uploads to at most 1024 px on the longest side. You can also render a neutral card in Prompt only mode and choose <strong>Ref</strong> to use it as the reference.</li>
          <li><strong>Set the look.</strong> Choose a compatible checkpoint and switch between Semirealism, Realistic portrait, or Illustrated / anime. Describe the character, hairstyle, outfit, lighting, and framing in <strong>Character &amp; framing</strong>. Use <strong>Avoid</strong> for the negative prompt.</li>
          <li><strong>Choose the expressions.</strong> Add Essential 6, Classic 12, Full range 24, or custom cards. Edit each card’s label and expression direction. Presets add cards without removing your existing work.</li>
          <li><strong>Optionally add LoRAs.</strong> Enable <strong>Use enabled LoRAs from the composer</strong>. Studio checks compatibility and captures the stack when the queue starts, so later composer changes do not alter this run.</li>
          <li><strong>Render and refine.</strong> Choose <strong>Render missing</strong> for unfinished selected cards, or <strong>Render unlocked</strong> to regenerate selected, unlocked cards. Use a card’s <strong>Reroll</strong> for another take, then lock portraits you approve.</li>
          <li><strong>Arrange the sheet.</strong> Move cards with the arrows and uncheck expressions you want to exclude. Set columns, gutter, paper color, and labels under <strong>Sheet layout</strong>.</li>
          <li><strong>Export.</strong> Export the sheet PNG when every selected card is complete, or export a portrait pack for individual PNGs and the project manifest. Save the project to move the whole session to another device.</li>
        </ol></section>
        <section><h3>Choose a render method</h3><dl>
          <dt>IPAdapter · reference-guided</dt><dd>Uses the reference to guide identity while prompts direct the emotion. Choose an SDXL or SD1.5 checkpoint and matching adapter weights. Anima is incompatible with these adapters.</dd>
          <dt>LivePortrait · facial edit</dt><dd>Edits facial geometry on the reference using each card’s <strong>Face controls</strong>. Character prompts and composer LoRAs are unused. <strong>Apply face</strong> reapplies the controls; changing a seed does not create a new face edit.</dd>
          <dt>IPAdapter → LivePortrait · two passes</dt><dd>Generates a portrait with IPAdapter, then refines the generated face with the card’s facial controls. Requires both pipelines.</dd>
          <dt>Image-to-image · redraw</dt><dd>Redraws the reference at the chosen creativity level. It can retain composition and the original expression.</dd>
          <dt>Prompt only · baseline</dt><dd>Generates from the shared description and card direction without a reference. Useful for creating a neutral starting portrait.</dd>
        </dl></section>
        <section><h3>Seeds, takes, and stopping</h3><p>Cards begin with the shared seed. A reroll increments only that card’s seed offset. Up to eight previous takes remain as thumbnails; click one to restore it. Locked cards are skipped by the queue.</p><p><strong>Stop after current</strong> lets the active portrait finish and prevents later submissions. Render errors remain on their cards. CUDA or out-of-memory errors stop the queue; lower resolution before retrying.</p></section>
        <section><h3>Backend setup</h3><p>Open <strong>Backend setup &amp; research → Check loaded nodes</strong> to inspect the connected backend. IPAdapter needs its matching weights and CLIP Vision. LivePortrait and hybrid additionally require the <strong>AdvancedLivePortrait ExpressionEditor</strong> node and its models. Install through ComfyUI Manager, restart the backend, then recheck.</p><p>Face editing works best with detectable, unobstructed portrait faces. Heavily stylized faces may fail detection; identity consistency depends on the model.</p><div class="expression-help-links"><a href="https://github.com/cubiq/ComfyUI_IPAdapter_plus" target="_blank" rel="noopener noreferrer">IPAdapter setup ↗</a><a href="https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait" target="_blank" rel="noopener noreferrer">LivePortrait setup ↗</a></div></section>
        <section><h3>Saving and exports</h3><p>Your current project autosaves on this device, including the reference, outputs, and previous takes. Generated portraits also appear in Studio Library. <strong>Save project / Open project</strong> transfers settings and embedded images; remote image links are discarded on import.</p><ul>
          <li><strong>Sheet PNG:</strong> all selected cards in their current order, with optional labels. Every selected card must have an image.</li>
          <li><strong>Portrait pack:</strong> individual PNGs and project JSON, plus the sheet when all selected cards are finished.</li>
          <li><strong>Card PNG:</strong> download one portrait directly from its card.</li>
          <li><strong>API workflow:</strong> exports the first selected expression in IPAdapter or LivePortrait mode. Requires Swarm image bridge nodes and is an API graph. Disable composer LoRAs for standalone IPAdapter graph export; the live Studio pipeline supports them.</li>
        </ul></section>
      </div>
      <footer><button class="primary-button" data-help-close>Got it</button></footer>`;
    dialog.querySelectorAll('[data-help-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    // Preserve native Tab/Escape handling while pausing Studio navigation shortcuts.
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
}
