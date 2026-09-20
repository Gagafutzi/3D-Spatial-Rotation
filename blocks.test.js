const B = require('./blocks.js');

let failures = 0, checks = 0;
function check(name, ok, detail) {
    checks++;
    if (ok) console.log(`  ok   ${name}`);
    else { failures++; console.log(`  FAIL ${name}${detail ? '  -> ' + detail : ''}`); }
}

/* ----------------------------------------------------------------
 * The rotation group itself
 * ---------------------------------------------------------------- */

console.log('\nrotation group of the cube');
{
    check('24 rotations', B.ROTATIONS.length === 24, `got ${B.ROTATIONS.length}`);

    // Applying every rotation to a chiral marker must give 24 distinct results.
    const marker = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]];
    const images = new Set(
        B.ROTATIONS.map(r =>
            marker
                .map(c => [
                    r.sign[0] * c[r.perm[0]],
                    r.sign[1] * c[r.perm[1]],
                    r.sign[2] * c[r.perm[2]]
                ])
                .map(c => c.join(','))
                .sort()
                .join(';')
        )
    );
    check('all 24 rotations are distinct maps', images.size === 24, `got ${images.size}`);

    // No rotation may turn a left hand into a right hand.
    const key = B.canonicalPathKey(marker);
    const mirrorKey = B.canonicalPathKey(B.mirrorPath(marker));
    check('the chiral tetracube differs from its mirror', key !== mirrorKey);
}

console.log('\ncanonical keys');
{
    const path = B.generateComplexPath(12);

    // Rotating a shape must not change its key.
    let stable = 0;
    const key = B.canonicalPathKey(path);
    B.ROTATIONS.forEach(r => {
        const turned = path.map(c => [
            r.sign[0] * c[r.perm[0]],
            r.sign[1] * c[r.perm[1]],
            r.sign[2] * c[r.perm[2]]
        ]);
        if (B.canonicalPathKey(turned) === key) stable++;
    });
    check('key survives all 24 rotations', stable === 24, `${stable}/24`);

    // Nor may translating it.
    const shifted = path.map(c => [c[0] + 7, c[1] - 3, c[2] + 11]);
    check('key survives translation', B.canonicalPathKey(shifted) === key);

    // A straight rod is achiral; an L in one plane is too.
    check('a rod is its own mirror', !B.isChiralPath([[0, 0, 0], [1, 0, 0], [2, 0, 0]]));
    check('a flat L is its own mirror', !B.isChiralPath([[0, 0, 0], [1, 0, 0], [1, 1, 0]]));

    // Mirroring twice is the identity.
    check('double mirror is the original',
        B.canonicalPathKey(B.mirrorPath(B.mirrorPath(path))) === key);

    // Different cell counts can never match.
    check('different sizes never match',
        !B.sameUnderRotation([[0, 0, 0]], [[0, 0, 0], [1, 0, 0]]));
}

/* ----------------------------------------------------------------
 * Rounds of every size
 * ---------------------------------------------------------------- */

console.log('\nblock rounds, sizes 3-6, every difficulty');

for (let size = 3; size <= 6; size++) {

    let bad = 0, nulls = 0, short = 0, dupes = 0, noMirror = 0, rounds = 0;

    for (let level = 0; level <= 10; level++) {

        const numBlocks = Math.min(10 + level * 2, 30);

        for (let i = 0; i < 60; i++) {

            const round = B.generateBlocksRound(numBlocks, Math.random, size);

            if (!round) { nulls++; continue; }
            rounds++;

            if (round.entries.length !== size) { short++; continue; }

            // Every shape must be built from the right number of cells.
            if (round.entries.some(e => e.path.length !== numBlocks)) bad++;

            const keys = round.entries.map(e => B.canonicalPathKey(e.path));

            // Exactly two entries are the target solid...
            const matching = keys.filter(k => k === round.targetKey).length;
            if (matching !== 2) { bad++; continue; }

            // ...and they are the two flagged as the target.
            const flagged = round.entries.filter(e => e.role === 'target').length;
            if (flagged !== 2) { bad++; continue; }

            // No two non-target entries may be the same solid as each other.
            const counts = {};
            keys.forEach(k => counts[k] = (counts[k] || 0) + 1);
            const repeated = Object.entries(counts).filter(([, n]) => n > 1);
            if (repeated.length !== 1 || repeated[0][0] !== round.targetKey) dupes++;

            // Anything labelled a mirror must really be one.
            round.entries.forEach(e => {
                if (e.role !== 'mirror') return;
                const back = B.canonicalPathKey(B.mirrorPath(e.path));
                if (!keys.includes(back)) noMirror++;
            });
        }
    }

    check(
        `size ${size}: ${rounds} rounds, exactly two matching shapes`,
        bad === 0 && nulls === 0 && short === 0,
        `${bad} malformed, ${nulls} null, ${short} short`
    );

    check(
        `size ${size}: distractors are all distinct solids`,
        dupes === 0,
        `${dupes} rounds with a repeated distractor`
    );

    check(
        `size ${size}: mirror entries really are mirrors`,
        noMirror === 0,
        `${noMirror} mislabelled`
    );
}

/* ----------------------------------------------------------------
 * The two-shape true/false round
 * ---------------------------------------------------------------- */

console.log('\ntwo-shape true/false rounds');
{
    let wrongVerdict = 0, nulls = 0, short = 0, trueCount = 0, total = 0;

    for (let level = 0; level <= 10; level++) {

        const numBlocks = Math.min(10 + level * 2, 30);

        for (let i = 0; i < 200; i++) {

            const round = B.generateBlocksRound(numBlocks, Math.random, 2);

            if (!round) { nulls++; continue; }
            total++;

            if (round.entries.length !== 2) { short++; continue; }

            // The stated answer must match the geometry, independently
            // recomputed. This is the whole contract of the mode.
            const actuallySame = B.sameUnderRotation(
                round.entries[0].path,
                round.entries[1].path
            );

            if (actuallySame !== round.verdict) wrongVerdict++;

            if (round.verdict) trueCount++;
        }
    }

    check(
        `${total} pairs: stated verdict matches the geometry`,
        wrongVerdict === 0 && nulls === 0 && short === 0,
        `${wrongVerdict} lying, ${nulls} null, ${short} short`
    );

    const rate = trueCount / total;
    check(
        `true and false roughly balanced (${(rate * 100).toFixed(0)}% true)`,
        rate > 0.4 && rate < 0.6
    );
}

console.log('\nsmall shapes, where chirality can be impossible');
{
    // Three blocks can only make a rod or a flat L, both achiral. The
    // generator must still produce an honest pair rather than claiming
    // a shape and its mirror are different.
    let wrongVerdict = 0, nulls = 0;

    for (let numBlocks = 3; numBlocks <= 6; numBlocks++) {
        for (let i = 0; i < 300; i++) {
            const round = B.generateBlocksRound(numBlocks, Math.random, 2);
            if (!round) { nulls++; continue; }
            const actuallySame = B.sameUnderRotation(
                round.entries[0].path,
                round.entries[1].path
            );
            if (actuallySame !== round.verdict) wrongVerdict++;
        }
    }

    check('tiny shapes still give honest verdicts', wrongVerdict === 0 && nulls === 0,
        `${wrongVerdict} lying, ${nulls} null`);
}

console.log('\nround size is clamped, not trusted');
{
    check('0 clamps up to 2', B.clampRoundSize(0) === 2);
    check('99 clamps down to 6', B.clampRoundSize(99) === 6);
    check('garbage falls back to 6', B.clampRoundSize('x') === 6);
    check('2.4 rounds to 2', B.clampRoundSize(2.4) === 2);

    const round = B.generateBlocksRound(12, Math.random, 99);
    check('an out-of-range request still builds a legal round', round.entries.length === 6);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
