import { mkdir, readdir, readFile, writeFile, rename, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function auditExpressionProjects(root, { maxFiles = 10000, maxBytes = 256 * 1024 * 1024 } = {}) {
    const base = path.join(root, 'Projects', 'Expressions'), queue = [base], references = new Set(), checks = [];
    let files = 0, bytes = 0, complete = true;
    const deadline = Date.now() + 15000; let folders = 0;
    const collect = (value, depth = 0) => {
        if (depth > 30) throw new Error('Project reference depth exceeded.');
        if (typeof value === 'string') {
            if (value.length < 10000 && !/^(data:|blob:)/i.test(value) && (/^(https?:\/\/|\/?(?:View|Output)\/|raw\/)/i.test(value) || /\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(value))) references.add(value);
        } else if (Array.isArray(value)) value.forEach(item => collect(item, depth + 1));
        else if (value && typeof value === 'object') Object.values(value).forEach(item => collect(item, depth + 1));
    };
    try {
        // Validate root ancestors too; an audit must not follow linked project folders.
        for (const target of [path.dirname(base), base]) { try { if ((await lstat(target)).isSymbolicLink()) throw new Error('Linked project roots cannot be audited.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
        while (queue.length) {
            if (++folders > 10000 || Date.now() > deadline) throw new Error('Project folder audit budget exceeded.');
            const dir = queue.shift();
            let entries; try { entries = await readdir(dir, { withFileTypes:true }); } catch(error) { if (error.code === 'ENOENT' && dir === base) break; throw error; }
            for (const entry of entries) {
                if (entry.name === '.studio-project-cache') continue;
                const target = path.join(dir, entry.name);
                const stat = await lstat(target);
                if (stat.isSymbolicLink()) { complete = false; checks.push({source:'project-file',status:'unverified-link'}); continue; }
                if (stat.isDirectory()) { queue.push(target); continue; }
                if (!entry.name.endsWith('.expressions.json')) continue;
                if (++files > maxFiles || (bytes += stat.size) > maxBytes) throw new Error('Project audit budget exceeded.');
                try { const project = JSON.parse(await readFile(target, 'utf8')); if (![1,2].includes(project?.version) || !Array.isArray(project.tiles)) throw new Error('Unknown project schema'); collect(project); }
                catch { complete = false; checks.push({source:'project-file',status:'unreadable'}); }
            }
        }
    } catch { complete = false; checks.push({source:'project-files',status:'incomplete'}); }
    return { complete, files, references:[...references], checks, checkedAt:Date.now() };
}

export function expressionProjects(root) {
    const base = path.join(root, 'Projects', 'Expressions');
    const resolve = async (relative = '') => {
        const parts = relative.split('/');
        if (relative && parts.some(part => !part || /[<>:"\\|?*\x00-\x1f]/.test(part) || part === '.' || part === '..' || /[. ]$/.test(part)))
            throw new Error('Choose a valid project folder.');
        for (const location of [path.dirname(base), base]) {
            try {
                if ((await lstat(location)).isSymbolicLink()) throw new Error('Linked project roots are unsupported.');
            } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        await mkdir(base, { recursive: true });
        let target = base;
        for (const part of relative ? parts : []) {
            target = path.join(target, part);
            try { if ((await lstat(target)).isSymbolicLink()) throw new Error('Linked project folders are unsupported.'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        return target;
    };
    return async (body) => {
        if (body.action === 'audit') return auditExpressionProjects(root);
        const folder = String(body.folder ?? '');
        const directory = await resolve(folder);
        const cache = path.join(directory, '.studio-project-cache');
        try { if ((await lstat(cache)).isSymbolicLink()) throw new Error('Linked project cache is unsupported.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const summaryPath = target => path.join(cache, path.basename(target) + '.json');
        const coverPath = target => path.join(cache, path.basename(target) + '.cover');
        const indexProject = async (target, project, cover) => {
            await mkdir(cache, { recursive:true });
            const stat = await lstat(target);
            const reference = typeof cover === 'string' ? cover : project.reference;
            const preview = typeof reference === 'string' && reference.length <= 300_000 && /^data:image\/(png|jpeg|webp);base64,/.test(reference) ? reference : '';
            const summary = { file:path.basename(target), name:String(project.name ?? path.basename(target)), count:project.tiles?.filter(tile => tile.image).length ?? 0, total:project.tiles?.length ?? 0, hasReference:Boolean(project.reference), modified:stat.mtimeMs, size:stat.size };
            await writeFile(coverPath(target), preview);
            await writeFile(summaryPath(target), JSON.stringify(summary));
            return summary;
        };
        const projectPath = async () => {
            const name = String(body.file ?? '');
            if (path.basename(name) !== name || !name.endsWith('.expressions.json')) throw new Error('Choose an expression project.');
            return resolve([folder, name].filter(Boolean).join('/'));
        };
        const writeProject = async (target, project) => {
            const temporary = path.join(directory, `.${randomUUID()}.tmp`);
            try {
                await writeFile(temporary, JSON.stringify(project), { flag: 'wx' });
                await rename(temporary, target);
            } finally { await unlink(temporary).catch(() => {}); }
        };
        if (body.action === 'mkdir') {
            await mkdir(directory, { recursive: true });
        } else if (body.action === 'save') {
            const id = String(body.id);
            if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid project ID.');
            const project = body.project;
            if (![1,2].includes(project?.version) || !Array.isArray(project?.tiles)) throw new Error('Invalid expression project.');
            await mkdir(directory, { recursive: true });
            const target = path.join(directory, `${id}.expressions.json`);
            await writeProject(target, project);
            await indexProject(target, project, body.cover);
        } else if (body.action === 'rename') {
            const target = await projectPath();
            const name = String(body.name ?? '').trim().slice(0,120);
            if (!name) throw new Error('Enter a project name.');
            const project = JSON.parse(await readFile(target, 'utf8'));
            project.name = name;
            await writeProject(target, project);
            const previousCover = await readFile(coverPath(target),'utf8').catch(() => undefined);
            await indexProject(target,project,previousCover);
        } else if (body.action === 'delete') {
            const target = await projectPath();
            await unlink(target);
            await Promise.all([unlink(summaryPath(target)).catch(() => {}),unlink(coverPath(target)).catch(() => {})]);
        } else if (body.action === 'inspect') {
            const target = await projectPath();
            const project = JSON.parse(await readFile(target,'utf8'));
            return { summary:await indexProject(target,project), reference:typeof project.reference === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(project.reference) ? project.reference : '' };
        } else if (body.action === 'cache-cover') {
            const target = await projectPath();
            const preview = String(body.cover ?? '');
            if ((await lstat(target)).mtimeMs !== body.modified) return {};
            if (preview.length > 300_000 || !/^data:image\/(png|jpeg|webp);base64,/.test(preview)) throw new Error('Invalid cover preview.');
            await writeFile(coverPath(target), preview);
            return {};
        } else if (body.action === 'cover') {
            return { reference:await readFile(coverPath(await projectPath()),'utf8').catch(() => '') };
        } else if (body.action === 'open') {
            const target = await projectPath();
            return { project: JSON.parse(await readFile(target, 'utf8')) };
        }
        const entries = await readdir(directory, { withFileTypes: true });
        const projects = [];
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.expressions.json')) {
                try {
                    const target = path.join(directory,entry.name);
                    const stat = await lstat(target);
                    const summary = await readFile(summaryPath(target),'utf8').then(JSON.parse).catch(() => undefined);
                    projects.push(summary && summary.modified === stat.mtimeMs && summary.size === stat.size
                        ? summary : { file:entry.name,name:entry.name.replace(/\.expressions\.json$/,''),count:0,total:0,hasReference:false,modified:stat.mtimeMs,needsIndex:true });
                } catch { /* An incomplete external file can be repaired independently. */ }
            }
        }
        projects.sort((a,b) => b.modified - a.modified);
        return { folder, root: base, folders: entries.filter(entry => entry.isDirectory() && entry.name !== '.studio-project-cache').map(entry => entry.name).sort(), projects };
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--stdio') {
    try {
        const chunks = [];
        let size = 0;
        for await (const chunk of process.stdin) {
            size += chunk.length;
            if (size > 192 * 1024 * 1024) throw new Error('Project is too large.');
            chunks.push(chunk);
        }
        process.stdout.write(JSON.stringify(await expressionProjects(process.argv[3])(JSON.parse(Buffer.concat(chunks).toString('utf8')))));
    } catch (error) {
        process.stderr.write(error.message);
        process.exitCode = 1;
    }
}
