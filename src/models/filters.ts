import { buildLoraFacetCounts, type CivitaiFacetCache, type LoraFacetFilters, type LoraFacetMetadataFilter, type LoraFacetSort } from '../civitai/facets';
import type { SwarmModel } from '../swarm/types';
import './filters.css';

export interface LoraFilterSelection extends LoraFacetFilters { showNonMatching: boolean }
interface FilterHost {
  models: SwarmModel[];
  cache: CivitaiFacetCache;
  value: LoraFilterSelection;
  orphaned: boolean;
  count(value: LoraFilterSelection): number;
  apply(value: LoraFilterSelection): void;
}
const esc = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export function openLoraFilters(host: FilterHost): void {
  if (document.querySelector('.lora-filter-dialog')) return;
  const before = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'lora-filter-dialog';
  dialog.setAttribute('aria-labelledby','lora-filter-title');
  const counts = buildLoraFacetCounts(host.models,host.cache);
  const value = {...host.value,tags:[...host.value.tags]};
  const options = (items: Array<{name:string;count:number}>, selected: string) => {
    const available = [...items];
    if (selected && !available.some(item=>item.name.toLowerCase()===selected.toLowerCase())) available.push({name:selected,count:0});
    return available.map(item=>`<option value="${esc(item.name)}" ${item.name.toLowerCase()===selected.toLowerCase()?'selected':''}>${esc(item.name)} · ${item.count}</option>`).join('');
  };
  const tags = [...counts.tags];
  for (const tag of value.tags) if (!tags.some(item=>item.name.toLowerCase()===tag.toLowerCase())) tags.unshift({name:tag,count:0});
  dialog.innerHTML = `<form>
    <header><div><span class="panel-kicker">MAKE ROOM FOR THE RIGHT ONES</span><h2 id="lora-filter-title">Filter &amp; sort LoRAs</h2></div><button type="button" class="icon-button" data-cancel aria-label="Close LoRA filters">×</button></header>
    <div class="lora-filter-body">
      ${host.orphaned ? '<p class="helper-copy">Browsing orphaned LoRAs.</p>' : `<label class="check-row lora-filter-compat"><input type="checkbox" name="showNonMatching" ${value.showNonMatching?'checked':''}/><span><b>Show non-matching LoRAs</b><small>Include models outside the current checkpoint family.</small></span></label>`}
      <fieldset class="lora-filter-fields"><legend>Refine the collection</legend>
        <label class="field"><span>Creator</span><select name="creator"><option value="">All creators</option>${options(counts.creators,value.creator)}</select></label>
        <label class="field"><span>Family</span><select name="family"><option value="">All families</option>${options(counts.families,value.family)}</select></label>
        <label class="field"><span>Metadata</span><select name="metadata">${[['all','All metadata'],['tagged','Tagged'],['matched','CivitAI matched'],['unclassified','Unclassified'],['stats-uncached','CivitAI stats uncached']].map(([id,label])=>`<option value="${id}" ${id===value.metadata?'selected':''}>${label}</option>`).join('')}</select></label>
        <label class="field"><span>Sort by</span><select name="sort">${[['name','Name'],['creator','Creator'],['tag-count','Tag count'],['downloads','CivitAI downloads'],['rating','CivitAI rating'],['newest','CivitAI newest']].map(([id,label])=>`<option value="${id}" ${id===value.sort?'selected':''}>${label}</option>`).join('')}</select></label>
      </fieldset>
      <section class="lora-filter-tags" aria-labelledby="lora-filter-tags-title"><div><h3 id="lora-filter-tags-title">Tags</h3><small>Match any selected tag, together with the filters above.</small></div>
        <label class="field"><span>Search tags</span><input type="search" name="tagSearch" placeholder="Find a style, subject, pose…" autocomplete="off"/></label>
        <div class="lora-filter-tag-list">${tags.length?tags.map(item=>`<label data-tag-row="${esc(item.name.toLowerCase())}"><input type="checkbox" name="tags" value="${esc(item.name)}" ${value.tags.some(tag=>tag.toLowerCase()===item.name.toLowerCase())?'checked':''}/><span>${esc(item.name)}</span><small>${item.count}</small></label>`).join(''):'<p class="helper-copy">No tags indexed in this folder yet.</p>'}<p data-tag-empty class="helper-copy" hidden>No tags match this search.</p></div>
      </section>
    </div>
    <footer><button type="button" class="ghost-button" data-reset>Reset filters</button><div><button type="button" class="secondary-button" data-cancel>Cancel</button><button type="submit" class="primary-button" data-apply>Apply filters</button></div></footer>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form')!;
  const read = (): LoraFilterSelection => {
    const data = new FormData(form);
    return {tags:data.getAll('tags').map(String),creator:String(data.get('creator')||''),family:String(data.get('family')||''),metadata:String(data.get('metadata')||'all') as LoraFacetMetadataFilter,sort:String(data.get('sort')||'name') as LoraFacetSort,showNonMatching:host.orphaned?false:data.has('showNonMatching')};
  };
  const update = () => { const count=host.count(read()); dialog.querySelector('[data-apply]')!.textContent=`Show ${count} LoRA${count===1?'':'s'}`; };
  const search = () => {
    const query = (form.elements.namedItem('tagSearch') as HTMLInputElement).value.trim().toLowerCase();
    let visible=0;
    dialog.querySelectorAll<HTMLElement>('[data-tag-row]').forEach(row=>{row.hidden=Boolean(query)&&!row.dataset.tagRow!.includes(query);if(!row.hidden)visible++;});
    (dialog.querySelector('[data-tag-empty]') as HTMLElement).hidden=!tags.length||visible>0;
  };
  form.addEventListener('change',update);
  form.querySelector('[name="tagSearch"]')!.addEventListener('input',search);
  dialog.querySelectorAll('[data-cancel]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.querySelector('[data-reset]')!.addEventListener('click',()=>{
    for (const name of ['creator','family']) (form.elements.namedItem(name) as HTMLSelectElement).value='';
    (form.elements.namedItem('metadata') as HTMLSelectElement).value='all';
    (form.elements.namedItem('sort') as HTMLSelectElement).value='name';
    form.querySelectorAll<HTMLInputElement>('[name="tags"],[name="showNonMatching"]').forEach(input=>input.checked=false);
    update();
  });
  form.addEventListener('submit',event=>{event.preventDefault();host.apply(read());dialog.close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();const e=event as MouseEvent;if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{dialog.remove();if(before?.isConnected)before.focus({preventScroll:true});else document.querySelector<HTMLElement>('[data-action="open-lora-filters"]')?.focus({preventScroll:true});},{once:true});
  update();dialog.showModal();dialog.querySelector<HTMLElement>('[name="creator"]')?.focus();
}
