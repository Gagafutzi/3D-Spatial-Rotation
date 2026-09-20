/* ================================================================
 * BLOCK SHAPE CORE
 *
 * This is the reference copy and the one the tests run against:
 *
 *     node blocks.test.js    rotation canonicalisation, round invariants
 *
 * The same code is embedded verbatim inside index.html
 * (minus the module.exports block),
 * because the trainer ships as a single self-contained file. Change
 * this copy first, re-run the suite, then run:
 *
 *     node sync-cores.js
 *
 * Pure logic, no Three.js.
 *
 * A "shape" here is a polycube: a set of unit cells on the integer
 * lattice, grown as a self-avoiding walk. Two shapes are the same
 * answer when one can be rotated onto the other, which is a stricter
 * test than comparing the walks that produced them — the same solid
 * can be reached by different paths, and a path's mirror image is
 * sometimes rotationally identical to the path itself.
 *
 * That last case is why this file exists. Before it, a round could
 * present a shape and its mirror as a "distinct" pair when the shape
 * happened to be achiral, which makes the stated answer wrong.
 * ================================================================ */


const MIN_ROUND_SIZE = 2;

const MAX_ROUND_SIZE = 6;


function clampRoundSize(count) {

    const n = Math.round(Number(count));

    if (!Number.isFinite(n)) {
        return MAX_ROUND_SIZE;
    }

    return Math.max(
        MIN_ROUND_SIZE,
        Math.min(MAX_ROUND_SIZE, n)
    );
}


/* ================================================================
 * ROTATION GROUP OF THE CUBE
 * ================================================================ */

/*
 * Each rotation is an axis permutation plus a sign per axis. Of the
 * 48 such maps, the 24 with determinant +1 are the rotations; the
 * other 24 include a reflection and would make mirror images compare
 * equal, which is exactly what the drill is testing.
 */

function permutationSign(perm) {

    let sign = 1;

    for (let i = 0; i < perm.length; i++) {
        for (let j = i + 1; j < perm.length; j++) {
            if (perm[i] > perm[j]) {
                sign = -sign;
            }
        }
    }

    return sign;
}


function buildRotations() {

    const perms = [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0]
    ];

    const signs = [
        [1, 1, 1],
        [1, 1, -1],
        [1, -1, 1],
        [1, -1, -1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, 1],
        [-1, -1, -1]
    ];

    const out = [];

    perms.forEach(
        perm => {
            signs.forEach(
                sign => {

                    const det =
                        permutationSign(perm) *
                        sign[0] * sign[1] * sign[2];

                    if (det === 1) {
                        out.push({ perm, sign });
                    }
                }
            );
        }
    );

    return out;
}


const ROTATIONS = buildRotations();


/*
 * One rotation, then a translation back to the origin corner, then a
 * sorted listing of the cells. The smallest such listing over all 24
 * rotations is a canonical name for the solid: two shapes are the
 * same answer if and only if their keys match.
 *
 * The listing is sorted as strings rather than numerically. Any fixed
 * order gives a canonical form, and the comparison between rotations
 * uses the same order, so nothing depends on which one it is.
 */

function canonicalPathKey(path) {

    let best = null;

    for (let r = 0; r < ROTATIONS.length; r++) {

        const rotation = ROTATIONS[r];

        const moved = new Array(path.length);

        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;

        for (let i = 0; i < path.length; i++) {

            const cell = path[i];

            const x = rotation.sign[0] * cell[rotation.perm[0]];
            const y = rotation.sign[1] * cell[rotation.perm[1]];
            const z = rotation.sign[2] * cell[rotation.perm[2]];

            moved[i] = [x, y, z];

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;
        }

        const key = moved
            .map(
                cell =>
                    (cell[0] - minX) + ',' +
                    (cell[1] - minY) + ',' +
                    (cell[2] - minZ)
            )
            .sort()
            .join(';');

        if (best === null || key < best) {
            best = key;
        }
    }

    return best;
}


function sameUnderRotation(a, b) {
    return canonicalPathKey(a) === canonicalPathKey(b);
}


function mirrorPath(path) {
    return path.map(
        cell => [-cell[0], cell[1], cell[2]]
    );
}


/* A shape whose mirror image cannot be rotated onto it. Only a chiral
   shape makes an honest "these two are different" distractor. */
function isChiralPath(path) {
    return !sameUnderRotation(path, mirrorPath(path));
}


/* ================================================================
 * PATH GENERATION
 * ================================================================ */

const AXES = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
];


function generateComplexPath(numBlocks, rng = Math.random) {

    const positions = [
        [0, 0, 0]
    ];

    let currentPos = [0, 0, 0];

    let currentDir = AXES[Math.floor(rng() * AXES.length)];

    /* The walk can paint itself into a corner and restart from an
       earlier cell; the guard stops a fully enclosed shape from
       spinning forever rather than returning short. */
    let guard = 0;

    while (positions.length < numBlocks && guard++ < numBlocks * 200) {

        const segLength = Math.floor(rng() * 2) + 1;

        for (
            let i = 0;
            i < segLength && positions.length < numBlocks;
            i++
        ) {

            const candidate = [
                currentPos[0] + currentDir[0],
                currentPos[1] + currentDir[1],
                currentPos[2] + currentDir[2]
            ];

            const taken = positions.some(
                p =>
                    p[0] === candidate[0] &&
                    p[1] === candidate[1] &&
                    p[2] === candidate[2]
            );

            if (taken) {
                break;
            }

            currentPos = candidate;

            positions.push([...currentPos]);
        }

        const occupied = new Set(
            positions.map(p => p.join(','))
        );

        const availableDirections = AXES.filter(
            a => {

                const next = [
                    currentPos[0] + a[0],
                    currentPos[1] + a[1],
                    currentPos[2] + a[2]
                ];

                return !occupied.has(next.join(','));
            }
        );

        /* Prefer a turn, so the shapes read as three-dimensional
           rather than as long straight rods. */
        const orthos = availableDirections.filter(
            a =>
                (
                    a[0] * currentDir[0] +
                    a[1] * currentDir[1] +
                    a[2] * currentDir[2]
                ) === 0
        );

        const candidates = orthos.length
            ? orthos
            : availableDirections;

        if (!candidates.length) {

            const restart = positions[
                Math.floor(rng() * positions.length)
            ];

            currentPos = [...restart];

            currentDir = AXES[Math.floor(rng() * AXES.length)];

            continue;
        }

        currentDir = candidates[
            Math.floor(rng() * candidates.length)
        ];
    }

    return positions;
}


/* A shape whose mirror image is a genuinely different solid, so the
   round always has its mirror distractor available. */
function generateChiralPath(numBlocks, rng = Math.random) {

    let fallback = null;

    for (let attempt = 0; attempt < 40; attempt++) {

        const path = generateComplexPath(numBlocks, rng);

        if (!fallback) {
            fallback = path;
        }

        if (isChiralPath(path)) {
            return path;
        }
    }

    /* Three or four blocks can genuinely have no chiral arrangement.
       The round still works; it just loses the mirror distractor. */
    return fallback;
}


function shuffle(list, rng) {

    const out = list.slice();

    for (let i = out.length - 1; i > 0; i--) {

        const j = Math.floor(rng() * (i + 1));

        const swap = out[i];

        out[i] = out[j];

        out[j] = swap;
    }

    return out;
}


/* ================================================================
 * ROUND GENERATION
 * ================================================================ */

/*
 * The partner for a two-shape round that the player must call
 * "different". The mirror image is the distractor worth training
 * against, but only when the shape is actually chiral.
 */

function pairDistractor(target, targetKey, numBlocks, rng) {

    const mirror = mirrorPath(target);

    const mirrorIsDistinct =
        canonicalPathKey(mirror) !== targetKey;

    if (mirrorIsDistinct && rng() < 0.7) {
        return { path: mirror, role: 'mirror' };
    }

    for (let attempt = 0; attempt < 60; attempt++) {

        const other = generateComplexPath(numBlocks, rng);

        if (canonicalPathKey(other) !== targetKey) {
            return { path: other, role: 'distinct' };
        }
    }

    if (mirrorIsDistinct) {
        return { path: mirror, role: 'mirror' };
    }

    return null;
}


/*
 * Build one round of `count` block shapes.
 *
 * At three or more, exactly two entries are the same solid and every
 * other entry is distinct from them and from each other. At two the
 * round is a true/false pair instead, and `verdict` carries the
 * answer: true means the two really are one shape shown twice.
 */

function generateBlocksRound(numBlocks, rng = Math.random, count = MAX_ROUND_SIZE) {

    const size = clampRoundSize(count);

    for (let attempt = 0; attempt < 60; attempt++) {

        const target = size === 2
            ? generateChiralPath(numBlocks, rng)
            : generateComplexPath(numBlocks, rng);

        const targetKey = canonicalPathKey(target);

        if (size === 2) {

            const verdict = rng() < 0.5;

            if (verdict) {

                return {
                    size,
                    verdict,
                    targetKey,
                    entries: [
                        { path: target, role: 'target' },
                        { path: target, role: 'target' }
                    ]
                };
            }

            const partner = pairDistractor(
                target,
                targetKey,
                numBlocks,
                rng
            );

            if (!partner) {
                continue;
            }

            return {
                size,
                verdict,
                targetKey,
                entries: shuffle(
                    [
                        { path: target, role: 'target' },
                        { path: partner.path, role: partner.role }
                    ],
                    rng
                )
            };
        }

        const entries = [
            { path: target, role: 'target' },
            { path: target, role: 'target' }
        ];

        const seen = new Set([targetKey]);

        const offer = (path, role) => {

            if (entries.length >= size) {
                return;
            }

            const key = canonicalPathKey(path);

            if (seen.has(key)) {
                return;
            }

            seen.add(key);

            entries.push({ path, role });
        };

        /* The target's own mirror goes in first: it is the distractor
           the drill is about, and a short round must not drop it. */
        offer(mirrorPath(target), 'mirror');

        let guard = 0;

        while (entries.length < size && guard++ < 200) {

            const other = generateComplexPath(numBlocks, rng);

            offer(other, 'distinct');

            offer(mirrorPath(other), 'mirror');
        }

        if (entries.length !== size) {
            continue;
        }

        return {
            size,
            verdict: null,
            targetKey,
            entries: shuffle(entries, rng)
        };
    }

    return null;
}


module.exports = {
    MIN_ROUND_SIZE,
    MAX_ROUND_SIZE,
    clampRoundSize,
    ROTATIONS,
    canonicalPathKey,
    sameUnderRotation,
    mirrorPath,
    isChiralPath,
    generateComplexPath,
    generateChiralPath,
    generateBlocksRound
};
