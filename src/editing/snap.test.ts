import {
  snapPoint,
  snapTranslation,
  sourcesFromBounds,
  type AxisTarget,
  type SnapSettings,
  type SnapSpace,
  type SnapTargets,
} from "./snap";

const ax = (...values: number[]): AxisTarget[] => values.map((value) => ({ value }));

const identity: SnapSpace = {
  worldToScreen: (x, y) => ({ x, y }),
  screenToWorld: (x, y) => ({ x, y }),
};

const settings: SnapSettings = {
  enabled: true,
  tolerancePx: 8,
  grid: true,
  stage: false,
  stageMidpoints: false,
  bounds: true,
  boundsMidpoints: true,
  geometry: false,
  selfGeometry: false,
};

function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) throw new Error(`${name}: got ${String(got)}, want ${String(want)}`);
}

function close(name: string, got: number, want: number, eps = 1e-6): void {
  if (Math.abs(got - want) > eps) {
    throw new Error(`${name}: got ${got}, want ${want}`);
  }
}

{
  const targets: SnapTargets = { xs: [], ys: [], points: [], gridSpacing: 100 };
  const hit = snapPoint({ x: 4, y: 50 }, targets, identity, settings);
  close("grid x", hit.x, 0);
  close("grid y unchanged", hit.y, 50);
  eq("grid guide x", hit.guides.some((g) => g.axis === "x" && g.world === 0), true);
}

{
  const targets: SnapTargets = { xs: [], ys: [], points: [], gridSpacing: 100 };
  const miss = snapPoint({ x: 20, y: 50 }, targets, identity, settings);
  close("grid reject x", miss.x, 20);
  close("grid reject y", miss.y, 50);
}

{
  const sources = sourcesFromBounds({ x: 100, y: 40, width: 50, height: 20 });
  const targets: SnapTargets = {
    xs: ax(0, 50, 108),
    ys: ax(0, 40),
    points: [],
    gridSpacing: 0,
  };
  const moved = snapTranslation(sources, { x: 0, y: 0 }, targets, identity, {
    ...settings,
    grid: false,
  });
  close("box dx", moved.dx, 8);
  close("box dy", moved.dy, 0);
}

{
  const sources = sourcesFromBounds({ x: 100, y: 40, width: 50, height: 20 });
  const targets: SnapTargets = {
    xs: ax(80),
    ys: [],
    points: [],
    gridSpacing: 0,
  };
  const miss = snapTranslation(sources, { x: 0, y: 0 }, targets, identity, {
    ...settings,
    grid: false,
    tolerancePx: 8,
  });
  close("tolerance reject dx", miss.dx, 0);
}

{
  const off = snapPoint({ x: 4, y: 4 }, { xs: [], ys: [], points: [], gridSpacing: 100 }, identity, {
    ...settings,
    enabled: false,
  });
  close("disabled x", off.x, 4);
  close("disabled y", off.y, 4);
}

{
  const sources = { xs: [100], ys: [50], points: [] };
  const targets: SnapTargets = {
    xs: [
      { value: 106, lo: 40, hi: 60 },
      { value: 102, lo: 400, hi: 420 },
    ],
    ys: [],
    points: [],
    gridSpacing: 0,
  };
  const moved = snapTranslation(sources, { x: 0, y: 0 }, targets, identity, {
    ...settings,
    grid: false,
  });
  close("near feature wins dx", moved.dx, 6);
  eq("near feature marked", moved.guides[0]?.at?.x === 106, true);
}

console.log("snap tests ok");
