/* ================================================================
 * STEREOCHEMISTRY CORE
 *
 * This is the reference copy and the one the tests run against:
 *
 *     node chem.test.js     CIP ranking, R/S, meso, geometry
 *     node round.test.js    round generation invariants
 *
 * The same code is embedded verbatim inside index.html
 * (minus the module.exports block),
 * because the trainer ships as a single self-contained file. Change
 * this copy first, re-run both suites, then port the change across.
 *
 * Pure logic, no Three.js. Kept free of rendering concerns so it
 * can be unit tested in isolation.
 *
 * Scaffold used throughout:
 *
 *     cap0 -- C2(sub0)(H) -- C3(sub1)(H) -- cap1
 *
 * C2 and C3 are the two stereocentres. Everything is acyclic,
 * which keeps the CIP digraph a finite tree.
 * ================================================================ */

const Z = {
    H: 1,
    C: 6,
    N: 7,
    O: 8,
    F: 9,
    S: 16,
    Cl: 17
};


/*
 * Substituent library.
 *
 * `atoms` / `bonds` describe the REAL atomic graph and are what CIP
 * ranking sees. Atom 0 is the attachment point.
 *
 * `label` / `color` / `radius` are presentation only: the renderer
 * draws each group as a single labelled sphere, the way exam
 * diagrams do, because full atomistic detail is unreadable while
 * the molecule is spinning.
 */

const GROUPS = {

    H: {
        label: 'H',
        color: 0xe2e8f0,
        radius: 0.30,
        atoms: ['H'],
        bonds: []
    },

    OH: {
        label: 'OH',
        color: 0xef4444,
        radius: 0.42,
        atoms: ['O', 'H'],
        bonds: [[0, 1, 1]]
    },

    NH2: {
        label: 'NH2',
        color: 0x3b82f6,
        radius: 0.44,
        atoms: ['N', 'H', 'H'],
        bonds: [[0, 1, 1], [0, 2, 1]]
    },

    F: {
        label: 'F',
        color: 0x22d3ee,
        radius: 0.36,
        atoms: ['F'],
        bonds: []
    },

    Cl: {
        label: 'Cl',
        color: 0x22c55e,
        radius: 0.50,
        atoms: ['Cl'],
        bonds: []
    },

    SH: {
        label: 'SH',
        color: 0xeab308,
        radius: 0.50,
        atoms: ['S', 'H'],
        bonds: [[0, 1, 1]]
    },

    CH3: {
        label: 'CH3',
        color: 0x94a3b8,
        radius: 0.44,
        atoms: ['C', 'H', 'H', 'H'],
        bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]]
    },

    CH2OH: {
        label: 'CH2OH',
        color: 0xa855f7,
        radius: 0.48,
        atoms: ['C', 'H', 'H', 'O', 'H'],
        bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [3, 4, 1]]
    },

    COOH: {
        label: 'COOH',
        color: 0xf97316,
        radius: 0.52,
        atoms: ['C', 'O', 'O', 'H'],
        bonds: [[0, 1, 2], [0, 2, 1], [2, 3, 1]]
    },

    CHO: {
        label: 'CHO',
        color: 0xfb7185,
        radius: 0.48,
        atoms: ['C', 'O', 'H'],
        bonds: [[0, 1, 2], [0, 2, 1]]
    },

    CN: {
        label: 'CN',
        color: 0x6366f1,
        radius: 0.46,
        atoms: ['C', 'N'],
        bonds: [[0, 1, 3]]
    }
};


/* ================================================================
 * MOLECULE GRAPH
 * ================================================================ */

function createGraph() {

    return {
        el: [],
        bonds: [],
        adj: []
    };
}


function addAtom(g, element) {

    g.el.push(element);
    g.adj.push([]);

    return g.el.length - 1;
}


function addBond(g, a, b, order = 1) {

    const id = g.bonds.length;

    g.bonds.push({ a, b, order });

    g.adj[a].push(id);
    g.adj[b].push(id);

    return id;
}


function attachGroup(g, hostAtom, groupKey) {

    const spec = GROUPS[groupKey];

    const base = [];

    spec.atoms.forEach(
        element => {
            base.push(addAtom(g, element));
        }
    );

    spec.bonds.forEach(
        ([a, b, order]) => {
            addBond(g, base[a], base[b], order);
        }
    );

    addBond(g, hostAtom, base[0], 1);

    return base[0];
}


/* ================================================================
 * CIP RANKING
 *
 * Hierarchical digraph, Rule 1a (atomic number) with Rule 1b
 * duplicate atoms for multiple bonds. Duplicates are terminal
 * phantoms. Branches are compared sphere by sphere; within a
 * sphere, each node's children are pre-sorted by the same
 * comparator.
 *
 * The ligand set above is small enough that every real comparison
 * resolves within a couple of spheres. Anything that does NOT
 * resolve returns a tie, and callers treat a tie as "not a
 * stereocentre" and discard the scaffold, so an unranked centre can
 * never reach the screen.
 * ================================================================ */

const MAX_CIP_DEPTH = 12;


function cipChildren(g, node) {

    if (node.dup) {
        return [];
    }

    const out = [];

    g.adj[node.atom].forEach(
        bondId => {

            const bond = g.bonds[bondId];

            const other =
                bond.a === node.atom
                    ? bond.b
                    : bond.a;

            if (bondId === node.viaBond) {

                /*
                 * The bond we arrived through still contributes its
                 * duplicate atoms (Rule 1b), just not a real child.
                 */

                for (let k = 1; k < bond.order; k++) {
                    out.push({ z: Z[g.el[other]], dup: true });
                }

                return;
            }

            out.push({
                z: Z[g.el[other]],
                atom: other,
                viaBond: bondId,
                dup: false
            });

            for (let k = 1; k < bond.order; k++) {
                out.push({ z: Z[g.el[other]], dup: true });
            }
        }
    );

    return out;
}


function sortedCipChildren(g, node, depth) {

    const kids = cipChildren(g, node);

    kids.sort(
        (x, y) => compareCip(g, x, y, depth + 1)
    );

    return kids;
}


/*
 * Returns < 0 when `a` outranks `b`, > 0 when `b` outranks `a`,
 * 0 when the two branches are indistinguishable.
 */

function compareCip(g, a, b, depth = 0) {

    if (a.z !== b.z) {
        return b.z - a.z;
    }

    if (depth >= MAX_CIP_DEPTH) {
        return 0;
    }

    const ca = sortedCipChildren(g, a, depth);
    const cb = sortedCipChildren(g, b, depth);

    const n = Math.max(ca.length, cb.length);

    /*
     * Compare the whole sphere on atomic number before descending,
     * so a difference close to the centre always wins.
     */

    for (let i = 0; i < n; i++) {

        const za = i < ca.length ? ca[i].z : 0;
        const zb = i < cb.length ? cb[i].z : 0;

        if (za !== zb) {
            return zb - za;
        }
    }

    for (let i = 0; i < n; i++) {

        if (i >= ca.length || i >= cb.length) {
            break;
        }

        const r = compareCip(g, ca[i], cb[i], depth + 1);

        if (r !== 0) {
            return r;
        }
    }

    return 0;
}


/*
 * Rank the four ligands of `centre`.
 *
 * Returns null when any two branches tie, i.e. the atom is not a
 * genuine stereocentre.
 */

function rankLigands(g, centre) {

    const branches = g.adj[centre].map(
        bondId => {

            const bond = g.bonds[bondId];

            const other =
                bond.a === centre
                    ? bond.b
                    : bond.a;

            return {
                z: Z[g.el[other]],
                atom: other,
                viaBond: bondId,
                dup: false
            };
        }
    );

    if (branches.length !== 4) {
        return null;
    }

    const ordered = branches
        .slice()
        .sort((x, y) => compareCip(g, x, y));

    for (let i = 0; i < ordered.length - 1; i++) {

        if (compareCip(g, ordered[i], ordered[i + 1]) === 0) {
            return null;
        }
    }

    return ordered;
}


/* ================================================================
 * R / S FROM GEOMETRY
 *
 * Sign convention anchored on (R)-glyceraldehyde built from its
 * Fischer projection; see chem.test.js. With v1..v3 the unit
 * vectors from the centre to priorities 1..3:
 *
 *     v1 . (v2 x v3) < 0  ->  R
 *     v1 . (v2 x v3) > 0  ->  S
 * ================================================================ */

function sub3(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}


function cross3(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}


function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}


function norm3(a) {

    const L = Math.hypot(a[0], a[1], a[2]) || 1;

    return [a[0] / L, a[1] / L, a[2] / L];
}


/*
 * `positions` maps atom index -> [x, y, z].
 */

function descriptorAt(g, centre, positions) {

    const ordered = rankLigands(g, centre);

    if (!ordered) {
        return null;
    }

    const c = positions[centre];

    const v = ordered.map(
        branch => norm3(sub3(positions[branch.atom], c))
    );

    const triple = dot3(v[0], cross3(v[1], v[2]));

    if (Math.abs(triple) < 1e-6) {
        return null;
    }

    return {
        descriptor: triple < 0 ? 'R' : 'S',
        order: ordered.map(b => b.atom)
    };
}


/* ================================================================
 * SCAFFOLD BUILDER
 *
 * Backbone is an ideal zig-zag so the two stereocentres sit in a
 * natural anti conformation.
 * ================================================================ */

const BOND_LEN = 1.5;

const DX = BOND_LEN * Math.cos(Math.PI * 35.26 / 180);
const DY = BOND_LEN * Math.sin(Math.PI * 35.26 / 180);

const TET_COS = Math.cos(Math.PI * 54.735 / 180);
const TET_SIN = Math.sin(Math.PI * 54.735 / 180);


function openDirections(centrePos, neighbourA, neighbourB) {

    const a = norm3(sub3(neighbourA, centrePos));
    const b = norm3(sub3(neighbourB, centrePos));

    const bisector = norm3([
        -(a[0] + b[0]),
        -(a[1] + b[1]),
        -(a[2] + b[2])
    ]);

    const perp = norm3(cross3(a, b));

    return [
        norm3([
            bisector[0] * TET_COS + perp[0] * TET_SIN,
            bisector[1] * TET_COS + perp[1] * TET_SIN,
            bisector[2] * TET_COS + perp[2] * TET_SIN
        ]),
        norm3([
            bisector[0] * TET_COS - perp[0] * TET_SIN,
            bisector[1] * TET_COS - perp[1] * TET_SIN,
            bisector[2] * TET_COS - perp[2] * TET_SIN
        ])
    ];
}


/*
 * Build the scaffold with an explicit swap choice at each centre,
 * then read back the descriptors. `swap` flips which of the two
 * open tetrahedral directions carries the substituent, which
 * inverts that centre.
 */

function buildScaffold(spec, swaps) {

    const g = createGraph();

    const pos = {};

    const cap0Pos = [0 * DX, 0, 0];
    const c2Pos = [1 * DX, DY, 0];
    const c3Pos = [2 * DX, 0, 0];
    const cap1Pos = [3 * DX, DY, 0];

    const c2 = addAtom(g, 'C');
    const c3 = addAtom(g, 'C');

    pos[c2] = c2Pos;
    pos[c3] = c3Pos;

    addBond(g, c2, c3, 1);

    const cap0Atom = attachGroup(g, c2, spec.caps[0]);
    const cap1Atom = attachGroup(g, c3, spec.caps[1]);

    pos[cap0Atom] = cap0Pos;
    pos[cap1Atom] = cap1Pos;

    const centres = [
        {
            atom: c2,
            centrePos: c2Pos,
            neighbours: [cap0Pos, c3Pos],
            sub: spec.subs[0]
        },
        {
            atom: c3,
            centrePos: c3Pos,
            neighbours: [c2Pos, cap1Pos],
            sub: spec.subs[1]
        }
    ];

    const decorated = centres.map(
        (centre, i) => {

            const dirs = openDirections(
                centre.centrePos,
                centre.neighbours[0],
                centre.neighbours[1]
            );

            const subDir = swaps[i] ? dirs[1] : dirs[0];
            const hDir = swaps[i] ? dirs[0] : dirs[1];

            const subAtom = attachGroup(g, centre.atom, centre.sub);
            const hAtom = attachGroup(g, centre.atom, 'H');

            pos[subAtom] = [
                centre.centrePos[0] + subDir[0] * BOND_LEN,
                centre.centrePos[1] + subDir[1] * BOND_LEN,
                centre.centrePos[2] + subDir[2] * BOND_LEN
            ];

            pos[hAtom] = [
                centre.centrePos[0] + hDir[0] * BOND_LEN,
                centre.centrePos[1] + hDir[1] * BOND_LEN,
                centre.centrePos[2] + hDir[2] * BOND_LEN
            ];

            return {
                atom: centre.atom,
                centrePos: centre.centrePos,
                subAtom,
                hAtom,
                subKey: centre.sub,
                capKey: spec.caps[i],
                capAtom: i === 0 ? cap0Atom : cap1Atom,
                capPos: i === 0 ? cap0Pos : cap1Pos
            };
        }
    );

    return {
        graph: g,
        positions: pos,
        c2,
        c3,
        centres: decorated,
        spec
    };
}


/*
 * Build a scaffold whose stereocentres carry exactly the requested
 * descriptors. Returns null when the constitution does not actually
 * make both carbons stereocentres.
 */

function buildMolecule(spec) {

    const wanted = spec.config;

    let built = buildScaffold(spec, [false, false]);

    const probe = [
        descriptorAt(built.graph, built.c2, built.positions),
        descriptorAt(built.graph, built.c3, built.positions)
    ];

    if (!probe[0] || !probe[1]) {
        return null;
    }

    const swaps = [
        probe[0].descriptor !== wanted[0],
        probe[1].descriptor !== wanted[1]
    ];

    built = buildScaffold(spec, swaps);

    const finalDesc = [
        descriptorAt(built.graph, built.c2, built.positions),
        descriptorAt(built.graph, built.c3, built.positions)
    ];

    if (!finalDesc[0] || !finalDesc[1]) {
        return null;
    }

    if (
        finalDesc[0].descriptor !== wanted[0] ||
        finalDesc[1].descriptor !== wanted[1]
    ) {
        return null;
    }

    built.descriptors = [
        finalDesc[0].descriptor,
        finalDesc[1].descriptor
    ];

    built.priorityOrder = {
        [built.c2]: finalDesc[0].order,
        [built.c3]: finalDesc[1].order
    };

    return built;
}


/* ================================================================
 * IDENTITY
 *
 * A molecule can be numbered from either end. Two specs describe
 * the same compound when either reading agrees. This is what makes
 * the meso case fall out correctly: for a symmetric constitution,
 * (R,S) and (S,R) are one and the same achiral compound.
 * ================================================================ */

function canonicalKey(spec) {

    const forward = [
        spec.caps[0],
        spec.subs[0],
        spec.config[0],
        spec.subs[1],
        spec.caps[1],
        spec.config[1]
    ].join('|');

    const reverse = [
        spec.caps[1],
        spec.subs[1],
        spec.config[1],
        spec.subs[0],
        spec.caps[0],
        spec.config[0]
    ].join('|');

    return forward < reverse ? forward : reverse;
}


function constitutionKey(spec) {

    const forward = [
        spec.caps[0], spec.subs[0], spec.subs[1], spec.caps[1]
    ].join('|');

    const reverse = [
        spec.caps[1], spec.subs[1], spec.subs[0], spec.caps[0]
    ].join('|');

    return forward < reverse ? forward : reverse;
}


function isSymmetricConstitution(spec) {

    return (
        spec.caps[0] === spec.caps[1] &&
        spec.subs[0] === spec.subs[1]
    );
}


function invert(descriptor) {
    return descriptor === 'R' ? 'S' : 'R';
}


function enantiomerOf(spec) {

    return {
        caps: spec.caps.slice(),
        subs: spec.subs.slice(),
        config: [invert(spec.config[0]), invert(spec.config[1])]
    };
}


function diastereomersOf(spec) {

    return [
        {
            caps: spec.caps.slice(),
            subs: spec.subs.slice(),
            config: [invert(spec.config[0]), spec.config[1]]
        },
        {
            caps: spec.caps.slice(),
            subs: spec.subs.slice(),
            config: [spec.config[0], invert(spec.config[1])]
        }
    ].filter(
        candidate =>
            canonicalKey(candidate) !== canonicalKey(spec)
    );
}


/*
 * Meso: symmetric constitution and the two centres are opposite.
 * Such a molecule is superimposable on its own mirror image.
 */

function isMeso(spec) {

    return (
        isSymmetricConstitution(spec) &&
        spec.config[0] !== spec.config[1]
    );
}


function isChiral(spec) {
    return !isMeso(spec);
}


/*
 * All distinct stereoisomers of a given constitution.
 */

function stereoisomersOf(spec) {

    const out = [];
    const seen = new Set();

    ['R', 'S'].forEach(
        a => ['R', 'S'].forEach(
            b => {

                const candidate = {
                    caps: spec.caps.slice(),
                    subs: spec.subs.slice(),
                    config: [a, b]
                };

                const key = canonicalKey(candidate);

                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(candidate);
                }
            }
        )
    );

    return out;
}


/*
 * Relationship of `other` to `reference`.
 */

function relationship(reference, other) {

    if (constitutionKey(reference) !== constitutionKey(other)) {
        return 'constitutional';
    }

    if (canonicalKey(reference) === canonicalKey(other)) {
        return 'identical';
    }

    if (canonicalKey(enantiomerOf(reference)) === canonicalKey(other)) {
        return 'enantiomer';
    }

    return 'diastereomer';
}


module.exports = {
    Z,
    GROUPS,
    createGraph,
    addAtom,
    addBond,
    attachGroup,
    compareCip,
    rankLigands,
    descriptorAt,
    buildScaffold,
    buildMolecule,
    canonicalKey,
    constitutionKey,
    isSymmetricConstitution,
    isMeso,
    isChiral,
    enantiomerOf,
    diastereomersOf,
    stereoisomersOf,
    relationship,
    norm3,
    sub3,
    cross3,
    dot3
};


/* ================================================================
 * RENDER SPEC
 *
 * Groups are drawn as single labelled spheres. The backbone
 * carbons are drawn plain so the two stereocentres read as the
 * focus of the molecule.
 * ================================================================ */

const BACKBONE_STYLE = {
    label: 'C',
    color: 0x64748b,
    radius: 0.46
};


function renderSpec(mol) {

    const atoms = [];
    const bonds = [];

    const push = (atomId, style) => {

        atoms.push({
            atomId,
            label: style.label,
            color: style.color,
            radius: style.radius,
            pos: mol.positions[atomId]
        });
    };

    push(mol.c2, BACKBONE_STYLE);
    push(mol.c3, BACKBONE_STYLE);

    bonds.push([mol.c2, mol.c3]);

    mol.centres.forEach(
        centre => {

            push(centre.capAtom, GROUPS[centre.capKey]);
            push(centre.subAtom, GROUPS[centre.subKey]);
            push(centre.hAtom, GROUPS.H);

            bonds.push([centre.atom, centre.capAtom]);
            bonds.push([centre.atom, centre.subAtom]);
            bonds.push([centre.atom, centre.hAtom]);
        }
    );

    return {
        atoms,
        bonds: bonds.map(
            ([a, b]) => ({
                a,
                b,
                from: mol.positions[a],
                to: mol.positions[b]
            })
        ),
        stereocentres: [mol.c2, mol.c3]
    };
}


/* ================================================================
 * ROUND GENERATION
 * ================================================================ */

/*
 * Substituent palettes. "distinct" groups are easy to tell apart at
 * a glance; "similar" ones force the student to actually work out
 * the configuration rather than pattern-match on colour.
 */

const PALETTES = {

    distinct: {
        caps: ['COOH', 'CH3', 'CH2OH', 'CHO'],
        subs: ['OH', 'Cl', 'CH3', 'NH2']
    },

    similar: {
        caps: ['COOH', 'CHO', 'CH2OH', 'CN'],
        subs: ['OH', 'NH2', 'SH', 'F']
    }
};


function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
}


function shuffle(list, rng) {

    const out = list.slice();

    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }

    return out;
}


/*
 * Difficulty tiers. `symmetric` turns on meso-capable
 * constitutions, which is the hardest case because the mirror image
 * of the answer can BE the answer.
 */

function moleculeTier(level) {

    if (level <= 1) {
        return { palette: 'distinct', symmetric: false };
    }

    if (level <= 4) {
        return { palette: 'similar', symmetric: false };
    }

    if (level <= 7) {
        return { palette: 'distinct', symmetric: true };
    }

    return { palette: 'similar', symmetric: true };
}


/*
 * A constitution both of whose carbons are genuine, unambiguously
 * ranked stereocentres.
 */

function randomConstitution(palette, symmetric, rng) {

    for (let attempt = 0; attempt < 200; attempt++) {

        const p = PALETTES[palette];

        let caps;
        let subs;

        if (symmetric) {

            const cap = pick(p.caps, rng);
            const sub = pick(p.subs, rng);

            caps = [cap, cap];
            subs = [sub, sub];

        } else {

            caps = shuffle(p.caps, rng).slice(0, 2);
            subs = shuffle(p.subs, rng).slice(0, 2);
        }

        if (caps[0] === subs[0] || caps[1] === subs[1]) {
            continue;
        }

        const spec = {
            caps,
            subs,
            config: ['R', 'R']
        };

        /*
         * Both carbons must survive CIP ranking, otherwise the
         * "molecule" has no stereochemistry to test.
         */

        if (buildMolecule(spec)) {
            return { caps, subs };
        }
    }

    return null;
}


/*
 * Build one round: six entries, exactly two of which are the same
 * compound.
 */

function generateMoleculeRound(level, rng = Math.random) {

    const tier = moleculeTier(level);

    for (let attempt = 0; attempt < 60; attempt++) {

        const primary = randomConstitution(
            tier.palette,
            tier.symmetric,
            rng
        );

        if (!primary) {
            continue;
        }

        const family = stereoisomersOf({
            caps: primary.caps,
            subs: primary.subs,
            config: ['R', 'R']
        });

        const target = pick(family, rng);
        const targetKey = canonicalKey(target);

        const others = family.filter(
            s => canonicalKey(s) !== targetKey
        );

        const entries = [
            { spec: target, role: 'target' },
            { spec: target, role: 'target' }
        ];

        others.forEach(
            spec => {
                entries.push({
                    spec,
                    role: relationship(target, spec)
                });
            }
        );

        /*
         * Top up from a second constitution. Symmetric
         * constitutions only have three stereoisomers, so they
         * always need this.
         */

        let guard = 0;

        while (entries.length < 6 && guard++ < 60) {

            const secondary = randomConstitution(
                tier.palette,
                rng() < 0.5 ? tier.symmetric : false,
                rng
            );

            if (!secondary) {
                continue;
            }

            if (
                constitutionKey({
                    caps: secondary.caps,
                    subs: secondary.subs,
                    config: ['R', 'R']
                }) === constitutionKey(target)
            ) {
                continue;
            }

            const pool = shuffle(
                stereoisomersOf({
                    caps: secondary.caps,
                    subs: secondary.subs,
                    config: ['R', 'R']
                }),
                rng
            );

            pool.slice(0, 6 - entries.length).forEach(
                spec => {
                    entries.push({
                        spec,
                        role: relationship(target, spec)
                    });
                }
            );
        }

        if (entries.length !== 6) {
            continue;
        }

        /*
         * Hard invariant: exactly the two target slots may be the
         * target compound. Anything else means an unsolvable or
         * ambiguous round, so throw it away and regenerate.
         */

        const matching = entries.filter(
            e => canonicalKey(e.spec) === targetKey
        );

        if (matching.length !== 2) {
            continue;
        }

        const built = entries.map(
            entry => ({
                ...entry,
                molecule: buildMolecule(entry.spec)
            })
        );

        if (built.some(e => !e.molecule)) {
            continue;
        }

        return {
            target,
            targetKey,
            tier,
            entries: shuffle(built, rng)
        };
    }

    return null;
}


/*
 * One molecule, one queried stereocentre, answer is R or S.
 */

function generateRsQuestion(level, rng = Math.random) {

    const tier = moleculeTier(level);

    for (let attempt = 0; attempt < 60; attempt++) {

        const constitution = randomConstitution(
            tier.palette,
            tier.symmetric,
            rng
        );

        if (!constitution) {
            continue;
        }

        const spec = {
            caps: constitution.caps,
            subs: constitution.subs,
            config: [
                rng() < 0.5 ? 'R' : 'S',
                rng() < 0.5 ? 'R' : 'S'
            ]
        };

        const molecule = buildMolecule(spec);

        if (!molecule) {
            continue;
        }

        const index = rng() < 0.5 ? 0 : 1;

        const centreAtom = index === 0
            ? molecule.c2
            : molecule.c3;

        return {
            molecule,
            spec,
            centreAtom,
            centreIndex: index,
            answer: molecule.descriptors[index],
            priorityOrder: molecule.priorityOrder[centreAtom]
        };
    }

    return null;
}


module.exports.renderSpec = renderSpec;
module.exports.moleculeTier = moleculeTier;
module.exports.generateMoleculeRound = generateMoleculeRound;
module.exports.generateRsQuestion = generateRsQuestion;
module.exports.PALETTES = PALETTES;
module.exports.BACKBONE_STYLE = BACKBONE_STYLE;
