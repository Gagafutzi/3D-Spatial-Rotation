const C = require('./chem.js');

let failures = 0;
let checks = 0;

function check(name, condition, detail) {
    checks++;
    if (condition) {
        console.log(`  ok   ${name}`);
    } else {
        failures++;
        console.log(`  FAIL ${name}${detail ? '  -> ' + detail : ''}`);
    }
}

function eq(name, actual, expected) {
    check(
        name,
        JSON.stringify(actual) === JSON.stringify(expected),
        `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`
    );
}


/* ----------------------------------------------------------------
 * 1. Sign convention anchor: (R)-glyceraldehyde
 *
 * Built directly from the Fischer projection of D-glyceraldehyde,
 * which is (R):
 *
 *        CHO          vertical bonds point AWAY from viewer
 *         |
 *   H --- C --- OH    horizontal bonds point TOWARD viewer
 *         |
 *       CH2OH
 * ---------------------------------------------------------------- */

console.log('\n(R)-glyceraldehyde from Fischer projection');

function glyceraldehyde() {

    const g = C.createGraph();
    const pos = {};

    const centre = C.addAtom(g, 'C');
    pos[centre] = [0, 0, 0];

    const oh = C.attachGroup(g, centre, 'OH');
    const cho = C.attachGroup(g, centre, 'CHO');
    const ch2oh = C.attachGroup(g, centre, 'CH2OH');
    const h = C.attachGroup(g, centre, 'H');

    pos[cho] = [0, 1, -0.5];
    pos[ch2oh] = [0, -1, -0.5];
    pos[oh] = [1, 0, 0.5];
    pos[h] = [-1, 0, 0.5];

    return { g, pos, centre, oh, cho, ch2oh, h };
}

const gly = glyceraldehyde();
const glyResult = C.descriptorAt(gly.g, gly.centre, gly.pos);

check('all four ligands rank without a tie', glyResult !== null);

eq(
    'CIP order is OH > CHO > CH2OH > H',
    glyResult.order,
    [gly.oh, gly.cho, gly.ch2oh, gly.h]
);

eq('descriptor is R', glyResult.descriptor, 'R');


/* Mirroring x must flip it to S. */

const glyMirror = {};
Object.keys(gly.pos).forEach(k => {
    const p = gly.pos[k];
    glyMirror[k] = [-p[0], p[1], p[2]];
});

eq(
    'mirror image is S',
    C.descriptorAt(gly.g, gly.centre, glyMirror).descriptor,
    'S'
);


/* ----------------------------------------------------------------
 * 2. CIP ordering on a halogenated centre: Br is absent from the
 *    library, so use Cl > SH > F > OH > NH2 > COOH > CH2OH > CH3 > H
 * ---------------------------------------------------------------- */

console.log('\nCIP ranking of the substituent library');

function rankGroups(keys) {

    const g = C.createGraph();
    const centre = C.addAtom(g, 'C');

    const attached = keys.map(k => ({
        key: k,
        atom: C.attachGroup(g, centre, k)
    }));

    const ordered = C.rankLigands(g, centre);

    if (!ordered) {
        return null;
    }

    return ordered.map(
        branch => attached.find(a => a.atom === branch.atom).key
    );
}

eq(
    'Cl > OH > CH3 > H',
    rankGroups(['Cl', 'OH', 'CH3', 'H']),
    ['Cl', 'OH', 'CH3', 'H']
);

eq(
    'SH > F > NH2 > H  (S=16 beats F=9 beats N=7)',
    rankGroups(['F', 'SH', 'NH2', 'H']),
    ['SH', 'F', 'NH2', 'H']
);

eq(
    'OH > COOH > CH2OH > CH3  (duplicated O outranks single O)',
    rankGroups(['CH3', 'COOH', 'OH', 'CH2OH']),
    ['OH', 'COOH', 'CH2OH', 'CH3']
);

eq(
    'COOH > CHO > CN > CH3',
    rankGroups(['CH3', 'CN', 'CHO', 'COOH']),
    ['COOH', 'CHO', 'CN', 'CH3']
);

check(
    'two identical groups tie, so no stereocentre',
    rankGroups(['CH3', 'CH3', 'OH', 'H']) === null
);


/* ----------------------------------------------------------------
 * 3. Tartaric acid: HOOC-CH(OH)-CH(OH)-COOH
 * ---------------------------------------------------------------- */

console.log('\ntartaric acid');

const tartaric = cfg => ({
    caps: ['COOH', 'COOH'],
    subs: ['OH', 'OH'],
    config: cfg
});

const RR = tartaric(['R', 'R']);
const SS = tartaric(['S', 'S']);
const RS = tartaric(['R', 'S']);
const SR = tartaric(['S', 'R']);

check('constitution is symmetric', C.isSymmetricConstitution(RR));

eq('(R,S) and (S,R) are the SAME compound (meso)',
    C.canonicalKey(RS), C.canonicalKey(SR));

check('(R,S) is meso', C.isMeso(RS));
check('(R,R) is not meso', !C.isMeso(RR));
check('(R,R) is chiral', C.isChiral(RR));
check('meso form is achiral', !C.isChiral(RS));

eq('(R,R) and (S,S) are enantiomers',
    C.relationship(RR, SS), 'enantiomer');

eq('(R,R) and meso are diastereomers',
    C.relationship(RR, RS), 'diastereomer');

eq('meso is its own mirror image',
    C.canonicalKey(C.enantiomerOf(RS)), C.canonicalKey(RS));

eq('tartaric acid has exactly 3 stereoisomers',
    C.stereoisomersOf(RR).length, 3);


/* Threonine-like asymmetric constitution has 4. */

const asym = {
    caps: ['COOH', 'CH3'],
    subs: ['NH2', 'OH'],
    config: ['R', 'R']
};

eq('asymmetric constitution has 4 stereoisomers',
    C.stereoisomersOf(asym).length, 4);

check('asymmetric constitution is never meso',
    C.stereoisomersOf(asym).every(s => !C.isMeso(s)));


/* ----------------------------------------------------------------
 * 4. Geometry round-trip: what we ask for is what gets built
 * ---------------------------------------------------------------- */

console.log('\ngeometry round-trip');

const roundTripSpecs = [
    tartaric(['R', 'R']),
    tartaric(['S', 'S']),
    tartaric(['R', 'S']),
    { caps: ['COOH', 'CH3'], subs: ['NH2', 'OH'], config: ['R', 'S'] },
    { caps: ['CHO', 'CH2OH'], subs: ['OH', 'Cl'], config: ['S', 'R'] },
    { caps: ['CN', 'COOH'], subs: ['SH', 'NH2'], config: ['R', 'R'] }
];

roundTripSpecs.forEach(spec => {

    const mol = C.buildMolecule(spec);

    if (!mol) {
        check(`built ${C.canonicalKey(spec)}`, false, 'returned null');
        return;
    }

    eq(
        `built ${spec.caps[0]}-C(${spec.subs[0]})-C(${spec.subs[1]})-${spec.caps[1]} as ${spec.config.join(',')}`,
        mol.descriptors,
        spec.config
    );
});


/* Mirroring the built geometry must invert both centres. */

const rrMol = C.buildMolecule(tartaric(['R', 'R']));

const mirrored = {};
Object.keys(rrMol.positions).forEach(k => {
    const p = rrMol.positions[k];
    mirrored[k] = [-p[0], p[1], p[2]];
});

eq(
    'mirrored (R,R)-tartaric acid reads as (S,S)',
    [
        C.descriptorAt(rrMol.graph, rrMol.c2, mirrored).descriptor,
        C.descriptorAt(rrMol.graph, rrMol.c3, mirrored).descriptor
    ],
    ['S', 'S']
);


/* ----------------------------------------------------------------
 * 5. Rotation invariance: descriptors must not depend on pose
 * ---------------------------------------------------------------- */

console.log('\nrotation invariance');

function rotate(pos, ax, ay, az) {

    const out = {};

    const rx = [
        [1, 0, 0],
        [0, Math.cos(ax), -Math.sin(ax)],
        [0, Math.sin(ax), Math.cos(ax)]
    ];
    const ry = [
        [Math.cos(ay), 0, Math.sin(ay)],
        [0, 1, 0],
        [-Math.sin(ay), 0, Math.cos(ay)]
    ];
    const rz = [
        [Math.cos(az), -Math.sin(az), 0],
        [Math.sin(az), Math.cos(az), 0],
        [0, 0, 1]
    ];

    const apply = (m, v) => [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
    ];

    Object.keys(pos).forEach(k => {
        out[k] = apply(rz, apply(ry, apply(rx, pos[k])));
    });

    return out;
}

let rotationStable = true;

for (let i = 0; i < 200; i++) {

    const rp = rotate(
        rrMol.positions,
        Math.random() * 7,
        Math.random() * 7,
        Math.random() * 7
    );

    const d = [
        C.descriptorAt(rrMol.graph, rrMol.c2, rp).descriptor,
        C.descriptorAt(rrMol.graph, rrMol.c3, rp).descriptor
    ];

    if (d[0] !== 'R' || d[1] !== 'R') {
        rotationStable = false;
        break;
    }
}

check('200 random rotations all still read (R,R)', rotationStable);


/* ----------------------------------------------------------------
 * 6. Library sweep: every scaffold we might ship must produce two
 *    genuine, unambiguously ranked stereocentres.
 * ---------------------------------------------------------------- */

console.log('\nlibrary sweep');

const CAPS = ['COOH', 'CH3', 'CH2OH', 'CHO', 'CN'];
const SUBS = ['OH', 'NH2', 'Cl', 'F', 'SH', 'CH3'];

let viable = 0;
let rejected = 0;
let mismatched = 0;

CAPS.forEach(c0 => CAPS.forEach(c1 => {
    SUBS.forEach(s0 => SUBS.forEach(s1 => {

        ['R', 'S'].forEach(a => ['R', 'S'].forEach(b => {

            const spec = {
                caps: [c0, c1],
                subs: [s0, s1],
                config: [a, b]
            };

            const mol = C.buildMolecule(spec);

            if (!mol) {
                rejected++;
                return;
            }

            viable++;

            if (
                mol.descriptors[0] !== a ||
                mol.descriptors[1] !== b
            ) {
                mismatched++;
            }
        }));
    }));
}));

console.log(`  swept ${viable + rejected} scaffolds: ${viable} viable, ${rejected} rejected as non-stereogenic`);

check('no viable scaffold reports the wrong descriptor', mismatched === 0,
    `${mismatched} mismatches`);

check('a useful number of scaffolds survive', viable > 200, `only ${viable}`);


console.log(`\n${checks - failures}/${checks} checks passed`);

process.exit(failures ? 1 : 0);
