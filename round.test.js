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

/* ----------------------------------------------------------------
 * Shorter rounds (the board-size setting)
 * ---------------------------------------------------------------- */

console.log('\nrounds of 3 to 5 molecules');

for (let size = 3; size <= 5; size++) {

    let bad = 0, nulls = 0, wrongSize = 0, missingEnantiomer = 0, chiral = 0;

    for (let level = 0; level <= 10; level++) {
        for (let i = 0; i < 120; i++) {

            const round = C.generateMoleculeRound(level, Math.random, null, size);

            if (!round) { nulls++; continue; }
            if (round.entries.length !== size) { wrongSize++; continue; }
            if (round.size !== size) { bad++; continue; }

            // Exactly two entries are the target compound, same as a full round.
            const keys = round.entries.map(e => C.canonicalKey(e.spec));
            if (keys.filter(k => k === round.targetKey).length !== 2) { bad++; continue; }

            // No two non-target entries may be the same compound.
            const counts = {};
            keys.forEach(k => counts[k] = (counts[k] || 0) + 1);
            const repeated = Object.entries(counts).filter(([, n]) => n > 1);
            if (repeated.length !== 1 || repeated[0][0] !== round.targetKey) { bad++; continue; }

            // Geometry has to agree with the spec every entry claims.
            for (const e of round.entries) {
                if (!e.molecule) { bad++; break; }
                if (e.molecule.descriptors.join() !== e.spec.config.join()) { bad++; break; }
            }

            // A short round must still spend one of its few slots on the
            // enantiomer, which is the distractor the drill is about.
            if (!C.isMeso(round.target)) {
                chiral++;
                if (!round.entries.some(e => e.role === 'enantiomer')) missingEnantiomer++;
            }
        }
    }

    check(
        `size ${size}: rounds are well formed`,
        bad === 0 && nulls === 0 && wrongSize === 0,
        `${bad} malformed, ${nulls} null, ${wrongSize} wrong size`
    );

    check(
        `size ${size}: every chiral-target round keeps its enantiomer (${chiral} rounds)`,
        missingEnantiomer === 0,
        `${missingEnantiomer} missing`
    );
}

/* ----------------------------------------------------------------
 * The two-molecule true/false round
 * ---------------------------------------------------------------- */

console.log('\ntwo-molecule true/false rounds');
{
    let lying = 0, nulls = 0, wrongSize = 0, trueCount = 0, total = 0, badGeometry = 0;
    const roles = {};

    for (let level = 0; level <= 10; level++) {
        for (let i = 0; i < 200; i++) {

            const round = C.generateMoleculeRound(level, Math.random, null, 2);

            if (!round) { nulls++; continue; }
            total++;

            if (round.entries.length !== 2 || round.size !== 2) { wrongSize++; continue; }

            // The stated answer must match the chemistry, recomputed here
            // rather than taken from the generator's own bookkeeping.
            const [a, b] = round.entries;
            const actuallySame = C.canonicalKey(a.spec) === C.canonicalKey(b.spec);

            if (actuallySame !== round.verdict) lying++;
            if (round.verdict) trueCount++;

            for (const e of round.entries) {
                if (!e.molecule) { badGeometry++; break; }
                if (e.molecule.descriptors.join() !== e.spec.config.join()) { badGeometry++; break; }
            }

            round.entries.forEach(e => roles[e.role] = (roles[e.role] || 0) + 1);
        }
    }

    check(
        `${total} pairs: stated verdict matches the chemistry`,
        lying === 0 && nulls === 0 && wrongSize === 0,
        `${lying} lying, ${nulls} null, ${wrongSize} wrong size`
    );

    check('every pair builds real geometry', badGeometry === 0, `${badGeometry} bad`);

    const rate = trueCount / total;
    check(`true and false roughly balanced (${(rate * 100).toFixed(0)}% true)`,
        rate > 0.4 && rate < 0.6);

    // A "different" pair that is always a different constitution would be
    // answerable by reading the group labels alone.
    const stereo = (roles.enantiomer || 0) + (roles.diastereomer || 0);
    const constitutional = roles.constitutional || 0;
    check(
        `most "different" pairs are stereoisomers, not different compounds ` +
        `(${stereo} vs ${constitutional})`,
        stereo > constitutional
    );

    console.log(`         roles: ${JSON.stringify(roles)}`);
}

{
    // Pooled pairs stay inside the pool, same as the larger rounds.
    const pool = { caps: ['COOH', 'CHO', 'CH2OH'], subs: ['OH', 'NH2'] };
    let offPool = 0, lying = 0, total = 0;

    for (let i = 0; i < 600; i++) {
        const round = C.generateMoleculeRound(5, Math.random, pool, 2);
        if (!round) continue;
        const [a, b] = round.entries;
        if ((C.canonicalKey(a.spec) === C.canonicalKey(b.spec)) !== round.verdict) lying++;
        round.entries.forEach(e => {
            total++;
            const inPool =
                pool.caps.includes(e.spec.caps[0]) && pool.caps.includes(e.spec.caps[1]) &&
                pool.subs.includes(e.spec.subs[0]) && pool.subs.includes(e.spec.subs[1]);
            if (!inPool) offPool++;
        });
    }

    check(`pooled pairs stay inside the pool (${total} checked)`, offPool === 0, `${offPool} off-pool`);
    check('pooled pairs still tell the truth', lying === 0, `${lying} lying`);
}

{
    check('0 clamps up to 2', C.clampRoundSize(0) === 2);
    check('99 clamps down to 6', C.clampRoundSize(99) === 6);
    check('garbage falls back to 6', C.clampRoundSize(undefined) === 6);

    const round = C.generateMoleculeRound(3, Math.random, null, 99);
    check('an out-of-range request still builds a legal round', round.entries.length === 6);

    const defaulted = C.generateMoleculeRound(3);
    check('the default round is still six', defaulted.entries.length === 6);
}


/* ----------------------------------------------------------------
 * Custom group pools (the settings panel's group picker)
 * ---------------------------------------------------------------- */

console.log('\ncustom group pools');
{
    // A pool the user might pick: oxygen/nitrogen only, no halogens.
    const pool = { caps: ['COOH', 'CHO', 'CH2OH'], subs: ['OH', 'NH2'] };

    let bad = 0, nulls = 0, offPool = 0, total = 0;

    for (let level = 0; level <= 10; level++) {
        for (let i = 0; i < 150; i++) {
            const r = C.generateMoleculeRound(level, Math.random, pool);
            if (!r) { nulls++; continue; }
            if (r.entries.filter(e => C.canonicalKey(e.spec) === r.targetKey).length !== 2) bad++;
            r.entries.forEach(e => {
                total++;
                const inPool =
                    pool.caps.includes(e.spec.caps[0]) && pool.caps.includes(e.spec.caps[1]) &&
                    pool.subs.includes(e.spec.subs[0]) && pool.subs.includes(e.spec.subs[1]);
                if (!inPool) offPool++;
            });
        }
    }

    check('pooled rounds are all well formed', bad === 0 && nulls === 0, `${bad} bad, ${nulls} null`);
    check(`every molecule uses only pooled groups (${total} checked)`, offPool === 0, `${offPool} off-pool`);
}

{
    // A pool too small to build an asymmetric constitution from must
    // degrade to the tier's own set rather than failing to generate.
    const tiny = { caps: ['COOH'], subs: ['OH'] };

    let nulls = 0;
    for (let level = 0; level <= 10; level++) {
        for (let i = 0; i < 100; i++) {
            if (!C.generateMoleculeRound(level, Math.random, tiny)) nulls++;
        }
    }
    check('an unusably small pool still generates rounds', nulls === 0, `${nulls} null`);

    const resolved = C.resolvePool('distinct', false, tiny);
    check('under-sized pool falls back per dimension',
        resolved.caps.length >= 2 && resolved.subs.length >= 2,
        JSON.stringify(resolved));

    const symResolved = C.resolvePool('distinct', true, tiny);
    check('symmetric constitutions accept a single-group pool',
        symResolved.caps.length === 1 && symResolved.subs.length === 1,
        JSON.stringify(symResolved));
}

{
    // R/S questions honour the pool too, and stay independently verifiable.
    const pool = { caps: ['CN', 'COOH'], subs: ['SH', 'Cl'] };
    let bad = 0, offPool = 0;
    for (let i = 0; i < 400; i++) {
        const q = C.generateRsQuestion(4, Math.random, pool);
        if (!q) { bad++; continue; }
        const again = C.descriptorAt(q.molecule.graph, q.centreAtom, q.molecule.positions);
        if (!again || again.descriptor !== q.answer) bad++;
        if (!pool.subs.includes(q.spec.subs[0]) || !pool.caps.includes(q.spec.caps[0])) offPool++;
    }
    check('400 pooled R/S questions verify from geometry', bad === 0, `${bad} bad`);
    check('pooled R/S questions stay inside the pool', offPool === 0, `${offPool} off-pool`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
