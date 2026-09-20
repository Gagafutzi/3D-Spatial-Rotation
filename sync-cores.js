/*
 * Copy the tested logic cores into index.html.
 *
 * The trainer ships as one self-contained file, so chem.js and
 * blocks.js each exist twice: once as a CommonJS module the test
 * suites can require, and once inline in the page. Porting that by
 * hand is how the two copies drift, and a drifted copy means the
 * tests are no longer testing what the page runs.
 *
 * Usage:
 *
 *     node sync-cores.js          rewrite index.html from the modules
 *     node sync-cores.js --check  fail if they have drifted apart
 *
 * The inline regions are delimited in index.html by the markers
 * below. Everything between them is generated; edit the module.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const PAGE = path.join(ROOT, 'index.html');

const INDENT = ' '.repeat(8);

const CORES = [
    { file: 'blocks.js', marker: 'blocks.js', exports: 'return' },
    { file: 'chem.js', marker: 'chem.js', exports: 'strip' }
];


/*
 * Remove the CommonJS plumbing. `return` keeps the export object as
 * the value of the wrapping IIFE in the page, which is what stops the
 * two cores colliding over shared helper names; `strip` drops it
 * entirely for the core that is spliced in at page scope.
 */

function stripExports(source, mode) {

    const lines = source.split('\n');

    const out = [];

    let skipping = false;

    lines.forEach(
        line => {

            if (skipping) {
                if (line === '};') skipping = false;
                return;
            }

            if (line.startsWith('module.exports = {')) {

                if (mode === 'return') {
                    out.push(line.replace('module.exports =', 'return'));
                    return;
                }

                skipping = true;
                return;
            }

            if (line.startsWith('module.exports')) {
                return;
            }

            out.push(line);
        }
    );

    return out.join('\n').replace(/\n+$/, '\n');
}


function indent(source) {
    return source
        .split('\n')
        .map(line => (line.trim() === '' ? '' : INDENT + line))
        .join('\n');
}


function regionPattern(marker) {
    return new RegExp(
        '([ \\t]*/\\* >>> begin ' + marker + ' <<< \\*/\\n)' +
        '[\\s\\S]*?' +
        '(^[ \\t]*/\\* >>> end ' + marker + ' <<< \\*/)',
        'm'
    );
}


function main() {

    const check = process.argv.includes('--check');

    let page = fs.readFileSync(PAGE, 'utf8');

    let changed = false;

    CORES.forEach(
        core => {

            const source = fs.readFileSync(
                path.join(ROOT, core.file),
                'utf8'
            );

            const body = indent(stripExports(source, core.exports));

            const pattern = regionPattern(core.marker);

            if (!pattern.test(page)) {
                console.error(`index.html has no "${core.marker}" region`);
                process.exit(2);
            }

            const next = page.replace(
                pattern,
                (whole, open, close) => open + body + '\n' + close
            );

            if (next !== page) {
                changed = true;
                console.log(
                    `${check ? 'drifted' : 'synced '}  ${core.file}`
                );
            } else {
                console.log(`in sync  ${core.file}`);
            }

            page = next;
        }
    );

    if (check) {
        if (changed) {
            console.error('\nindex.html is out of date: run node sync-cores.js');
            process.exit(1);
        }
        console.log('\nindex.html matches the modules');
        return;
    }

    if (changed) {
        fs.writeFileSync(PAGE, page);
    }
}


main();
