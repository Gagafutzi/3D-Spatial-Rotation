const C = require('./chem.js');

let failures = 0, checks = 0;
function check(name, ok, detail) {
    checks++;
    if (ok) console.log(`  ok   ${name}`);
    else { failures++; console.log(`  FAIL ${name}${detail ? '  -> ' + detail : ''}`); }
}

console.log('\npair-matching rounds, all levels, 400 rounds each');

for (let level = 0; level <= 10; level++) {

    let bad = 0, nulls = 0, mesoRounds = 0, roles = {};

    for (let i = 0; i < 400; i++) {

        const round = C.generateMoleculeRound(level);

        if (!round) { nulls++; continue; }

        if (round.entries.length !== 6) { bad++; continue; }

        // exactly two entries are the target compound
        const matching = round.entries.filter(
            e => C.canonicalKey(e.spec) === round.targetKey
        );
        if (matching.length !== 2) { bad++; continue; }

        // every entry must have built geometry with correct descriptors
        for (const e of round.entries) {
            if (!e.molecule) { bad++; break; }
            if (e.molecule.descriptors.join() !== e.spec.config.join()) { bad++; break; }
        }

        // no two NON-target entries may be the same compound as each other
        const keys = round.entries.map(e => C.canonicalKey(e.spec));
        const counts = {};
        keys.forEach(k => counts[k] = (counts[k] || 0) + 1);
        const dupes = Object.entries(counts).filter(([k, n]) => n > 1);
        if (dupes.length !== 1 || dupes[0][0] !== round.targetKey) { bad++; }

        if (C.isMeso(round.target)) mesoRounds++;
        round.entries.forEach(e => roles[e.role] = (roles[e.role] || 0) + 1);
    }

    check(
        `level ${level}: 400 valid rounds`,
        bad === 0 && nulls === 0,
        `${bad} malformed, ${nulls} null`
    );

    if (level === 0 || level === 6 || level === 10) {
        console.log(`         roles: ${JSON.stringify(roles)}  meso targets: ${mesoRounds}`);
    }
}

console.log('\nmeso traps only appear at high levels');

function mesoRate(level) {
    let n = 0;
    for (let i = 0; i < 300; i++) {
        const r = C.generateMoleculeRound(level);
        if (r && C.isMeso(r.target)) n++;
    }
    return n / 300;
}

const lowMeso = mesoRate(0);
const highMeso = mesoRate(8);
check(`level 0 has no meso targets (${(lowMeso * 100).toFixed(0)}%)`, lowMeso === 0);
check(`level 8 does have meso targets (${(highMeso * 100).toFixed(0)}%)`, highMeso > 0.1);

console.log('\nenantiomer distractor is present whenever the target is chiral');
{
    let missing = 0, total = 0;
    for (let level = 0; level <= 10; level++) {
        for (let i = 0; i < 200; i++) {
            const r = C.generateMoleculeRound(level);
            if (!r || C.isMeso(r.target)) continue;
            total++;
            if (!r.entries.some(e => e.role === 'enantiomer')) missing++;
        }
    }
    check(`every chiral-target round contains its enantiomer (${total} rounds)`, missing === 0, `${missing} missing`);
}

console.log('\nR/S questions');
{
    let bad = 0, nulls = 0, dist = { R: 0, S: 0 };
    for (let level = 0; level <= 10; level++) {
        for (let i = 0; i < 300; i++) {
            const q = C.generateRsQuestion(level);
            if (!q) { nulls++; continue; }
            dist[q.answer]++;
            if (q.priorityOrder.length !== 4) { bad++; continue; }
            // recompute independently from geometry
            const again = C.descriptorAt(q.molecule.graph, q.centreAtom, q.molecule.positions);
            if (!again || again.descriptor !== q.answer) bad++;
        }
    }
    check('3300 R/S questions all well formed', bad === 0 && nulls === 0, `${bad} bad, ${nulls} null`);
    check(`R and S roughly balanced (R=${dist.R}, S=${dist.S})`,
        Math.abs(dist.R - dist.S) / (dist.R + dist.S) < 0.1);
}

console.log('\nrender spec');
{
    const r = C.generateMoleculeRound(3);
    const rs = C.renderSpec(r.entries[0].molecule);
    check('8 labelled spheres', rs.atoms.length === 8, `got ${rs.atoms.length}`);
    check('7 bonds', rs.bonds.length === 7, `got ${rs.bonds.length}`);
    check('2 stereocentres', rs.stereocentres.length === 2);
    check('every atom has a position', rs.atoms.every(a => a.pos && a.pos.length === 3));
    check('every atom has a label', rs.atoms.every(a => typeof a.label === 'string' && a.label));
    check('every bond has endpoints', rs.bonds.every(b => b.from && b.to));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
