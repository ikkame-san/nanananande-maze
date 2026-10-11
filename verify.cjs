'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = {module:{exports:{}}};
new Function('module', script)(context.module);
const engine = context.module.exports;

// Independent geometry: convert odd-row offset coordinates to cube coordinates,
// then connect every pair whose hex distance is one.
const coords = Array.from({length:7}, (_,row) =>
  Array.from({length:row % 2 ? 7 : 8}, (_,col) => {
    const x = col - (row - (row & 1)) / 2, z = row;
    return [x, -x-z, z];
  })).flat();
const adjacent = coords.map((a,i) => coords.flatMap((b,j) =>
  i !== j && Math.max(...a.map((v,k) => Math.abs(v-b[k]))) === 1 ? [j] : []));
const word = Array.from('ななななんで');
function referenceSolve(labels) {
  const visited = new Set([0]);
  const paths = [], path = [0];
  let nodes = 0;
  function visit(cell) {
    assert.ok(++nodes < 2000000, 'Independent solver must finish within its verification budget');
    if (cell === 52) { paths.push([...path]); return; }
    for (const next of adjacent[cell]) {
      if (paths.length >= 2) return;
      if (visited.has(next) || labels[next] !== word[path.length % 6]) continue;
      visited.add(next); path.push(next); visit(next); path.pop(); visited.delete(next);
    }
  }
  if (labels[0] === 'な' && labels[52] === 'で') visit(0);
  return paths;
}
function routeQuality(path) {
  const directions = path.slice(1).map((cell,i) => coords[cell].map((v,k) => v - coords[path[i]][k]).join(','));
  let longest = 1, run = 1, turns = 0;
  for (let i = 1; i < directions.length; i++) {
    if (directions[i] === directions[i-1]) run++;
    else { run = 1; turns++; }
    longest = Math.max(longest,run);
  }
  assert.ok(longest <= 2, 'No more than two consecutive steps may have the same direction');
  assert.ok(turns >= 14, 'The answer must have at least fourteen turns');
  for (let i = 4; i < directions.length; i++) assert.ok(new Set(directions.slice(i-4,i+1)).size >= 3, 'Long two-direction staircases must be rejected');
  return {longest,turns};
}
assert.equal(engine.COLS,8); assert.equal(engine.ROWS,7); assert.equal(engine.COUNT,53);
assert.deepEqual([...engine.ROW_LENGTHS],[8,7,8,7,8,7,8]);
for (let i = 0; i < 53; i++) {
  assert.deepEqual([...engine.neighbors[i]].sort((a,b) => a-b), adjacent[i].sort((a,b) => a-b));
  assert.equal(engine.cells[i].row,coords[i][2]);
  assert.equal(engine.cells[i].col,coords[i][0]+Math.floor(coords[i][2]/2));
}
assert.equal(engine.fallback.labels.length, 53);
assert.equal(engine.fallback.path.length, 36);
assert.equal(referenceSolve(engine.fallback.labels).length, 1);
assert.deepEqual(referenceSolve(engine.fallback.labels)[0], [...engine.fallback.path]);
routeQuality(engine.fallback.path);
assert.equal(engine.solve(engine.fallback.labels, 2, 1).complete, false, 'A limited search must never claim uniqueness');
const impossible = Array(53).fill('な'); impossible[52] = 'で';
assert.equal(referenceSolve(impossible).length, 0);
assert.equal(engine.solve(impossible).solutions.length, 0);

const seeds = [0, 0xffffffff, 0x80000000, 4166525038, 1686651825, 1537131591, ...Array.from({length:150}, (_,i) => i+1)];
const boards = new Set(), routes = new Set();
let maxTime = 0, maxStraightSteps = 0, minTurns = Infinity, touchingRoutes = 0;
const start = performance.now();
for (const seed of seeds) {
  const before = performance.now(), puzzle = engine.generate(seed);
  maxTime = Math.max(maxTime, performance.now() - before);
  assert.equal(puzzle.labels.length, 53);
  assert.equal(puzzle.labels[0], 'な'); assert.equal(puzzle.labels[52], 'で');
  assert.equal(puzzle.path.length, 36);
  assert.equal(new Set(puzzle.path).size, puzzle.path.length);
  puzzle.path.forEach((cell,i) => {
    assert.equal(puzzle.labels[cell], word[i % 6]);
    if (i) assert.ok(adjacent[cell].includes(puzzle.path[i-1]));
  });
  const answers = referenceSolve(puzzle.labels);
  assert.equal(answers.length, 1, `Seed ${seed} must have exactly one answer`);
  assert.deepEqual(answers[0], [...puzzle.path]);
  const quality = routeQuality(answers[0]);
  // A unique answer may run alongside or fold back against an earlier section.
  // Check geometry independently so the former non-touching restriction cannot
  // silently return through candidate selection or fallback behavior.
  if (puzzle.path.some((cell,i) => puzzle.path.slice(i+2).some(next => adjacent[cell].includes(next)))) touchingRoutes++;
  maxStraightSteps = Math.max(maxStraightSteps,quality.longest); minTurns = Math.min(minTurns,quality.turns);
  boards.add(puzzle.labels.join('')); routes.add(puzzle.path.join(','));
  if (seed % 25 === 0) console.log(`Verified seed ${seed}`);
}
assert.equal(boards.size, seeds.length, 'Different seeds should produce different boards in this sample');
assert.ok(routes.size > 20, 'Randomization must vary the answer route as well as the decoy letters');
assert.ok(touchingRoutes >= seeds.length * .8, 'Most sampled answers must allow nonconsecutive route cells to touch');
const a = engine.generate(42), b = engine.generate(42);
assert.deepEqual([...a.labels], [...b.labels]); assert.deepEqual([...a.path], [...b.path]);
console.log(JSON.stringify({status:'PASS', boards:boards.size, uniqueRoutes:routes.size, touchingRoutes, maxStraightSteps, minTurns, seconds:((performance.now()-start)/1000).toFixed(1), slowestGenerationMs:Math.round(maxTime)}, null, 2));
