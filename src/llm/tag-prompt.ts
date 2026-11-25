/** From LumiSwarm alpha.9.4: escape literal character qualifiers without touching intentional weights.
 * Standalone also protects quoted visible lettering and raw structured prompts. */
export function escapeIdentityQualifiers(value: string): string {
    if (/^\s*[\[{]/.test(value)) return value;
    return value.split(/(<[^>]*>|"(?:\\.|[^"\\])*")/g).map((part, index) => index % 2 ? part :
        part.replace(/([\p{L}\p{N}_-])(\s*)\(([\p{L}\p{N} _.'-]+)\)(?=\s*(?:[,;\n]|$))/gu, '$1$2\\($3\\)')).join('');
}

export interface VisibleCount { tags: string; total: number; parts: Record<string, number>; caption: string }
export function parseVisibleCount(value: string): VisibleCount | null {
    if (value.length > 80) return null;
    const parts: Record<string, number> = {};
    for (const token of value.toLowerCase().split(',').map(s => s.trim())) {
        const m = /^([1-9]|1\d|20)(boy|girl|other)(s?)$/.exec(token);
        if (!m) return null;
        const n = Number(m[1]), kind = m[2]!;
        if ((n === 1) !== (m[3] === '') || parts[kind]) return null;
        parts[kind] = n;
    }
    const total = Object.values(parts).reduce((a,b) => a+b,0);
    if (!total || total > 20) return null;
    const order = ['boy','girl','other'].filter(k => parts[k]);
    return { parts,total,tags:order.map(k => `${parts[k]}${k}${parts[k]===1?'':'s'}`).join(', '),
        caption:order.map(k => `${parts[k]} ${k==='boy'?'male':k==='girl'?'female':'other'} character${parts[k]===1?'':'s'}`).join(', ') };
}

/** Split top-level tag fields only. Nested emphasis and directives remain intact. */
function fields(line: string): string[] {
    const out: string[] = [], stack: string[] = [];
    const pairs: Record<string,string> = {'(':')','[':']','<':'>','{':'}'};
    let start = 0, quoted = false, escaped = false;
    for (let i=0;i<line.length;i++) {
        const c=line[i]!;
        if (escaped) { escaped=false; continue; }
        if (c==='\\') { escaped=true; continue; }
        if (c==='"') { quoted=!quoted; continue; }
        if (quoted) continue;
        if (pairs[c]) stack.push(pairs[c]!);
        else if (stack.at(-1)===c) stack.pop();
        else if (c===',' && !stack.length) { out.push(line.slice(start,i));start=i+1; }
    }
    out.push(line.slice(start)); return out;
}

/** Explicit user opt-in; never guess counts from prose or rewrite a layout/region. */
export function reinforceVisibleCount(prompt: string, raw: string, strength: number): {prompt:string; diagnostic:string} {
    if (!raw.trim() || strength===0) return {prompt,diagnostic:''};
    const skip=(reason:string)=>({prompt,diagnostic:reason});
    const count=parseVisibleCount(raw);
    if (!count) return skip('Use unweighted count tags such as 2boys, 1girl.');
    if (!Number.isFinite(strength) || strength<1 || strength>2) return skip('Count strength must be between 1 and 2.');
    if (/^\s*[\[{]/.test(prompt) || /<(?:region|bbox|segment)\b/i.test(prompt)) return skip('Count reinforcement leaves structured and regional prompts unchanged.');
    let conflict=false, weighted=false;
    const lines=prompt.split(/\r?\n/).map(line=>{
        if (/^\s*(?:Camera|Framing|Together|Spatial relation|Visible text|Left|Right|Center|Foreground|Midground|Background)\b[^:]*:/i.test(line)) return line;
        const pieces=fields(line);
        const keep=pieces.filter(field=>{
            const token=field.trim().toLowerCase();
            const weight=/^\((.+):\s*\d+(?:\.\d+)?\)$/.exec(token);
            const plain=(weight?.[1]??token).replace(/(\d+)\s+(?=(?:boys?|girls?|others?)\b)/g,'$1');
            const parsed=parseVisibleCount(plain);
            const generic=/^(\d+)\s+(?:people|persons?|subjects?|characters?)$/.exec(plain);
            if (!parsed && plain!=='solo' && !generic) return true;
            if (parsed ? Object.entries(parsed.parts).some(([k,n])=>count.parts[k]!==n) : (plain==='solo'?1:Number(generic?.[1]))!==count.total) conflict=true;
            if (weight) { weighted=true; return true; }
            return false;
        });
        return keep.length===pieces.length?line:keep.map(s=>s.trim()).filter(Boolean).join(', ');
    });
    if(conflict) return skip('The authored count contradicts the requested count. Review the prompt first.');
    if(weighted) return skip('Existing deliberate count weights were retained.');
    const remaining=lines.filter(line=>line.trim());
    let index=0;
    while(index<remaining.length && /^(?:ye-pop|deviantart|<preset:[^>]+>(?:\s*,\s*<preset:[^>]+>)*)$/i.test(remaining[index]!.trim())) index++;
    if (/^(?:masterpiece|best quality|score_\d|safe|sfw|high quality)(?:,|$)/i.test(remaining[index]??'')) index++;
    const prefix=strength===1?count.tags:`(${count.tags}:${strength})`;
    remaining.splice(index,0,prefix);
    return {prompt:remaining.join('\n'),diagnostic:`Explicit count: ${prefix}`};
}

/** Remove only bare score tags from an Aesthetic caption, preserving intentional weights and host directives. */
export function stripAestheticScores(prompt:string):string {
    if (/^\s*[\[{]/.test(prompt)) return prompt;
    return prompt.split(/\r?\n/).map(line=>{
        if (/^\s*(?:Camera|Together|Spatial relation|Visible text|Left|Right|Center|Foreground|Midground|Background)\b[^:]*:/i.test(line)) return line;
        const parts=fields(line), kept=parts.filter(part=>!/^score_[1-9](?:_up)?$/i.test(part.trim()));
        return kept.length===parts.length?line:kept.map(p=>p.trim()).filter(Boolean).join(', ');
    }).join('\n');
}
